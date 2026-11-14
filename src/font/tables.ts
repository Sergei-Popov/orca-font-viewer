// Readers for the OpenType tables the viewer shows: name, head, hhea, maxp, OS/2, post, cmap, fvar
// and the feature lists of GSUB/GPOS. Each takes the table's bytes and returns plain data.

import { FontError, Reader } from './bytes'

// ---------------------------------------------------------------------------------------------
// name

export type NameRecord = {
  platformId: number
  encodingId: number
  languageId: number
  nameId: number
  /** BCP-47-ish language of the record when known ("en", "ru", "ja"), else "". */
  language: string
  value: string
}

const MAC_ROMAN_HIGH =
  'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø' +
  '¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ'

function decodeMacRoman(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) {
    out += byte < 0x80 ? String.fromCharCode(byte) : MAC_ROMAN_HIGH[byte - 0x80]
  }
  return out
}

function decodeUtf16(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i + 1 < bytes.byteLength; i += 2) {
    out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1])
  }
  return out
}

/** Primary language subtags of Windows LCIDs (low 10 bits). */
const WINDOWS_LANGUAGES: Record<number, string> = {
  0x01: 'ar', 0x02: 'bg', 0x03: 'ca', 0x04: 'zh', 0x05: 'cs', 0x06: 'da', 0x07: 'de', 0x08: 'el',
  0x09: 'en', 0x0a: 'es', 0x0b: 'fi', 0x0c: 'fr', 0x0d: 'he', 0x0e: 'hu', 0x0f: 'is', 0x10: 'it',
  0x11: 'ja', 0x12: 'ko', 0x13: 'nl', 0x14: 'nb', 0x15: 'pl', 0x16: 'pt', 0x18: 'ro', 0x19: 'ru',
  0x1a: 'hr', 0x1b: 'sk', 0x1d: 'sv', 0x1e: 'th', 0x1f: 'tr', 0x22: 'uk', 0x23: 'be', 0x24: 'sl',
  0x25: 'et', 0x26: 'lv', 0x27: 'lt', 0x29: 'fa', 0x2a: 'vi', 0x3f: 'kk'
}

/** Mac language codes the viewer may prefer. */
const MAC_LANGUAGES: Record<number, string> = {
  0: 'en', 1: 'fr', 2: 'de', 3: 'it', 4: 'nl', 5: 'sv', 6: 'es', 7: 'da', 8: 'pt', 9: 'nb',
  10: 'he', 11: 'ja', 12: 'ar', 13: 'fi', 14: 'el', 15: 'is', 17: 'tr', 19: 'zh', 21: 'hi',
  23: 'ko', 25: 'pl', 26: 'hu', 32: 'ru', 33: 'zh'
}

export function parseName(bytes: Uint8Array): NameRecord[] {
  const r = new Reader(bytes)
  const format = r.u16(0)
  const count = r.u16(2)
  const storage = r.u16(4)
  const langTags: string[] = []
  if (format === 1) {
    const tagCount = r.u16(6 + count * 12)
    for (let i = 0; i < tagCount; i++) {
      const at = 6 + count * 12 + 2 + i * 4
      const length = r.u16(at)
      const offset = r.u16(at + 2)
      langTags.push(r.has(storage + offset, length) ? decodeUtf16(r.slice(storage + offset, length)) : '')
    }
  }
  const records: NameRecord[] = []
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12
    const platformId = r.u16(at)
    const encodingId = r.u16(at + 2)
    const languageId = r.u16(at + 4)
    const nameId = r.u16(at + 6)
    const length = r.u16(at + 8)
    const offset = r.u16(at + 10)
    if (!r.has(storage + offset, length)) {
      continue
    }
    const raw = r.slice(storage + offset, length)
    let value: string
    if (platformId === 0 || (platformId === 3 && (encodingId === 0 || encodingId === 1 || encodingId === 10))) {
      value = decodeUtf16(raw)
    } else if (platformId === 1 && encodingId === 0) {
      value = decodeMacRoman(raw)
    } else {
      continue
    }
    let language = ''
    if (languageId >= 0x8000) {
      language = (langTags[languageId - 0x8000] ?? '').toLowerCase()
    } else if (platformId === 3) {
      language = WINDOWS_LANGUAGES[languageId & 0x3ff] ?? ''
    } else if (platformId === 1) {
      language = MAC_LANGUAGES[languageId] ?? ''
    }
    records.push({ platformId, encodingId, languageId, nameId, language, value: value.replace(/\u0000+$/, '') })
  }
  return records
}

