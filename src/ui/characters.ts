// The Characters tab: every character the font maps, grouped by Unicode block, in a grid that
// draws only the rows on screen; a search box and a block filter; a detail panel with the
// character large and its code point in the notations people paste into code.

import {
  blockLabel,
  blockOf,
  charOf,
  cssEscape,
  hex,
  htmlEntity,
  isInvisible,
  jsEscape,
  matchesQuery,
  parseCharQuery,
  uPlus,
  utf8Bytes
} from '../font/chars'
import type { FaceInfo } from '../font/info'
import { type BlockGroup, type GridLayout, groupByBlock, layoutGrid, rowOf, visibleRange } from '../grid'
import { type Language, type Strings, fill } from '../i18n'
import { icon } from '../icons'
import { append, copyText, h, html, selectText, toast } from './dom'

const HEADER_HEIGHT = 32
const ROW_HEIGHT = 72
const CELL_MIN_WIDTH = 64
const SIDE_PADDING = 16
const OVERSCAN = 360
/** The detail panel's glyph: font size, and box height inside its borders (styles.ts .fv-detail-glyph). */
const GLYPH_SIZE = 112
const GLYPH_BOX = 148

export type CharactersState = {
  query: string
  /** A block name, or '' for every block. */
  block: string
  selected: number | null
}

export type CharactersHost = {
  strings: Strings
  language: Language
}

/** Short labels for characters that draw nothing. */
const INVISIBLE_LABELS: Record<number, string> = {
  0x09: 'TAB', 0x0a: 'LF', 0x0d: 'CR', 0x20: 'SP', 0xa0: 'NBSP', 0xad: 'SHY', 0x200b: 'ZWSP',
  0x200c: 'ZWNJ', 0x200d: 'ZWJ', 0x200e: 'LRM', 0x200f: 'RLM', 0x2028: 'LSEP', 0x2029: 'PSEP',
  0x202f: 'NNBSP', 0x2060: 'WJ', 0x3000: 'IDSP', 0xfeff: 'BOM'
}

/** ASCII control abbreviations, U+0000–U+001F. */
const C0 = 'NUL SOH STX ETX EOT ENQ ACK BEL BS TAB LF VT FF CR SO SI DLE DC1 DC2 DC3 DC4 NAK SYN ETB CAN EM SUB ESC FS GS RS US'.split(' ')

/** A label for a character that draws nothing: an abbreviation, or '' for a plain blank box. */
function invisibleLabel(code: number): string | null {
  if (code === 0x20) return INVISIBLE_LABELS[code]
  if (!isInvisible(code)) return null
  if (code < 0x20) return C0[code]
  if (code === 0x7f) return 'DEL'
  return INVISIBLE_LABELS[code] ?? ''
}

export class CharactersTab {
  readonly root = h('div', { class: 'fv-panel fv-chars', role: 'tabpanel' })
  private readonly search: HTMLInputElement
  private readonly blockSelect: HTMLSelectElement
  private readonly count = h('span', { class: 'fv-label fv-count' })
  private readonly scroll = h('div', { class: 'fv-grid-scroll', tabindex: '0' })
  private readonly sizer = h('div', { class: 'fv-grid-sizer', role: 'grid' })
  private readonly detail = h('aside', { class: 'fv-detail fv-hidden' })
  private readonly empty = h('div', { class: 'fv-empty fv-hidden' })
  private info: FaceInfo | null = null
  private groups: BlockGroup[] = []
  private layout: GridLayout = { rows: [], height: 0, total: 0 }
  private columns = 0
  private drawn = ''
  private frame = 0
  private searchTimer: ReturnType<typeof setTimeout> | undefined
  private visible = false
  private dirty = true

