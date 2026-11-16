// Readers for the OpenType tables the viewer shows: name, head, hhea, maxp, OS/2, post, cmap, fvar
// and the feature lists of GSUB/GPOS. Each takes the table's bytes and returns plain data.

import { FontError, Reader } from './bytes'

// ---------------------------------------------------------------------------------------------
// name

/** One name record; its string is decoded only when the viewer asks for it. */
export type NameRecord = {
  platformId: number
  encodingId: number
  languageId: number
  nameId: number
  /** BCP-47-ish language of the record when known ("en", "ru", "ja"), else "". */
  language: string
  /** Where the string lies in the table's storage. */
  offset: number
  length: number
}

const MAC_ROMAN_HIGH =
  'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø' +
  '¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ'

function decodeMacRoman(bytes: Uint8Array): string {
  const chars: string[] = new Array(bytes.byteLength)
  for (let i = 0; i < bytes.byteLength; i++) {
    const byte = bytes[i]
    chars[i] = byte < 0x80 ? String.fromCharCode(byte) : MAC_ROMAN_HIGH[byte - 0x80]
  }
  return chars.join('')
}

const utf16 = new TextDecoder('utf-16be')

function decodeUtf16(bytes: Uint8Array): string {
  return utf16.decode(bytes.subarray(0, bytes.byteLength & ~1))
}

