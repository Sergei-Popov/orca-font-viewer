// The viewer: a header with the font's name, badges and (for collections) a face picker, three
// tabs, and the loaded FontFace that every `.fv-face` element draws with.

import { defaultSample } from '../describe'
import { FontError } from '../font/bytes'
import { loadBrotliDictionary } from '../font/brotli-dictionary'
import { type FontContainer, needsBrotliDictionary, openFont } from '../font/container'
import { type FaceInfo, type TableCache, describeFace, faceLabels, newTableCache } from '../font/info'
import { type Language, type Strings, fill } from '../i18n'
import { icon } from '../icons'
import { axesFor, faceStyle, fontMime, renderSource } from '../render'
import { CharactersTab } from './characters'
import { h, html } from './dom'
import { InfoTab } from './info'
import { DEFAULT_LINE_HEIGHT, DEFAULT_SIZE, PreviewTab } from './preview'

export type TabId = 'preview' | 'characters' | 'info'
const TABS: TabId[] = ['preview', 'characters', 'info']

type Loaded = {
  bytes: Uint8Array
  container: FontContainer
  /** Picker labels of a collection's faces (names only); empty for a single font. */
  labels: string[]
  /** Faces described so far: only the ones the person has looked at. */
  infos: Map<number, FaceInfo>
  /** Parsed tables shared between faces. */
  cache: TableCache
  /** FontFace family per face index, or the reason it failed. */
  drawn: Map<number, { family: string } | { error: string }>
}

let serial = 0

/** FontFaceSet is set-like; the DOM lib types its add/delete only with DOM.Iterable. */
const fonts = document.fonts as unknown as { add(face: FontFace): unknown; delete(face: FontFace): boolean }

export class App {
  readonly root = h('div', { class: 'fv-app' })
  private readonly header = h('header', { class: 'fv-header' })
  private readonly tabBar = h('div', { class: 'fv-tabs', role: 'tablist' })
  private readonly notice = h('div', { class: 'fv-notice fv-hidden', role: 'status' })
  private readonly body = h('div', { class: 'fv-body' })
  private readonly message = h('div', { class: 'fv-message fv-hidden' })
  /** A message over the tabs for a collection face that cannot be shown; the picker stays. */
  private readonly faceMessage = h('div', { class: 'fv-message error fv-hidden' })
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>()
  private readonly preview: PreviewTab
  private readonly characters: CharactersTab
  private readonly info: InfoTab
  private tab: TabId
  private faceIndex = 0
  private loaded: Loaded | null = null
  private fontFaces: FontFace[] = []
  /** Faces of the previous file, kept until the new file draws so a reload does not flash. */
  private staleFaces: FontFace[] = []
  private family: string | null = null
  private loadToken = 0
  /** Rises with each document Orca sends; a WOFF 2.0 file waiting for the dictionary checks it. */
  private documentVersion = 0