/**
 * The best string for `nameId`: the UI language first, then English, then anything, preferring
 * Windows/Unicode records over Mac ones at each step.
 */
export function pickName(records: readonly NameRecord[], nameId: number, uiLanguage: string): string | null {
  let best: NameRecord | null = null
  let bestScore = -1
  const ui = uiLanguage.toLowerCase().split('-')[0]
  for (const record of records) {
    if (record.nameId !== nameId || !record.value.trim()) {
      continue
    }
    const lang = record.language.split('-')[0]
    let score = record.platformId === 1 ? 0 : 1
    if (lang === ui) score += 20
    else if (lang === 'en') score += 10
    else if (lang === '') score += 5
    if (record.platformId === 3 && record.languageId === 0x0409) score += 2
    if (score > bestScore) {
      best = record
      bestScore = score
    }
  }
  return best ? best.value : null
}

// ---------------------------------------------------------------------------------------------
// head, hhea, maxp, post

export type HeadTable = {
  fontRevision: number
  unitsPerEm: number
  created: number | null
  modified: number | null
  macStyle: number
}

export function parseHead(bytes: Uint8Array): HeadTable {
  const r = new Reader(bytes)
  return {
    fontRevision: r.fixed(4),
    unitsPerEm: r.u16(18),
    created: r.longDateTime(20),
    modified: r.longDateTime(28),
    macStyle: r.u16(44)
  }
}

export type HheaTable = { ascender: number; descender: number; lineGap: number }

export function parseHhea(bytes: Uint8Array): HheaTable {
  const r = new Reader(bytes)
  return { ascender: r.i16(4), descender: r.i16(6), lineGap: r.i16(8) }
}

export function parseMaxp(bytes: Uint8Array): number {
  return new Reader(bytes).u16(4)
}

export type PostTable = { italicAngle: number; underlinePosition: number; underlineThickness: number; isFixedPitch: boolean }

export function parsePost(bytes: Uint8Array): PostTable {
  const r = new Reader(bytes)
  return {
    italicAngle: r.fixed(4),
    underlinePosition: r.i16(8),
    underlineThickness: r.i16(10),
    isFixedPitch: r.u32(12) !== 0
  }
}

// ---------------------------------------------------------------------------------------------
// OS/2

export type Os2Table = {
  version: number
  weightClass: number
  widthClass: number
  fsType: number
  fsSelection: number
  vendorId: string
  typoAscender: number
  typoDescender: number
  typoLineGap: number
  winAscent: number
  winDescent: number
  xHeight: number | null
  capHeight: number | null
}

export function parseOs2(bytes: Uint8Array): Os2Table {
  const r = new Reader(bytes)
  const version = r.u16(0)
  const hasV2 = version >= 2 && r.has(86, 4)
  return {
    version,
    weightClass: r.u16(4),
    widthClass: r.u16(6),
    fsType: r.u16(8),
    fsSelection: r.u16(62),
    vendorId: r.tag(58).replace(/[\u0000 ]+$/, ''),
    typoAscender: r.i16(68),
    typoDescender: r.i16(70),
    typoLineGap: r.i16(72),
    winAscent: r.has(74, 2) ? r.u16(74) : 0,
    winDescent: r.has(76, 2) ? r.u16(76) : 0,
    xHeight: hasV2 ? r.i16(86) : null,
    capHeight: hasV2 ? r.i16(88) : null
  }
}

// ---------------------------------------------------------------------------------------------
// cmap

export type CharMap = {
  /** Code points the font maps to a glyph, ascending. */
  codes: Uint32Array
  /** The glyph id of each code point. */
  glyphs: Uint32Array
  /** platform/encoding of the subtable used, e.g. "3/10". */
  source: string
  /** A symbol font (Windows encoding 0): its characters sit at U+F020–F0FF. */
  symbol: boolean
}

/** Grows a pair of typed arrays as code points come in. */
class MapBuilder {
  codes = new Uint32Array(1024)
  glyphs = new Uint32Array(1024)
  size = 0
  sorted = true

  add(code: number, glyph: number): void {
    if (glyph === 0 || code > 0x10ffff) {
      return
    }
    if (this.size === this.codes.length) {
      const codes = new Uint32Array(this.size * 2)
      codes.set(this.codes)
      this.codes = codes
      const glyphs = new Uint32Array(this.size * 2)
      glyphs.set(this.glyphs)
      this.glyphs = glyphs
    }
    if (this.size > 0 && code <= this.codes[this.size - 1]) {
      this.sorted = false
    }
    this.codes[this.size] = code
    this.glyphs[this.size] = glyph
    this.size++
  }