/** Drops trailing NULs; a loop, because /\u0000+$/ is quadratic on long runs of NULs. */
export function trimNuls(text: string): string {
  let end = text.length
  while (end > 0 && text.charCodeAt(end - 1) === 0) end--
  return end === text.length ? text : text.slice(0, end)
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

/** Records a name lookup tries before giving up on blank strings. */
const MAX_TRIES = 8
/** Language tags are short; a longer one is cut, not decoded whole. */
const MAX_TAG_BYTES = 64

/**
 * A name table: records indexed by name id; strings are decoded on demand, once per (encoding,
 * offset, length), so a table of thousands of records sharing one long string stays cheap.
 */
export class NameTable {
  private readonly byId = new Map<number, NameRecord[]>()
  private readonly strings = new Map<string, string>()
  private readonly picked = new Map<string, string | null>()
  readonly size: number

  constructor(
    private readonly reader: Reader,
    private readonly storage: number,
    records: NameRecord[]
  ) {
    this.size = records.length
    for (const record of records) {
      const list = this.byId.get(record.nameId)
      if (list) list.push(record)
      else this.byId.set(record.nameId, [record])
    }
  }

  /** How many distinct strings were decoded so far (records sharing storage share one). */
  get decodedStrings(): number {
    return this.strings.size
  }

  /** The decoded string of a record, without trailing NULs. */
  text(record: NameRecord): string {
    const mac = record.platformId === 1
    const key = `${mac ? 'm' : 'u'}:${record.offset}:${record.length}`
    let value = this.strings.get(key)
    if (value === undefined) {
      const raw = this.reader.slice(this.storage + record.offset, record.length)
      value = trimNuls(mac ? decodeMacRoman(raw) : decodeUtf16(raw))
      this.strings.set(key, value)
    }
    return value
  }

  /**
   * The best string for `nameId`: the UI language first, then English, then anything, preferring
   * Windows/Unicode records over Mac ones at each step; blank strings are skipped.
   */
  pick(nameId: number, uiLanguage: string): string | null {
    const ui = uiLanguage.toLowerCase().split('-')[0]
    const cacheKey = `${nameId}:${ui}`
    const cached = this.picked.get(cacheKey)
    if (cached !== undefined) return cached
    const candidates = (this.byId.get(nameId) ?? []).map((record, order) => {
      const lang = record.language.split('-')[0]
      let score = record.platformId === 1 ? 0 : 1
      if (lang === ui) score += 20
      else if (lang === 'en') score += 10
      else if (lang === '') score += 5
      if (record.platformId === 3 && record.languageId === 0x0409) score += 2
      return { record, score, order }
    })
    candidates.sort((a, b) => b.score - a.score || a.order - b.order)
    let result: string | null = null
    for (const { record } of candidates.slice(0, MAX_TRIES)) {
      const value = this.text(record)
      if (value.trim()) {
        result = value
        break
      }
    }
    this.picked.set(cacheKey, result)
    return result
  }
}

export function parseName(bytes: Uint8Array): NameTable {
  const r = new Reader(bytes)
  const format = r.u16(0)
  const count = r.u16(2)
  const storage = r.u16(4)
  // Format 1 language tags, decoded only when a record uses one.
  const tagAt = 6 + count * 12
  const tagCount = format === 1 && r.has(tagAt, 2) ? r.u16(tagAt) : 0
  const tags = new Map<number, string>()
  const tagOf = (index: number): string => {
    let tag = tags.get(index)
    if (tag === undefined) {
      tag = ''
      if (index < tagCount && r.has(tagAt + 2 + index * 4, 4)) {
        const length = Math.min(r.u16(tagAt + 2 + index * 4), MAX_TAG_BYTES)
        const offset = r.u16(tagAt + 4 + index * 4)
        if (r.has(storage + offset, length)) tag = decodeUtf16(r.slice(storage + offset, length)).toLowerCase()
      }
      tags.set(index, tag)
    }
    return tag
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
    if (!r.has(storage + offset, length)) continue
    const unicode = platformId === 0 || (platformId === 3 && (encodingId === 0 || encodingId === 1 || encodingId === 10))
    if (!unicode && !(platformId === 1 && encodingId === 0)) continue
    let language = ''
    if (languageId >= 0x8000) {
      language = tagOf(languageId - 0x8000)
    } else if (platformId === 3) {
      language = WINDOWS_LANGUAGES[languageId & 0x3ff] ?? ''
    } else if (platformId === 1) {
      language = MAC_LANGUAGES[languageId] ?? ''
    }
    records.push({ platformId, encodingId, languageId, nameId, language, offset, length })
  }
  return new NameTable(r, storage, records)
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
  /** Subtables that could not be read, or were cut short. */
  problems: string[]
}

const UNICODE_SIZE = 0x110000

/** Thrown when one parseCmap call has done all the work its budget allows. */
class OverBudget extends Error {}

/** The work one parseCmap call may do, shared by every subtable it tries. */
class Work {
  constructor(public left: number) {}

  /** One loop step: a code point read, a segment or group visited, or a glyph read skipped. */
  step(): void {
    if (--this.left < 0) {
      throw new OverBudget()
    }
  }
}

/**
 * Collects code point → glyph pairs. A code point is kept the first time it comes (a bitset
 * drops repeats), and every step is paid from the call's shared `work`, so overlapping ranges or
 * glyph reads that fall past the table cannot make it loop for long.
 */
class MapBuilder {
  private codes = new Uint32Array(1024)
  private glyphs = new Uint32Array(1024)
  private readonly seen = new Uint8Array(UNICODE_SIZE >> 3)
  private size = 0
  private sorted = true

  constructor(
    private readonly macRoman: boolean,
    private readonly work: Work
  ) {}

  /** A loop step that adds nothing. */
  step(): void {
    this.work.step()
  }

  add(code: number, glyph: number): void {
    this.work.step()
    if (this.macRoman) {
      // A Mac Roman subtable maps single bytes; the high half is not Latin-1.
      if (code > 0xff) return
      if (code >= 0x80) code = MAC_ROMAN_HIGH.charCodeAt(code - 0x80)
    }
    if (glyph === 0 || code >= UNICODE_SIZE) {
      return
    }
    const bit = 1 << (code & 7)
    if (this.seen[code >> 3] & bit) {
      return
    }
    this.seen[code >> 3] |= bit
    if (this.size === this.codes.length) {
      const codes = new Uint32Array(this.size * 2)
      codes.set(this.codes)
      this.codes = codes
      const glyphs = new Uint32Array(this.size * 2)
      glyphs.set(this.glyphs)
      this.glyphs = glyphs
    }
    if (this.size > 0 && code < this.codes[this.size - 1]) {
      this.sorted = false
    }
    this.codes[this.size] = code
    this.glyphs[this.size] = glyph
    this.size++
  }

  finish(): { codes: Uint32Array; glyphs: Uint32Array } {
    const codes = this.codes.slice(0, this.size)
    const glyphs = this.glyphs.slice(0, this.size)
    if (this.sorted) {
      return { codes, glyphs }
    }
    // Out of order: walk the bitset, which is already in code point order.
    const glyphOf = new Uint32Array(UNICODE_SIZE)
    for (let i = 0; i < this.size; i++) glyphOf[codes[i]] = glyphs[i]
    let n = 0
    for (let byte = 0; byte < this.seen.length; byte++) {
      const bits = this.seen[byte]
      if (!bits) continue
      for (let b = 0; b < 8; b++) {
        if (bits & (1 << b)) {
          const code = (byte << 3) | b
          codes[n] = code
          glyphs[n] = glyphOf[code]
          n++
        }
      }
    }
    return { codes, glyphs }
  }
}

/** Subtable preference: full-Unicode first, then BMP, then symbol, then Mac Roman. */
const CMAP_PREFERENCE: [number, number][] = [
  [3, 10], [0, 6], [0, 4], [3, 1], [0, 3], [0, 2], [0, 1], [0, 0], [3, 0], [1, 0]
]

/** Subtables one parseCmap call tries at most; real fonts have a handful. */
export const MAX_CMAP_SUBTABLES = 16

/**
 * The font's character map from its best subtable. A damaged subtable is skipped for the next
 * best one, up to MAX_CMAP_SUBTABLES. `budget` bounds the loop steps of the whole call, shared by
 * every subtable tried: overlapping ranges, glyph reads past the table, or many overlapping
 * subtables that each fail at the end would otherwise repeat all of Unicode many times.
 */
export function parseCmap(bytes: Uint8Array, budget = 2 * UNICODE_SIZE): CharMap {
  const r = new Reader(bytes)
  const numTables = r.u16(2)
  const subtables: { platform: number; encoding: number; offset: number; format: number }[] = []
  for (let i = 0; i < numTables && r.has(4 + i * 8, 8); i++) {
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
  const problems: string[] = []
  const tried = new Set<string>()
  const work = new Work(budget)
  for (const sub of subtables) {
    const label = `cmap ${sub.platform}/${sub.encoding} format ${sub.format}`
    const key = `${sub.offset}:${sub.platform === 1 && sub.encoding === 0}`
    if (tried.has(key)) continue
    if (tried.size === MAX_CMAP_SUBTABLES) {
      problems.push(`cmap: only the first ${MAX_CMAP_SUBTABLES} subtables were tried`)
      break
    }
    tried.add(key)
    const builder = new MapBuilder(sub.platform === 1 && sub.encoding === 0, work)
    let known: boolean
    try {
      known = readSubtable(r, sub.offset, sub.format, builder)
    } catch (error) {
      if (error instanceof OverBudget) {
        // The budget is spent: keep what this subtable gave and try no other.
        problems.push(`${label}: reading stopped after ${budget} steps (ranges that overlap or point past the table)`)
        known = true
      } else {
        problems.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
    }
    if (known) {
      const { codes, glyphs } = builder.finish()
      return { codes, glyphs, source: `${sub.platform}/${sub.encoding}`, symbol: sub.platform === 3 && sub.encoding === 0, problems }
    }
  }
  return { codes: new Uint32Array(0), glyphs: new Uint32Array(0), source: '', symbol: false, problems }
}

function readSubtable(r: Reader, at: number, format: number, out: MapBuilder): boolean {
  switch (format) {
    case 0: {
      for (let code = 0; code < 256; code++) {
        out.add(code, r.u8(at + 6 + code))
      }
      return true
    }
    case 4: {
      const segCountX2 = r.u16(at + 6)
      const segCount = segCountX2 >> 1
      const endCodes = at + 14
      const startCodes = endCodes + segCountX2 + 2
      const idDeltas = startCodes + segCountX2
      const idRangeOffsets = idDeltas + segCountX2
      for (let s = 0; s < segCount; s++) {
        out.step()
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
            if (!r.has(glyphAt, 2)) {
              out.step()
              continue
            }
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
        out.step()
        const group = at + 16 + g * 12
        const start = r.u32(group)
        const end = Math.min(r.u32(group + 4), UNICODE_SIZE - 1)
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
export type FvarTable = {
  axes: Axis[]
  instances: NamedInstance[]
  /** Instances that were not read: past the end of the table or over the work limit. */
  skippedInstances: number
}

/** More axes than any real font has; each one becomes a slider. */
const MAX_AXES = 64

/**
 * The variation axes and named instances. Record sizes are checked against the spec (an instance
 * is 4 + 4·axes bytes, or 6 more with a PostScript name id) and `maxWork` bounds instances × axes.
 */
export function parseFvar(bytes: Uint8Array, maxWork = 65536): FvarTable {
  const r = new Reader(bytes)
  const axesOffset = r.u16(4)
  const axisCount = r.u16(8)
  const axisSize = r.u16(10)
  const instanceCount = r.u16(12)
  const instanceSize = r.u16(14)
  if (axisSize < 20) {
    throw new FontError('damaged', `fvar axis records of ${axisSize} bytes`)
  }
  if (axisCount > MAX_AXES) {
    throw new FontError('damaged', `fvar lists ${axisCount} axes, more than ${MAX_AXES}`)
  }
  if (!r.has(axesOffset, axisCount * axisSize)) {
    throw new FontError('damaged', `fvar axis records run past the end of the table`)
  }
  const plainSize = 4 + axisCount * 4
  if (instanceCount > 0 && instanceSize !== plainSize && instanceSize !== plainSize + 2) {
    throw new FontError('damaged', `fvar instance records of ${instanceSize} bytes for ${axisCount} axes`)
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
  const instancesAt = axesOffset + axisCount * axisSize
  const fit = instanceSize > 0 ? Math.max(0, Math.floor((r.length - instancesAt) / instanceSize)) : 0
  const readable = Math.min(instanceCount, fit, Math.floor(maxWork / Math.max(1, axisCount)))
  const hasPsName = instanceSize === plainSize + 2
  const instances: NamedInstance[] = []
  for (let i = 0; i < readable; i++) {
    const at = instancesAt + i * instanceSize
    const coordinates: Record<string, number> = {}
    axes.forEach((axis, a) => {
      coordinates[axis.tag] = r.fixed(at + 4 + a * 4)
    })
    instances.push({
      nameId: r.u16(at),
      postScriptNameId: hasPsName ? r.u16(at + 4 + axisCount * 4) : null,
      coordinates
    })
  }
  return { axes, instances, skippedInstances: instanceCount - readable }
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