  constructor(
    private readonly strings: Strings,
    private readonly language: Language,
    initialTab: TabId = 'preview'
  ) {
    this.tab = initialTab
    const host = { strings, language, onStyleChange: () => this.applyStyle() }
    this.preview = new PreviewTab(host, {
      size: DEFAULT_SIZE,
      lineHeight: DEFAULT_LINE_HEIGHT,
      sample: null,
      axes: new Map(),
      features: new Map()
    })
    this.characters = new CharactersTab(host, { query: '', block: '', selected: null })
    this.info = new InfoTab(host)

    for (const id of TABS) {
      const label = { preview: strings.tabPreview, characters: strings.tabCharacters, info: strings.tabInfo }[id]
      const button = h(
        'button',
        { class: 'fv-tab', type: 'button', role: 'tab', id: `fv-tab-${id}`, 'aria-controls': `fv-panel-${id}` },
        label
      )
      button.addEventListener('click', () => this.selectTab(id))
      button.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
        if (!step) return
        event.preventDefault()
        const next = TABS[(TABS.indexOf(this.tab) + step + TABS.length) % TABS.length]
        this.selectTab(next)
        this.tabButtons.get(next)?.focus()
      })
      this.tabButtons.set(id, button)
      this.tabBar.append(button)
    }
    const panels: [TabId, HTMLElement][] = [
      ['preview', this.preview.root],
      ['characters', this.characters.root],
      ['info', this.info.root]
    ]
    for (const [id, panel] of panels) {
      panel.id = `fv-panel-${id}`
      panel.setAttribute('aria-labelledby', `fv-tab-${id}`)
      this.body.append(panel)
    }
    this.body.append(this.faceMessage)
    this.root.append(this.header, this.tabBar, this.notice, this.body, this.message)
    this.selectTab(this.tab)
  }

  /** A whole-page message: loading, or an error with an icon. */
  showMessage(title: string, detail?: string, kind: 'info' | 'error' = 'info'): void {
    this.message.className = `fv-message${kind === 'error' ? ' error' : ''}`
    this.message.replaceChildren()
    if (kind === 'error') this.message.append(html('div', {}, icon('error')))
    this.message.append(h('h2', {}, title))
    if (detail) this.message.append(h('p', {}, detail))
  }

  /** Reads a font file (a new one, or the same file written again) and shows it. */
  load(bytes: Uint8Array): void {
    const version = ++this.documentVersion
    if (!needsBrotliDictionary(bytes)) {
      this.open(bytes)
      return
    }
    // The first WOFF 2.0 file loads the Brotli dictionary; a document that arrives meanwhile wins.
    loadBrotliDictionary().then(
      () => {
        if (version === this.documentVersion) this.open(bytes)
      },
      (error: unknown) => {
        if (version === this.documentVersion) this.fail(error)
      }
    )
  }

  private open(bytes: Uint8Array): void {
    const s = this.strings
    let container: FontContainer
    try {
      container = openFont(bytes)
    } catch (error) {
      this.fail(error)
      return
    }
    const cache = newTableCache()
    // Labels for the face picker, under one budget for all faces ("#n" once it is spent).
    const labels = container.collection
      ? faceLabels(container.faces, this.language, cache).map((label, i) =>
          container.faces[i].error ? fill(s.faceDamaged, { label }) : label
        )
      : []
    const loaded: Loaded = { bytes, container, labels, infos: new Map(), cache, drawn: new Map() }
    if (!container.collection) {
      // A single font without head, name or cmap (for example cut short) cannot be shown at all.
      const info = this.infoOf(loaded, 0)
      if (info.damaged) {
        this.fail(new FontError('damaged', info.damaged))
        return
      }
    }
    const reload = this.loaded !== null
    this.dropStaleFaces()
    this.staleFaces = this.fontFaces
    this.fontFaces = []
    this.loadToken++
    this.loaded = loaded
    if (!reload || this.faceIndex >= container.faces.length) {
      this.faceIndex = Math.max(0, container.faces.findIndex((face) => !face.error))
    }
    this.message.className = 'fv-message fv-hidden'
    this.showFace()
  }

  /** Shows why the file cannot be read, in place of the last font. */
  private fail(error: unknown): void {
    this.loaded = null
    this.dropFontFaces()
    this.dropStaleFaces()
    this.header.replaceChildren()
    this.showMessage(this.strings.errorTitle, errorText(error, this.strings), 'error')
  }

  /** Describes face `index` the first time it is shown. */
  private infoOf(loaded: Loaded, index: number): FaceInfo {
    let info = loaded.infos.get(index)
    if (!info) {
      info = describeFace(loaded.container.faces[index], this.language, loaded.cache)
      loaded.infos.set(index, info)
    }
    return info
  }

  private showFace(): void {
    const loaded = this.loaded
    if (!loaded) return
    const info = this.infoOf(loaded, this.faceIndex)
    const face = loaded.container.faces[this.faceIndex]
    this.renderHeader(loaded, info)
    if (info.damaged) {
      this.loadToken++
      this.family = null
      this.notice.classList.add('fv-hidden')
      this.faceMessage.replaceChildren(
        html('div', {}, icon('error')),
        h('h2', {}, this.strings.faceErrorTitle),
        h('p', {}, fill(this.strings.faceDamagedDetail, { detail: info.damaged }))
      )
      this.faceMessage.classList.remove('fv-hidden')
      this.applyStyle()
      return
    }
    this.faceMessage.classList.add('fv-hidden')
    const state = this.preview.state
    const axes = axesFor(info, state.axes)
    state.axes.clear()
    for (const [tag, value] of axes) state.axes.set(tag, value)

    this.renderHeader(loaded, info)
    this.preview.show(info, defaultSample(info, this.language, this.strings))
    this.characters.show(info)
    this.info.show(info, face, loaded.container)
    this.applyStyle()
    void this.drawFace(loaded, this.faceIndex)
  }

  private renderHeader(loaded: Loaded, info: FaceInfo): void {
    const s = this.strings
    const { container, labels } = loaded
    const number = (value: number) => value.toLocaleString(this.language === 'ru' ? 'ru-RU' : 'en-US')
    const badges = h('div', { class: 'fv-badges' })
    const badge = (text: string, strong = false) => badges.append(h('span', { class: strong ? 'fv-badge strong' : 'fv-badge' }, text))
    const format = { sfnt: '', woff: 'WOFF', woff2: 'WOFF2' }[container.flavor]
    if (format) badge(format, true)
    const outlines = { truetype: s.badgeTrueType, cff: s.badgeCff, cff2: s.badgeCff2, bitmap: s.badgeBitmap, unknown: '' }[info.outlines]
    if (outlines) badge(outlines, !format)
    if (info.variable) badge(s.badgeVariable)
    if (info.color.length) badge(`${s.badgeColor} · ${info.color.join(', ')}`)
    if (info.monospace) badge(s.badgeMonospace)
    if (container.collection) badge(`${s.badgeCollection} · ${labels.length}`)
    if (info.glyphCount !== null) badge(fill(s.badgeGlyphs, { n: number(info.glyphCount) }))
    badge(fill(s.badgeChars, { n: number(info.cmap.codes.length) }))

    const title = h(
      'div',
      { class: 'fv-title' },
      h('h1', { title: info.names.fullName ?? info.family }, info.family || labels[this.faceIndex] || s.unnamed),
      info.style ? h('span', {}, info.style) : null
    )
    const parts: (HTMLElement | null)[] = [title, badges, h('span', { class: 'fv-spacer' })]
    if (labels.length > 1) {
      const picker = h('select', { class: 'fv-select', 'aria-label': s.face })
      labels.forEach((label, i) => picker.append(h('option', { value: String(i) }, label)))
      picker.value = String(this.faceIndex)
      picker.addEventListener('change', () => {
        this.faceIndex = Number(picker.value)
        this.showFace()
      })
      parts.push(
        h(
          'label',
          { class: 'fv-face-picker' },
          h('span', {}, s.face),
          picker,
          h('span', {}, fill(s.faceOf, { n: this.faceIndex + 1, total: labels.length }))
        )
      )
    }
    this.header.replaceChildren(...parts.filter((part): part is HTMLElement => part !== null))
  }

  private selectTab(id: TabId): void {
    this.tab = id
    for (const [tab, button] of this.tabButtons) {
      const selected = tab === id
      button.setAttribute('aria-selected', String(selected))
      button.tabIndex = selected ? 0 : -1
    }
    this.preview.root.classList.toggle('fv-hidden', id !== 'preview')
    this.characters.root.classList.toggle('fv-hidden', id !== 'characters')
    this.info.root.classList.toggle('fv-hidden', id !== 'info')
    this.characters.setVisible(id === 'characters')
  }

  /** Loads face `index` into a FontFace once per file; later visits reuse it. */
  private async drawFace(loaded: Loaded, index: number): Promise<void> {
    const token = ++this.loadToken
    let result = loaded.drawn.get(index)
    if (!result) {
      let source: ReturnType<typeof renderSource>
      try {
        source = renderSource(loaded.container, index, loaded.bytes)
      } catch (error) {
        source = { kind: 'error', message: describeError(error) }
      }
      if (source.kind === 'woff2-collection') {
        result = { error: this.strings.renderFailedWoff2Collection }
      } else if (source.kind === 'error') {
        result = { error: source.message }
      } else {
        result = await this.loadFontFace(source.bytes, loaded)
      }
      loaded.drawn.set(index, result)
    }
    if (token !== this.loadToken || this.loaded !== loaded) return
    this.dropStaleFaces()
    if ('family' in result) {
      this.family = result.family
      this.notice.classList.add('fv-hidden')
    } else {
      this.family = null
      this.notice.textContent =
        result.error === this.strings.renderFailedWoff2Collection ? result.error : fill(this.strings.renderFailed, { detail: result.error })
      this.notice.classList.remove('fv-hidden')
    }
    this.applyStyle()
  }

  /** ArrayBuffer first; a data: URL (allowed by the frame's font-src) if Chromium refuses it. */
  private async loadFontFace(bytes: Uint8Array, loaded: Loaded): Promise<{ family: string } | { error: string }> {
    const family = `fv-face-${++serial}`
    const buffer = bytes.slice().buffer
    let firstError: unknown
    try {
      const face = new FontFace(family, buffer)
      await face.load()
      return this.adopt(face, family, loaded)
    } catch (error) {
      firstError = error
    }
    try {
      const face = new FontFace(family, `url(data:${fontMime(bytes)};base64,${base64(bytes)})`)
      await face.load()
      return this.adopt(face, family, loaded)
    } catch {
      return { error: describeError(firstError) }
    }
  }

  /** Adds a loaded FontFace to the page, unless the file changed while it loaded. */
  private adopt(face: FontFace, family: string, loaded: Loaded): { family: string } | { error: string } {
    if (this.loaded !== loaded) return { error: 'the file changed while the font loaded' }
    fonts.add(face)
    this.fontFaces.push(face)
    return { family }
  }

  private dropFontFaces(): void {
    for (const face of this.fontFaces) fonts.delete(face)
    this.fontFaces = []
    this.family = null
    this.loadToken++
  }

  private dropStaleFaces(): void {
    for (const face of this.staleFaces) fonts.delete(face)
    this.staleFaces = []
  }

  private applyStyle(): void {
    const info = this.loaded?.infos.get(this.faceIndex) ?? null
    const style = faceStyle(info, this.family, this.preview.state.axes, this.preview.state.features)
    const root = document.documentElement.style
    root.setProperty('--fv-font', style.font)
    root.setProperty('--fv-variation', style.variation)
    root.setProperty('--fv-features', style.features)
  }
}

function errorText(error: unknown, s: Strings): string {
  if (error instanceof FontError) {
    if (error.code === 'not-a-font') return s.errorNotFont
    return fill(s.errorDamaged, { detail: error.message })
  }
  return fill(s.errorDamaged, { detail: describeError(error) })
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  return String(error)
}

function base64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(text)
}