  finish(): { codes: Uint32Array; glyphs: Uint32Array } {
    let codes = this.codes.slice(0, this.size)
    let glyphs = this.glyphs.slice(0, this.size)
    if (!this.sorted) {
      const order = Array.from(codes.keys()).sort((a, b) => codes[a] - codes[b] || a - b)
      const sortedCodes: number[] = []
      const sortedGlyphs: number[] = []
      for (const index of order) {
        if (sortedCodes.length && sortedCodes[sortedCodes.length - 1] === codes[index]) {
          continue
        }
        sortedCodes.push(codes[index])
        sortedGlyphs.push(glyphs[index])
      }
      codes = Uint32Array.from(sortedCodes)
      glyphs = Uint32Array.from(sortedGlyphs)
    }
    return { codes, glyphs }
  }
}

/** Subtable preference: full-Unicode first, then BMP, then symbol, then Mac Roman. */
const CMAP_PREFERENCE: [number, number][] = [
  [3, 10], [0, 6], [0, 4], [3, 1], [0, 3], [0, 2], [0, 1], [0, 0], [3, 0], [1, 0]
]

export function parseCmap(bytes: Uint8Array): CharMap {
  const r = new Reader(bytes)
  const numTables = r.u16(2)
  const subtables: { platform: number; encoding: number; offset: number; format: number }[] = []
  for (let i = 0; i < numTables; i++) {
    const at = 4 + i * 8
    const platform = r.u16(at)
    const encoding = r.u16(at + 2)
    const offset = r.u32(at + 4)
    if (!r.has(offset, 2)) continue
    const format = r.u16(offset)
    if (format === 14) continue // variation sequences, not a character map
    subtables.push({ platform, encoding, offset, format })
  }
  const rank = (s: { platform: number; encoding: number; format: number }) => {
    const index = CMAP_PREFERENCE.findIndex(([p, e]) => p === s.platform && e === s.encoding)
    // A (3,1)/(0,x) subtable in format 12 beats a format 4 one of the same rank.
    return (index < 0 ? 100 : index * 2) - (s.format === 12 || s.format === 13 ? 1 : 0)
  }
  subtables.sort((a, b) => rank(a) - rank(b))
  for (const sub of subtables) {
    const builder = new MapBuilder()
    const ok = readSubtable(r, sub.offset, sub.format, builder, sub.platform === 1)
    if (ok) {
      const { codes, glyphs } = builder.finish()
      return { codes, glyphs, source: `${sub.platform}/${sub.encoding}`, symbol: sub.platform === 3 && sub.encoding === 0 }
    }
  }
  return { codes: new Uint32Array(0), glyphs: new Uint32Array(0), source: '', symbol: false }
}

function readSubtable(r: Reader, at: number, format: number, out: MapBuilder, macRoman: boolean): boolean {
  switch (format) {
    case 0: {
      for (let code = 0; code < 256; code++) {
        const glyph = r.u8(at + 6 + code)
        const unicode = macRoman && code >= 0x80 ? MAC_ROMAN_HIGH.charCodeAt(code - 0x80) : code
        out.add(unicode, glyph)
      }
      return true
    }
    case 4: {
      const segCountX2 = r.u16(at + 6)
      const segCount = segCountX2 / 2
      const endCodes = at + 14
      const startCodes = endCodes + segCountX2 + 2
      const idDeltas = startCodes + segCountX2
      const idRangeOffsets = idDeltas + segCountX2
      for (let s = 0; s < segCount; s++) {
        const end = r.u16(endCodes + s * 2)
        const start = r.u16(startCodes + s * 2)
        const delta = r.i16(idDeltas + s * 2)
        const rangeOffsetAt = idRangeOffsets + s * 2
        const rangeOffset = r.u16(rangeOffsetAt)
        if (start > end) continue
        for (let code = start; code <= end && code !== 0xffff; code++) {
          let glyph: number
          if (rangeOffset === 0) {
            glyph = (code + delta) & 0xffff
          } else {
            const glyphAt = rangeOffsetAt + rangeOffset + (code - start) * 2
            if (!r.has(glyphAt, 2)) continue
            glyph = r.u16(glyphAt)
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff
          }
          out.add(code, glyph)
        }
      }
      return true
    }
    case 6: {
      const first = r.u16(at + 6)
      const count = r.u16(at + 8)
      for (let i = 0; i < count; i++) {
        out.add(first + i, r.u16(at + 10 + i * 2))
      }
      return true
    }
    case 10: {
      const first = r.u32(at + 12)
      const count = r.u32(at + 16)
      for (let i = 0; i < count; i++) {
        out.add(first + i, r.u16(at + 20 + i * 2))
      }
      return true
    }
    case 12:
    case 13: {
      const groups = r.u32(at + 12)
      for (let g = 0; g < groups; g++) {
        const group = at + 16 + g * 12
        const start = r.u32(group)
        const end = Math.min(r.u32(group + 4), 0x10ffff)
        const glyph = r.u32(group + 8)
        for (let code = start; code <= end; code++) {
          out.add(code, format === 12 ? glyph + (code - start) : glyph)
        }
      }
      return true
    }
    default:
      return false
  }
}

