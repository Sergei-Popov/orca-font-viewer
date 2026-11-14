// The viewer: a header with the font's name, badges and (for collections) a face picker, three
// tabs, and the loaded FontFace that every `.fv-face` element draws with.

import { defaultSample } from '../describe'
import { FontError } from '../font/bytes'
import { type FontContainer, openFont } from '../font/container'
import { type FaceInfo, describeContainer, faceLabel } from '../font/info'
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
  faces: FaceInfo[]
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
    const s = this.strings
    let container: FontContainer
    try {
      container = openFont(bytes)
    } catch (error) {
      this.loaded = null
      this.dropFontFaces()
      this.dropStaleFaces()
      this.header.replaceChildren()
      this.showMessage(s.errorTitle, errorText(error, s), 'error')
      return
    }
    const faces = describeContainer(container, this.language)
    const reload = this.loaded !== null
    this.dropStaleFaces()
    this.staleFaces = this.fontFaces
    this.fontFaces = []
    this.loadToken++
    this.loaded = { bytes, container, faces, drawn: new Map() }
    if (!reload || this.faceIndex >= faces.length) this.faceIndex = 0
    this.message.className = 'fv-message fv-hidden'
    this.showFace()
  }

  private showFace(): void {
    const loaded = this.loaded
    if (!loaded) return
    const info = loaded.faces[this.faceIndex]
    const face = loaded.container.faces[this.faceIndex]
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
    const { container, faces } = loaded
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
    if (container.collection) badge(`${s.badgeCollection} · ${faces.length}`)
    if (info.glyphCount !== null) badge(fill(s.badgeGlyphs, { n: number(info.glyphCount) }))
    badge(fill(s.badgeChars, { n: number(info.cmap.codes.length) }))

    const title = h(
      'div',
      { class: 'fv-title' },
      h('h1', { title: info.names.fullName ?? info.family }, info.family || s.unnamed),
      info.style ? h('span', {}, info.style) : null
    )
    const parts: (HTMLElement | null)[] = [title, badges, h('span', { class: 'fv-spacer' })]
    if (faces.length > 1) {
      const picker = h('select', { class: 'fv-select', 'aria-label': s.face })
      faces.forEach((face, i) => picker.append(h('option', { value: String(i) }, faceLabel(face, i))))
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
          h('span', {}, fill(s.faceOf, { n: this.faceIndex + 1, total: faces.length }))
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
      const source = renderSource(loaded.container, index, loaded.bytes)
      if (source.kind === 'woff2-collection') {
        result = { error: this.strings.renderFailedWoff2Collection }
      } else {
        result = await this.loadFontFace(source.bytes)
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
  private async loadFontFace(bytes: Uint8Array): Promise<{ family: string } | { error: string }> {
    const family = `fv-face-${++serial}`
    const buffer = bytes.slice().buffer
    let firstError: unknown
    try {
      const face = new FontFace(family, buffer)
      await face.load()
      this.addFontFace(face)
      return { family }
    } catch (error) {
      firstError = error
    }
    try {
      const face = new FontFace(family, `url(data:${fontMime(bytes)};base64,${base64(bytes)})`)
      await face.load()
      this.addFontFace(face)
      return { family }
    } catch {
      return { error: describeError(firstError) }
    }
  }

  private addFontFace(face: FontFace): void {
    fonts.add(face)
    this.fontFaces.push(face)
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
    const info = this.loaded?.faces[this.faceIndex] ?? null
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