  constructor(
    private readonly host: CharactersHost,
    readonly state: CharactersState
  ) {
    const s = host.strings
    this.search = h('input', {
      class: 'fv-input fv-search',
      type: 'search',
      placeholder: s.searchChars,
      'aria-label': s.searchChars,
      spellcheck: 'false'
    })
    this.search.addEventListener('input', () => {
      clearTimeout(this.searchTimer)
      this.searchTimer = setTimeout(() => {
        this.state.query = this.search.value
        this.refilter()
      }, 120)
    })
    this.blockSelect = h('select', { class: 'fv-select', 'aria-label': s.block })
    this.blockSelect.addEventListener('change', () => {
      this.state.block = this.blockSelect.value
      this.refilter()
    })
    this.scroll.append(this.sizer, this.empty)
    this.scroll.addEventListener('scroll', () => this.schedule(), { passive: true })
    this.scroll.addEventListener('keydown', (event) => this.onKey(event))
    this.sizer.addEventListener('click', (event) => {
      const cell = (event.target as Element).closest<HTMLElement>('.fv-cell')
      if (!cell?.dataset.code) return
      this.select(Number(cell.dataset.code), false)
      // Redrawing replaced the clicked button: keep the arrow keys working.
      this.scroll.focus({ preventScroll: true })
    })
    new ResizeObserver(() => {
      if (!this.visible) return
      if (this.columnsFor() !== this.columns) this.relayout()
      else this.schedule()
    }).observe(this.scroll)

    this.root.append(
      h('div', { class: 'fv-toolbar' }, this.search, this.blockSelect, h('span', { class: 'fv-spacer' }), this.count),
      h('div', { class: 'fv-chars-body' }, this.scroll, this.detail)
    )
  }

  /** A new face (or a reloaded file): keeps the query, block and selection when they still apply. */
  show(info: FaceInfo): void {
    this.info = info
    const s = this.host.strings
    this.search.value = this.state.query
    const all = groupByBlock(info.cmap.codes)
    this.blockSelect.replaceChildren(h('option', { value: '' }, s.allBlocks))
    for (const group of all) {
      this.blockSelect.append(
        h('option', { value: group.block }, `${blockLabel(group.block, this.host.language, s.noBlock)} (${group.codes.length})`)
      )
    }
    if (!all.some((group) => group.block === this.state.block)) this.state.block = ''
    this.blockSelect.value = this.state.block
    this.dirty = true
    if (this.visible) this.refilter()
  }

  /** The tab became visible or hidden; layout needs the real width, so it waits for visibility. */
  setVisible(visible: boolean): void {
    this.visible = visible
    if (visible && this.dirty) this.refilter()
    else if (visible) this.relayout()
  }

  /** Applies the query and block filter; cells follow axes and features through CSS variables. */
  private refilter(): void {
    const info = this.info
    if (!info) return
    this.dirty = false
    const s = this.host.strings
    const query = parseCharQuery(this.state.query)
    const block = this.state.block
    const language = this.host.language
    const labels = new Map<string, string>()
    const labelOf = (name: string) => {
      let label = labels.get(name)
      if (label === undefined) {
        label = blockLabel(name, language, s.noBlock)
        labels.set(name, label)
      }
      return label
    }
    this.groups = groupByBlock(info.cmap.codes, (code, name) => (!block || name === block) && matchesQuery(query, code, name, labelOf(name)))
    const total = info.cmap.codes.length
    this.relayout()
    this.count.textContent = fill(s.charsCount, {
      shown: this.layout.total.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US'),
      total: total.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')
    })
    this.empty.textContent = total === 0 ? s.noCmap : s.noChars
    this.empty.classList.toggle('fv-hidden', this.layout.total > 0)
    if (this.state.selected !== null && !this.hasCode(this.state.selected)) {
      this.state.selected = null
    }
    this.renderDetail()
  }

  private columnsFor(): number {
    const width = this.scroll.clientWidth - SIDE_PADDING * 2
    return Math.max(1, Math.floor(width / CELL_MIN_WIDTH))
  }

  private relayout(): void {
    this.columns = this.columnsFor()
    this.layout = layoutGrid(this.groups, this.columns, HEADER_HEIGHT, ROW_HEIGHT)
    this.sizer.style.height = `${this.layout.height + 16}px`
    this.drawn = ''
    this.render()
  }