// ---------------------------------------------------------------------------------------------
// fvar

export type Axis = { tag: string; min: number; default: number; max: number; hidden: boolean; nameId: number }
export type NamedInstance = { nameId: number; postScriptNameId: number | null; coordinates: Record<string, number> }
export type FvarTable = { axes: Axis[]; instances: NamedInstance[] }

export function parseFvar(bytes: Uint8Array): FvarTable {
  const r = new Reader(bytes)
  const axesOffset = r.u16(4)
  const axisCount = r.u16(8)
  const axisSize = r.u16(10)
  const instanceCount = r.u16(12)
  const instanceSize = r.u16(14)
  if (axisSize < 20) {
    throw new FontError('damaged', `fvar axis records of ${axisSize} bytes`)
  }
  const axes: Axis[] = []
  for (let i = 0; i < axisCount; i++) {
    const at = axesOffset + i * axisSize
    axes.push({
      tag: r.tag(at),
      min: r.fixed(at + 4),
      default: r.fixed(at + 8),
      max: r.fixed(at + 12),
      hidden: (r.u16(at + 16) & 1) === 1,
      nameId: r.u16(at + 18)
    })
  }
  const instances: NamedInstance[] = []
  const instancesAt = axesOffset + axisCount * axisSize
  for (let i = 0; i < instanceCount; i++) {
    const at = instancesAt + i * instanceSize
    const coordinates: Record<string, number> = {}
    axes.forEach((axis, a) => {
      coordinates[axis.tag] = r.fixed(at + 4 + a * 4)
    })
    const hasPsName = instanceSize >= axisCount * 4 + 6
    instances.push({
      nameId: r.u16(at),
      postScriptNameId: hasPsName ? r.u16(at + 4 + axisCount * 4) : null,
      coordinates
    })
  }
  return { axes, instances }
}

// ---------------------------------------------------------------------------------------------
// GSUB / GPOS feature lists

export type FeatureEntry = {
  tag: string
  /** Name id of the UI label a stylistic set or character variant carries, if any. */
  uiNameId: number | null
}

/** The distinct feature tags of a GSUB or GPOS table, in first-seen order. */
export function parseFeatureList(bytes: Uint8Array): FeatureEntry[] {
  const r = new Reader(bytes)
  const featureListOffset = r.u16(6)
  if (featureListOffset === 0) return []
  const count = r.u16(featureListOffset)
  const seen = new Map<string, FeatureEntry>()
  for (let i = 0; i < count; i++) {
    const record = featureListOffset + 2 + i * 6
    const tag = r.tag(record)
    const featureAt = featureListOffset + r.u16(record + 4)
    let uiNameId: number | null = null
    if (/^(ss\d\d|cv\d\d)$/.test(tag) && r.has(featureAt, 2)) {
      const paramsOffset = r.u16(featureAt)
      // ssXX: { version, uiNameId }; cvXX: { format, featUiLabelNameId, ... }
      if (paramsOffset !== 0 && r.has(featureAt + paramsOffset, 4)) {
        const id = r.u16(featureAt + paramsOffset + 2)
        uiNameId = id >= 256 ? id : null
      }
    }
    const existing = seen.get(tag)
    if (!existing) {
      seen.set(tag, { tag, uiNameId })
    } else if (existing.uiNameId === null && uiNameId !== null) {
      existing.uiNameId = uiNameId
    }
  }
  return [...seen.values()]
}
