// The Info tab: names, style and metrics, licence and embedding rights, the file, and the table
// directory. Links (designer, vendor, licence) open in the browser through Orca, which asks first.

import { embeddingLabel, formatBytes, formatDate, formatNumber, weightLabel, widthLabel } from '../describe'
import type { Face, FontContainer } from '../font/container'
import type { FaceInfo, NameKey } from '../font/info'
import type { Language, Strings } from '../i18n'
import { icon } from '../icons'
import { h, html } from './dom'

type Value = string | Node | null | undefined
type Row = [label: string, value: Value, mono?: boolean]

const NAME_ORDER: NameKey[] = [
  'family', 'subfamily', 'typographicFamily', 'typographicSubfamily', 'fullName', 'postScriptName',
  'version', 'uniqueId', 'designer', 'designerUrl', 'manufacturer', 'vendorUrl', 'description', 'sampleText'
]
const LICENSE_ORDER: NameKey[] = ['copyright', 'trademark', 'license', 'licenseUrl']
const URL_KEYS = new Set<NameKey>(['designerUrl', 'vendorUrl', 'licenseUrl'])
const MONO_KEYS = new Set<NameKey>(['postScriptName', 'uniqueId'])

export type InfoHost = {
  strings: Strings
  language: Language
}

export class InfoTab {
  readonly root = h('div', { class: 'fv-panel', role: 'tabpanel' })

  constructor(private readonly host: InfoHost) {}

  show(info: FaceInfo, face: Face, container: FontContainer): void {
    const s = this.host.strings
    const language = this.host.language
    const number = (value: number) => formatNumber(value, language)
    const sections: HTMLElement[] = []

    const names: Row[] = NAME_ORDER.filter((key) => info.names[key]).map((key) => [
      s[`name_${key}`],
      URL_KEYS.has(key) ? this.link(info.names[key]!) : info.names[key],
      MONO_KEYS.has(key)
    ])
    if (names.length) sections.push(this.section(s.sectionNames, names))

    const os2 = info.os2
    const hhea = info.hhea
    const style: Row[] = [
      [s.weightClass, os2 ? weightLabel(os2.weightClass) : null],
      [s.widthClass, os2 ? widthLabel(os2.widthClass) : null],
      [s.italicAngle, info.post ? `${number(info.post.italicAngle)}°` : null],
      [s.monospace, info.monospace ? s.yes : s.no],
      [s.unitsPerEm, info.head ? number(info.head.unitsPerEm) : null],
      [s.ascender, hhea ? number(hhea.ascender) : os2 ? number(os2.typoAscender) : null],
      [s.descender, hhea ? number(hhea.descender) : os2 ? number(os2.typoDescender) : null],
      [s.lineGap, hhea ? number(hhea.lineGap) : os2 ? number(os2.typoLineGap) : null],
      [s.xHeight, os2?.xHeight ? number(os2.xHeight) : null],
      [s.capHeight, os2?.capHeight ? number(os2.capHeight) : null]
    ]
    if (info.axes.length) {
      style.push([
        s.axes,
        info.axes.map((axis) => `${axis.name} (${axis.tag}): ${number(axis.min)} – ${number(axis.max)}, ${number(axis.default)}`).join('\n')
      ])
    }
    sections.push(this.section(s.sectionStyle, style))

    const license: Row[] = LICENSE_ORDER.filter((key) => info.names[key]).map((key) => [
      s[`name_${key}`],
      URL_KEYS.has(key) ? this.link(info.names[key]!) : info.names[key]
    ])
    if (os2) license.push([s.embedding, embeddingLabel(os2.fsType, s)])
    if (os2?.vendorId.trim()) license.push([s.vendorId, os2.vendorId, true])
    if (license.length) sections.push(this.section(s.sectionLicense, license))

    const outlines = {
      truetype: s.outlinesTrueType,
      cff: s.outlinesCff,
      cff2: s.outlinesCff2,
      bitmap: s.outlinesBitmap,
      unknown: s.outlinesUnknown
    }[info.outlines]
    const format = container.collection ? `${s[`container_${container.flavor}`]} · ${s.container_collection}` : s[`container_${container.flavor}`]
    const file: Row[] = [
      [s.format, format],
      [s.outlines, outlines],
      [s.sfntVersion, info.sfntVersion, true],
      [s.fileSize, `${formatBytes(container.fileSize, language)} (${number(container.fileSize)})`],
      [s.glyphs, info.glyphCount !== null ? number(info.glyphCount) : null],
      [s.characters, number(info.cmap.codes.length)],
      [s.cmapSource, info.cmap.source ? `${info.cmap.source}${info.cmap.symbol ? ' (symbol)' : ''}` : null, true],
      [s.color, info.color.length ? info.color.join(', ') : null],
      [s.created, info.head?.created != null ? formatDate(info.head.created, language) : null],
      [s.modified, info.head?.modified != null ? formatDate(info.head.modified, language) : null],
      [s.woffMetadata, container.hasWoffMetadata ? s.present : null]
    ]
    sections.push(this.section(s.sectionFile, file))

    sections.push(this.tables(face))

    if (info.problems.length) {
      sections.push(
        h(
          'section',
          {},
          h('h3', { class: 'fv-section-title' }, s.sectionProblems),
          h('ul', { class: 'fv-problems' }, ...info.problems.map((problem) => h('li', {}, problem)))
        )
      )
    }
    this.root.replaceChildren(h('div', { class: 'fv-info' }, ...sections))
  }