  private schedule(): void {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.render()
    })
  }

  private render(): void {
    const [first, last] = visibleRange(this.layout, this.scroll.scrollTop, this.scroll.clientHeight, OVERSCAN)
    const key = `${first}:${last}:${this.columns}:${this.state.selected}`
    if (key === this.drawn) return
    this.drawn = key
    const s = this.host.strings
    const fragment = document.createDocumentFragment()
    const template = `repeat(${this.columns}, minmax(0, 1fr))`
    for (let i = first; i < last; i++) {
      const row = this.layout.rows[i]
      const group = this.groups[row.group]
      if (row.kind === 'header') {
        fragment.append(
          h(
            'div',
            { class: 'fv-grid-header', style: `top:${row.top}px`, role: 'row' },
            blockLabel(group.block, this.host.language, s.noBlock),
            h('small', {}, String(group.codes.length))
          )
        )
        continue
      }
      const element = h('div', { class: 'fv-grid-row', role: 'row', style: `top:${row.top}px;grid-template-columns:${template}` })
      for (let j = row.from; j < row.to; j++) {
        element.append(this.cell(group.codes[j]))
      }
      fragment.append(element)
    }
    this.sizer.replaceChildren(fragment)
  }

  private cell(code: number): HTMLElement {
    const label = invisibleLabel(code)
    const glyph =
      label === null
        ? h('span', { class: 'fv-cell-glyph fv-face' }, charOf(code))
        : h('span', { class: label ? 'fv-cell-glyph invisible' : 'fv-cell-glyph invisible blank' }, label)
    return h(
      'button',
      {
        class: 'fv-cell',
        type: 'button',
        role: 'gridcell',
        tabindex: '-1',
        'data-code': code,
        'aria-selected': String(code === this.state.selected),
        'aria-label': uPlus(code),
        title: uPlus(code)
      },
      glyph,
      h('span', { class: 'fv-cell-code' }, hex(code))
    )
  }

  /** Position of `code` in the filtered list; -1 when it is filtered out. */
  private findCode(code: number): number {
    let offset = 0
    for (const group of this.groups) {
      const index = binarySearch(group.codes, code)
      if (index >= 0) return offset + index
      offset += group.codes.length
    }
    return -1
  }

  private hasCode(code: number): boolean {
    return this.info ? binarySearch(this.info.cmap.codes, code) >= 0 : false
  }

  private codeAt(position: number): number | null {
    let offset = 0
    for (const group of this.groups) {
      if (position < offset + group.codes.length) return group.codes[position - offset]
      offset += group.codes.length
    }
    return null
  }

  private select(code: number | null, reveal: boolean): void {
    this.state.selected = code
    this.renderDetail()
    if (code !== null && reveal) this.reveal(code)
    this.drawn = ''
    this.render()
  }

  /** Scrolls so the row of `code` is in view. */
  private reveal(code: number): void {
    for (let g = 0; g < this.groups.length; g++) {
      const index = binarySearch(this.groups[g].codes, code)
      if (index >= 0) {
        const row = this.layout.rows[rowOf(this.layout, g, index)]
        if (!row) return
        const top = row.top
        const view = this.scroll
        if (top < view.scrollTop + HEADER_HEIGHT) view.scrollTop = Math.max(0, top - HEADER_HEIGHT)
        else if (top + ROW_HEIGHT > view.scrollTop + view.clientHeight) view.scrollTop = top + ROW_HEIGHT - view.clientHeight + 8
        return
      }
    }
  }

  private onKey(event: KeyboardEvent): void {
    if (this.layout.total === 0) return
    // The detail panel may have just appeared and narrowed the grid.
    if (this.columnsFor() !== this.columns) this.relayout()
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -this.columns,
      ArrowDown: this.columns
    }
    if (event.key === 'Escape' && this.state.selected !== null) {
      this.select(null, false)
      event.preventDefault()
      return
    }
    const delta = step[event.key]
    if (delta === undefined) return
    event.preventDefault()
    const current = this.state.selected === null ? -1 : this.findCode(this.state.selected)
    const next = current < 0 ? 0 : Math.max(0, Math.min(this.layout.total - 1, current + delta))
    const code = this.codeAt(next)
    if (code !== null) this.select(code, true)
  }

  private renderDetail(): void {
    const code = this.state.selected
    const s = this.host.strings
    if (code === null || !this.info) {
      this.detail.classList.add('fv-hidden')
      this.detail.replaceChildren()
      return
    }
    const glyphIndex = binarySearch(this.info.cmap.codes, code)
    const glyph = glyphIndex >= 0 ? this.info.cmap.glyphs[glyphIndex] : null
    const label = invisibleLabel(code)
    const close = html('button', { class: 'fv-btn ghost', type: 'button', title: s.close, 'aria-label': s.close }, icon('close'))
    close.addEventListener('click', () => this.select(null, false))
    const rows: [string, string][] = [
      [s.character, label === null ? charOf(code) : label || hex(code)],
      [s.codePoint, uPlus(code)],
      [s.decimal, String(code)],
      [s.html, htmlEntity(code)],
      [s.css, cssEscape(code)],
      [s.javascript, jsEscape(code)],
      [s.utf8, utf8Bytes(code)]
    ]
    this.detail.replaceChildren()
    append(this.detail, [
      h('div', { class: 'fv-detail-head' }, h('span', { class: 'fv-detail-name' }, uPlus(code)), h('span', { class: 'fv-spacer' }), close),
      this.glyphBox(code, label),
      h('div', { class: 'fv-detail-block' }, blockLabel(blockOf(code), this.host.language, s.noBlock)),
      ...rows.map(([name, value]) => this.copyRow(name, value, name === s.character ? charOf(code) : value)),
      glyph !== null ? h('div', { class: 'fv-copy-row' }, h('span', { class: 'fv-label' }, s.glyphId), h('code', {}, String(glyph))) : null
    ])
    this.detail.classList.remove('fv-hidden')
  }

  /** The character large, on a baseline drawn from the font's hhea ascender and descender. */
  private glyphBox(code: number, label: string | null): HTMLElement {
    if (label !== null) return h('div', { class: 'fv-detail-glyph invisible' }, label || hex(code))
    const box = h('div', { class: 'fv-detail-glyph fv-face' }, charOf(code))
    const hhea = this.info?.hhea
    const upm = this.info?.head?.unitsPerEm
    if (hhea && upm && hhea.ascender > 0) {
      // Chromium centres the em box of a line-height: 1 line: half the leading goes above.
      const scale = GLYPH_SIZE / upm
      const ascent = hhea.ascender * scale
      const descent = -hhea.descender * scale
      const baseline = (GLYPH_BOX - GLYPH_SIZE) / 2 + (GLYPH_SIZE - ascent - descent) / 2 + ascent
      if (baseline > 4 && baseline < GLYPH_BOX - 4) {
        box.append(h('div', { class: 'fv-baseline', style: `top:${Math.round(baseline)}px` }))
      }
    }
    return box
  }

  private copyRow(name: string, shown: string, value: string): HTMLElement {
    const s = this.host.strings
    const code = h('code', {}, shown)
    const button = html('button', { class: 'fv-btn ghost', type: 'button', title: `${s.copy}: ${name}`, 'aria-label': `${s.copy}: ${name}` }, icon('copy'))
    button.addEventListener('click', async () => {
      if (await copyText(value)) {
        toast(s.copied)
      } else {
        selectText(code)
        toast(s.copyFailed)
      }
    })
    return h('div', { class: 'fv-copy-row' }, h('span', { class: 'fv-label' }, name), code, button)
  }
}

function binarySearch(sorted: ArrayLike<number>, value: number): number {
  let lo = 0
  let hi = sorted.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const item = sorted[mid]
    if (item === value) return mid
    if (item < value) lo = mid + 1
    else hi = mid - 1
  }
  return -1
}