  private section(title: string, rows: Row[]): HTMLElement {
    const list = h('dl', { class: 'fv-kv' })
    for (const [label, value, mono] of rows) {
      if (value === null || value === undefined || value === '') continue
      list.append(h('dt', {}, label), h('dd', { class: mono ? 'mono' : null }, value))
    }
    return h('section', {}, h('h3', { class: 'fv-section-title' }, title), list)
  }

  private tables(face: Face): HTMLElement {
    const s = this.host.strings
    const language = this.host.language
    const stored = face.tableList.some((table) => table.stored !== undefined)
    const body = h('tbody')
    for (const table of [...face.tableList].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))) {
      body.append(
        h(
          'tr',
          {},
          h('td', { class: 'tag' }, table.tag),
          h('td', { class: 'num' }, formatNumber(table.length, language)),
          stored ? h('td', { class: 'num' }, table.stored !== undefined ? formatNumber(table.stored, language) : '') : null,
          stored ? h('td', {}, table.transformed ? s.transformed : '') : null
        )
      )
    }
    const head = h(
      'tr',
      {},
      h('th', {}, s.table),
      h('th', { class: 'num' }, s.tableSize),
      stored ? h('th', { class: 'num' }, s.tableStored) : null,
      stored ? h('th', {}, '') : null
    )
    return h(
      'section',
      {},
      h('h3', { class: 'fv-section-title' }, `${s.sectionTables} · ${face.tableList.length}`),
      h('table', { class: 'fv-table' }, h('thead', {}, head), body)
    )
  }

  /** A web link opened through Orca, or plain text for anything that is not http(s)/mailto. */
  private link(text: string): Value {
    const trimmed = text.trim()
    const url = /^www\.\S+$/i.test(trimmed) ? `https://${trimmed}` : trimmed
    if (!/^(https?:\/\/|mailto:)\S+$/i.test(url) || !globalThis.orca?.shell) return text
    const anchor = h('a', { class: 'fv-link', href: url, title: this.host.strings.openLink }, trimmed)
    anchor.append(html('span', { class: 'fv-link-icon' }, icon('external')))
    anchor.addEventListener('click', (event) => {
      event.preventDefault()
      void globalThis.orca.shell?.openExternal(url)
    })
    return anchor
  }
}
