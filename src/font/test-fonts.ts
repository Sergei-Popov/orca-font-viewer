// The small fonts the unit tests read, written here table by table, byte by byte: the repository
// holds no font files and no encoded font data. Every glyph is a rectangle, so the fonts carry no
// third-party design or licence. Formats: TrueType and CFF sfnt, a collection, WOFF 1.0 (with a
// small zlib encoder) and WOFF 2.0 (transformed glyf and loca, Brotli as stored meta-blocks).

// ------------------------------------------------------------------------------------------------
// Writers

/** Big-endian bytes; negative numbers are written in two's complement. */
export class Bytes {
  private parts: number[] = []
  u8(...values: number[]): this {
    for (const v of values) this.parts.push(v & 0xff)
    return this
  }
  u16(...values: number[]): this {
    for (const v of values) this.parts.push((v >> 8) & 0xff, v & 0xff)
    return this
  }
  u32(...values: number[]): this {
    for (const v of values) this.parts.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff)
    return this
  }
  /** 16.16 fixed point. */
  fixed(...values: number[]): this {
    return this.u32(...values.map((v) => Math.round(v * 65536)))
  }
  tag(tag: string): this {
    for (let i = 0; i < 4; i++) this.parts.push(tag.charCodeAt(i))
    return this
  }
  bytes(data: ArrayLike<number>): this {
    for (let i = 0; i < data.length; i++) this.parts.push(data[i])
    return this
  }
  /** WOFF2's UIntBase128: 7 bits a byte, most significant first. */
  base128(value: number): this {
    const groups: number[] = []
    do {
      groups.unshift(value & 0x7f)
      value = Math.floor(value / 128)
    } while (value > 0)
    return this.u8(...groups.map((b, i) => (i < groups.length - 1 ? b | 0x80 : b)))
  }
  /** WOFF2's 255UInt16, for values below 253. */
  u255(value: number): this {
    if (value >= 253) throw new Error('255UInt16 above 252 is not needed here')
    return this.u8(value)
  }
  pad4(): this {
    while (this.parts.length % 4) this.parts.push(0)
    return this
  }
  get length(): number {
    return this.parts.length
  }
  done(): Uint8Array {
    return Uint8Array.from(this.parts)
  }
}

/** Bits packed from the least significant end of each byte, as deflate and Brotli read them. */
class Bits {
  private readonly out: number[] = []
  private byte = 0
  private used = 0
  write(value: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.byte |= ((value >>> i) & 1) << this.used
      if (++this.used === 8) this.flush()
    }
  }
  /** A Huffman code: its bits go out most significant first. */
  code(value: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) this.write((value >>> i) & 1, 1)
  }
  align(): void {
    if (this.used) this.flush()
  }
  bytes(data: Uint8Array): void {
    this.align()
    this.out.push(...data)
  }
  done(): Uint8Array {
    this.align()
    return Uint8Array.from(this.out)
  }
  private flush(): void {
    this.out.push(this.byte)
    this.byte = 0
    this.used = 0
  }
}

export const utf16 = (text: string): Uint8Array => {
  const out = new Bytes()
  for (let i = 0; i < text.length; i++) out.u16(text.charCodeAt(i))
  return out.done()
}

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** `head` followed by `children`; each child's offset from the start of `head` goes in as a u16 at its slot. */
function nest(head: Uint8Array, children: [slot: number, child: Uint8Array][]): Uint8Array {
  const out = concat([head, ...children.map(([, child]) => child)])
  let at = head.length
  for (const [slot, child] of children) {
    out[slot] = at >> 8
    out[slot + 1] = at & 0xff
    at += child.length
  }
  return out
}

function checksum(bytes: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < bytes.length; i += 4) {
    sum = (sum + ((bytes[i] << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0))) >>> 0
  }
  return sum
}

// ------------------------------------------------------------------------------------------------
// The font: nine glyphs, seven characters, a ligature, a stylistic set and a kerning pair

const GLYPH_NAMES = ['.notdef', 'space', 'A', 'B', 'f', 'i', 'f_i', 'uni0411', 'u1F600']
const SPACE = 1
const [A, B, F, I, F_I] = [2, 3, 4, 5, 6]
/** Code point → glyph id. */
export const CHARACTERS: [code: number, glyph: number][] = [
  [0x20, SPACE], [0x41, A], [0x42, B], [0x66, F], [0x69, I], [0x411, 7], [0x1f600, 8]
]
/** The rectangle every glyph but the space draws, as a clockwise contour. */
const BOX: [number, number][] = [[50, 0], [50, 700], [550, 700], [550, 0]]
const advance = (glyph: number) => (glyph === SPACE ? 250 : 600)
const contours = (glyph: number): [number, number][][] => (glyph === SPACE ? [] : [BOX])

/** Seconds from 1904 to 2026-01-05 12:00 UTC, the fonts' created and modified dates. */
const CREATED = (Date.UTC(2026, 0, 5, 12) - Date.UTC(1904, 0, 1)) / 1000

const NAME_UI = { alternateA: 256, weight: 257, width: 258, bold: 259, thinCondensed: 260 }

export type FontOptions = {
  family?: string
  style?: string
  weight?: number
  outlines?: 'truetype' | 'cff'
  /** wght 100–900 and wdth 75–125 axes with two named instances (fvar only: no variation data). */
  variable?: boolean
}

export type BuiltFont = { sfntVersion: number; tables: Record<string, Uint8Array> }

export function buildFont(options: FontOptions = {}): BuiltFont {
  const { family = 'Fixture Sans', style = 'Regular', weight = 400, outlines = 'truetype', variable = false } = options
  const postScriptName = `${family.replace(/ /g, '')}-${style}`
  const bold = weight >= 700
  const tables: Record<string, Uint8Array> = {
    head: head(bold),
    hhea: hhea(),
    maxp: outlines === 'cff' ? new Bytes().u32(0x00005000).u16(GLYPH_NAMES.length).done() : maxp(),
    'OS/2': os2(weight, bold),
    hmtx: hmtx(),
    cmap: cmap(),
    name: name(family, style, postScriptName, variable),
    post: new Bytes().u32(0x00030000).fixed(0).u16(-100, 50).u32(0, 0, 0, 0, 0).done(),
    GSUB: gsub(),
    GPOS: gpos()
  }
  if (outlines === 'cff') {
    tables['CFF '] = cff(postScriptName, `${family} ${style}`)
  } else {
    const { glyf, loca } = glyfAndLoca()
    tables.glyf = glyf
    tables.loca = loca
  }
  if (variable) tables.fvar = fvar()
  return { sfntVersion: outlines === 'cff' ? 0x4f54544f : 0x00010000, tables }
}

function head(bold: boolean): Uint8Array {
  return new Bytes()
    .u16(1, 0)
    .fixed(1.002)
    .u32(0, 0x5f0f3cf5) // checkSumAdjustment (set by sfnt), magic
    .u16(0x0003, 1000) // flags: baseline and left sidebearing at 0; unitsPerEm
    .u32(Math.floor(CREATED / 2 ** 32), CREATED % 2 ** 32, Math.floor(CREATED / 2 ** 32), CREATED % 2 ** 32)
    .u16(50, 0, 550, 700) // bounding box
    .u16(bold ? 1 : 0, 8, 2, 0, 0) // macStyle, lowestRecPPEM, fontDirectionHint, short loca, glyphDataFormat
    .done()
}

function hhea(): Uint8Array {
  return new Bytes()
    .u32(0x00010000)
    .u16(800, -200, 0, 600, 0, 50, 550, 1, 0, 0) // ascender … caretOffset
    .u16(0, 0, 0, 0, 0, GLYPH_NAMES.length) // reserved, metricDataFormat, numberOfHMetrics
    .done()
}

function maxp(): Uint8Array {
  return new Bytes().u32(0x00010000).u16(GLYPH_NAMES.length, 4, 1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0).done()
}

function os2(weight: number, bold: boolean): Uint8Array {
  return new Bytes()
    .u16(4, 550, weight, 5, 0x0008) // version, xAvgCharWidth, weight, width, fsType: editable embedding
    .u16(650, 600, 0, 75, 650, 600, 0, 350, 50, 300, 0) // sub/superscript, strikeout, family class
    .u8(0, 0, 0, 0, 0, 0, 0, 0, 0, 0) // PANOSE
    .u32((1 << 0) | (1 << 9), 0, 0, 0) // Unicode ranges: Basic Latin, Cyrillic
    .tag('TEST')
    .u16(bold ? 0x0020 : 0x0040, 0x20, 0xffff) // fsSelection, first and last character
    .u16(800, -200, 0, 800, 200) // typo ascender, descender, line gap; win ascent, descent
    .u32((1 << 0) | (1 << 2), 0) // code pages: Latin 1, Cyrillic
    .u16(500, 700, 0, 0x20, 2) // xHeight, capHeight, default char, break char, max context
    .done()
}

function hmtx(): Uint8Array {
  const out = new Bytes()
  GLYPH_NAMES.forEach((_, glyph) => out.u16(advance(glyph), glyph === SPACE ? 0 : 50))
  return out.done()
}

function cmap(): Uint8Array {
  // Format 4 for the BMP: one segment per run of consecutive codes and glyphs, then 0xFFFF.
  const segments: [start: number, end: number, glyph: number][] = []
  for (const [code, glyph] of CHARACTERS.filter(([code]) => code <= 0xffff)) {
    const last = segments[segments.length - 1]
    if (last && code === last[1] + 1 && glyph === last[2] + code - last[0]) last[1] = code
    else segments.push([code, code, glyph])
  }
  segments.push([0xffff, 0xffff, 0])
  const n = segments.length
  const selector = Math.floor(Math.log2(n))
  const format4 = new Bytes()
    .u16(4, 16 + n * 8, 0, n * 2, 2 ** selector * 2, selector, n * 2 - 2 ** selector * 2)
    .u16(...segments.map((s) => s[1]))
    .u16(0)
    .u16(...segments.map((s) => s[0]))
    .u16(...segments.map((s) => (s[0] === 0xffff ? 1 : s[2] - s[0])))
    .u16(...segments.map(() => 0))
    .done()
  // Format 12 for everything.
  const format12 = new Bytes().u16(12, 0).u32(16 + CHARACTERS.length * 12, 0, CHARACTERS.length)
  for (const [code, glyph] of CHARACTERS) format12.u32(code, code, glyph)
  return new Bytes()
    .u16(0, 2)
    .u16(3, 1).u32(20)
    .u16(3, 10).u32(20 + format4.length)
    .bytes(format4)
    .bytes(format12.done())
    .done()
}

function name(family: string, style: string, postScriptName: string, variable: boolean): Uint8Array {
  const english: [number, string][] = [
    [0, 'Copyright 2026 Font Viewer tests'],
    [1, family],
    [2, style],
    [3, `fixture:${postScriptName}`],
    [4, `${family} ${style}`],
    [5, 'Version 1.002'],
    [6, postScriptName],
    [9, 'Font Viewer'],
    [12, 'https://example.com/designer'],
    [13, 'Free to use in tests.'],
    [14, 'https://example.com/license'],
    [19, 'Fixture sample'],
    [NAME_UI.alternateA, 'Alternate A']
  ]
  if (variable) {
    english.push([NAME_UI.weight, 'Weight'], [NAME_UI.width, 'Width'], [NAME_UI.bold, 'Bold'], [NAME_UI.thinCondensed, 'Thin Condensed'])
  }
  // Sorted by platform, encoding, language, then name id.
  const records: [language: number, id: number, text: string][] = [
    ...english.map(([id, text]): [number, number, string] => [0x409, id, text]),
    [0x419, 1, 'Тестовый']
  ]
  const out = new Bytes().u16(0, records.length, 6 + records.length * 12)
  const storage = new Bytes()
  for (const [language, id, text] of records) {
    const data = utf16(text)
    out.u16(3, 1, language, id, data.length, storage.length)
    storage.bytes(data)
  }
  return out.bytes(storage.done()).done()
}

function glyfAndLoca(): { glyf: Uint8Array; loca: Uint8Array } {
  const glyf = new Bytes()
  const loca = new Bytes()
  GLYPH_NAMES.forEach((_, glyph) => {
    loca.u16(glyf.length / 2)
    const shape = contours(glyph)
    if (!shape.length) return // an empty glyph takes no bytes
    const points = shape.flat()
    const xs: number[] = []
    const ys: number[] = []
    let [x, y] = [0, 0]
    for (const [px, py] of points) {
      xs.push(px - x)
      ys.push(py - y)
      ;[x, y] = [px, py]
    }
    let end = -1
    glyf.u16(shape.length, 50, 0, 550, 700) // contours, bounding box
    glyf.u16(...shape.map((contour) => (end += contour.length)), 0) // end points, no instructions
    glyf.u8(...points.map(() => 0x01)) // on curve, 16-bit coordinates
    glyf.u16(...xs).u16(...ys).pad4()
  })
  loca.u16(glyf.length / 2)
  return { glyf: glyf.done(), loca: loca.done() }
}

function fvar(): Uint8Array {
  return new Bytes()
    .u16(1, 0, 16, 2, 2, 20, 2, 12) // version, axes at 16, 2 axes of 20 bytes, 2 instances of 12
    .tag('wght').fixed(100, 400, 900).u16(0, NAME_UI.weight)
    .tag('wdth').fixed(75, 100, 125).u16(0, NAME_UI.width)
    .u16(NAME_UI.bold, 0).fixed(700, 100)
    .u16(NAME_UI.thinCondensed, 0).fixed(100, 75)
    .done()
}

// GSUB and GPOS: scripts DFLT and latn, each with every feature in its default language system.

function scriptList(featureCount: number): Uint8Array {
  const script = () => new Bytes().u16(4, 0).u16(0, 0xffff, featureCount).u16(...Array.from({ length: featureCount }, (_, i) => i)).done()
  const head = new Bytes().u16(2).tag('DFLT').u16(0).tag('latn').u16(0).done()
  return nest(head, [[6, script()], [12, script()]])
}

/** Features in tag order, each with its lookups and optional feature parameters. */
function featureList(features: [tag: string, lookups: number[], params?: Uint8Array][]): Uint8Array {
  const head = new Bytes().u16(features.length)
  for (const [tag] of features) head.tag(tag).u16(0)
  return nest(
    head.done(),
    features.map(([, lookups, params], i): [number, Uint8Array] => {
      const table = new Bytes().u16(0, lookups.length).u16(...lookups).done()
      return [2 + i * 6 + 4, params ? nest(table, [[0, params]]) : table]
    })
  )
}

function lookupList(lookups: [type: number, subtable: Uint8Array][]): Uint8Array {
  const head = new Bytes().u16(lookups.length, ...lookups.map(() => 0)).done()
  return nest(
    head,
    lookups.map(([type, subtable], i): [number, Uint8Array] => [2 + i * 2, nest(new Bytes().u16(type, 0, 1, 0).done(), [[6, subtable]])])
  )
}

const coverage = (...glyphs: number[]) => new Bytes().u16(1, glyphs.length, ...glyphs).done()

function layoutTable(scripts: Uint8Array, features: Uint8Array, lookups: Uint8Array): Uint8Array {
  return nest(new Bytes().u16(1, 0, 0, 0, 0).done(), [[4, scripts], [6, features], [8, lookups]])
}

function gsub(): Uint8Array {
  const ligature = new Bytes().u16(F_I, 2, I).done() // f + i → f_i
  const ligatureSet = nest(new Bytes().u16(1, 0).done(), [[2, ligature]])
  const ligatures = nest(new Bytes().u16(1, 0, 1, 0).done(), [[2, coverage(F)], [6, ligatureSet]])
  const single = nest(new Bytes().u16(1, 0, B - A).done(), [[2, coverage(A)]]) // A → B
  return layoutTable(
    scriptList(2),
    featureList([['liga', [0]], ['ss01', [1], new Bytes().u16(0, NAME_UI.alternateA).done()]]),
    lookupList([[4, ligatures], [1, single]])
  )
}

function gpos(): Uint8Array {
  const pairSet = new Bytes().u16(1, B, -50).done() // A then B: 50 units closer
  const pairs = nest(new Bytes().u16(1, 0, 0x0004, 0, 1, 0).done(), [[2, coverage(A)], [10, pairSet]])
  return layoutTable(scriptList(1), featureList([['kern', [0]]]), lookupList([[2, pairs]]))
}

// CFF: one font, its glyphs as Type 2 charstrings, widths through defaultWidthX / nominalWidthX.

/** A DICT or Type 2 charstring integer. */
function cffNumber(v: number): number[] {
  if (v >= -107 && v <= 107) return [v + 139]
  if (v >= 108 && v <= 1131) return [((v - 108) >> 8) + 247, (v - 108) & 0xff]
  if (v >= -1131 && v <= -108) return [((-v - 108) >> 8) + 251, (-v - 108) & 0xff]
  return [28, (v >> 8) & 0xff, v & 0xff]
}

/** A DICT integer of fixed size (operator 29), for offsets known only later. */
const cffLong = (v: number) => new Bytes().u8(29).u32(v).done()

function cffIndex(items: Uint8Array[]): Uint8Array {
  if (!items.length) return new Bytes().u16(0).done()
  const end = items.reduce((sum, item) => sum + item.length, 1)
  const size = end < 0x100 ? 1 : end < 0x10000 ? 2 : 3
  const out = new Bytes().u16(items.length).u8(size)
  let offset = 1
  for (const item of [...items, null]) {
    for (let b = size - 1; b >= 0; b--) out.u8(offset >>> (b * 8))
    if (item) offset += item.length
  }
  for (const item of items) out.bytes(item)
  return out.done()
}

function cff(postScriptName: string, fullName: string): Uint8Array {
  const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0))
  // Standard strings: space 1, A 34, B 35, f 71, i 74; the rest are custom, from 391 on.
  const custom = [fullName, 'f_i', 'uni0411', 'u1F600']
  const charset = new Bytes().u8(0).u16(1, 34, 35, 71, 74, 392, 393, 394).done()
  const box = [...cffNumber(50), ...cffNumber(0), 21, ...cffNumber(700), ...cffNumber(500), ...cffNumber(-700), 7, 14]
  const charStrings = cffIndex(
    GLYPH_NAMES.map((_, glyph) => Uint8Array.from(glyph === SPACE ? [...cffNumber(250), 14] : box))
  )
  const privateDict = Uint8Array.from([...cffNumber(600), 20, ...cffNumber(0), 21])
  const topDict = (charsetAt: number, charStringsAt: number, privateAt: number) =>
    concat([
      Uint8Array.from([...cffNumber(391), 2, ...cffNumber(50), ...cffNumber(0), ...cffNumber(550), ...cffNumber(700), 5]),
      cffLong(charsetAt), Uint8Array.of(15),
      cffLong(charStringsAt), Uint8Array.of(17),
      cffLong(privateDict.length), cffLong(privateAt), Uint8Array.of(18)
    ])
  const header = Uint8Array.of(1, 0, 4, 4)
  const names = cffIndex([ascii(postScriptName)])
  const strings = cffIndex(custom.map(ascii))
  const globalSubrs = cffIndex([])
  const before = header.length + names.length + cffIndex([topDict(0, 0, 0)]).length + strings.length + globalSubrs.length
  const charsetAt = before
  const charStringsAt = charsetAt + charset.length
  const privateAt = charStringsAt + charStrings.length
  const top = cffIndex([topDict(charsetAt, charStringsAt, privateAt)])
  return concat([header, names, top, strings, globalSubrs, charset, charStrings, privateDict])
}

// ------------------------------------------------------------------------------------------------
// Containers

/** The table order OpenType recommends for the data (head first); the rest follow by tag. */
const DATA_ORDER = ['head', 'hhea', 'maxp', 'OS/2', 'hmtx', 'LTSH', 'VDMX', 'hdmx', 'cmap', 'fpgm', 'prep', 'cvt ', 'loca', 'glyf', 'kern', 'name', 'post', 'gasp', 'PCLT', 'CFF ']

/** A sfnt: records in tag order, data in the recommended order, 4-byte aligned, checksums and head's adjustment set. */
export function sfnt(font: BuiltFont): Uint8Array {
  const tags = Object.keys(font.tables).sort()
  const dataOrder = [...DATA_ORDER.filter((tag) => tag in font.tables), ...tags.filter((tag) => !DATA_ORDER.includes(tag))]
  const offsets = new Map<string, number>()
  let offset = 12 + tags.length * 16
  for (const tag of dataOrder) {
    offsets.set(tag, offset)
    offset += (font.tables[tag].length + 3) & ~3
  }
  const selector = Math.floor(Math.log2(tags.length))
  const out = new Bytes().u32(font.sfntVersion).u16(tags.length, 2 ** selector * 16, selector, tags.length * 16 - 2 ** selector * 16)
  for (const tag of tags) out.tag(tag).u32(checksum(font.tables[tag]), offsets.get(tag)!, font.tables[tag].length)
  for (const tag of dataOrder) out.bytes(font.tables[tag]).pad4()
  const bytes = out.done()
  if (font.tables.head) {
    const at = new DataView(bytes.buffer).getUint32(12 + tags.indexOf('head') * 16 + 8)
    new DataView(bytes.buffer).setUint32(at + 8, (0xb1b0afba - checksum(bytes)) >>> 0)
  }
  return bytes
}

/** A collection of whole sfnt files, their table offsets moved to where each lands. */
export function collection(fonts: Uint8Array[], offsets?: (starts: number[]) => number[], count = fonts.length): Uint8Array {
  const starts: number[] = []
  let at = 12 + count * 4
  for (const font of fonts) {
    starts.push(at)
    at += font.length
  }
  const directory = offsets ? offsets(starts) : starts
  if (directory.length !== count) throw new Error(`a collection of ${count} faces needs ${count} offsets`)
  const out = new Bytes().tag('ttcf').u32(0x00010000, count)
  for (const offset of directory) out.u32(offset)
  fonts.forEach((font, i) => {
    const copy = font.slice()
    const view = new DataView(copy.buffer)
    for (let t = 0; t < view.getUint16(4); t++) {
      view.setUint32(12 + t * 16 + 8, view.getUint32(12 + t * 16 + 8) + starts[i])
    }
    out.bytes(copy)
  })
  return out.done()
}

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DISTANCE_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]

const lastAtMost = (bases: number[], value: number) => {
  let i = 0
  while (i + 1 < bases.length && bases[i + 1] <= value) i++
  return i
}

/** zlib (RFC 1950): one deflate block with the fixed Huffman codes (RFC 1951, 3.2.6), greedy matches. */
export function zlib(data: Uint8Array): Uint8Array {
  const bits = new Bits()
  const symbol = (s: number) => {
    if (s < 144) bits.code(0x30 + s, 8)
    else if (s < 256) bits.code(0x190 + s - 144, 9)
    else if (s < 280) bits.code(s - 256, 7)
    else bits.code(0xc0 + s - 280, 8)
  }
  bits.write(1, 1) // last block
  bits.write(1, 2) // fixed Huffman codes
  const recent = new Map<number, number>()
  const key = (i: number) => (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
  for (let i = 0; i < data.length; ) {
    const from = i + 2 < data.length ? recent.get(key(i)) : undefined
    let length = 0
    if (from !== undefined && i - from <= 32768) {
      while (length < 258 && i + length < data.length && data[from + length] === data[i + length]) length++
    }
    if (length >= 3) {
      const l = lastAtMost(LENGTH_BASE, length)
      symbol(257 + l)
      bits.write(length - LENGTH_BASE[l], LENGTH_EXTRA[l])
      const distance = i - from!
      const d = lastAtMost(DISTANCE_BASE, distance)
      bits.code(d, 5)
      bits.write(distance - DISTANCE_BASE[d], Math.max(0, (d >> 1) - 1))
    } else {
      symbol(data[i])
      length = 1
    }
    for (const end = i + length; i < end; i++) if (i + 2 < data.length) recent.set(key(i), i)
  }
  symbol(256)
  let a = 1
  let b = 0
  for (const byte of data) {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  }
  return concat([Uint8Array.of(0x78, 0x9c), bits.done(), new Bytes().u32(((b << 16) | a) >>> 0).done()])
}

/** WOFF 1.0: each table zlib-compressed when that makes it smaller. */
export function woff(font: BuiltFont): Uint8Array {
  const tags = Object.keys(font.tables).sort()
  const stored = tags.map((tag) => {
    const data = font.tables[tag]
    const packed = zlib(data)
    return packed.length < data.length ? packed : data
  })
  const totalSfntSize = tags.reduce((sum, tag) => sum + ((font.tables[tag].length + 3) & ~3), 12 + tags.length * 16)
  const directory = new Bytes()
  let offset = 44 + tags.length * 20
  tags.forEach((tag, i) => {
    directory.tag(tag).u32(offset, stored[i].length, font.tables[tag].length, checksum(font.tables[tag]))
    offset += (stored[i].length + 3) & ~3
  })
  const body = new Bytes()
  for (const data of stored) body.bytes(data).pad4()
  return new Bytes()
    .tag('wOFF')
    .u32(font.sfntVersion, 44 + directory.length + body.length)
    .u16(tags.length, 0)
    .u32(totalSfntSize)
    .u16(1, 0)
    .u32(0, 0, 0, 0, 0)
    .bytes(directory.done())
    .bytes(body.done())
    .done()
}

/** A Brotli stream (RFC 7932) of stored meta-blocks: valid, and not compressed at all. */
export function brotliStored(data: Uint8Array): Uint8Array {
  const bits = new Bits()
  bits.write(0, 1) // window of 2^16
  for (let at = 0; at < data.length; at += 0x10000) {
    const chunk = data.subarray(at, at + 0x10000)
    bits.write(0, 1) // not the last meta-block
    bits.write(0, 2) // its length in 4 nibbles
    bits.write(chunk.length - 1, 16)
    bits.write(1, 1) // uncompressed
    bits.bytes(chunk)
  }
  bits.write(1, 1) // last meta-block
  bits.write(1, 1) // and empty
  return bits.done()
}

/** The tags WOFF2 encodes by index; the decoder's own list is in ./container. */
const WOFF2_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ']
const WOFF2_LATER_TAGS: Record<string, number> = { GPOS: 27, GSUB: 28, fvar: 47 }

/** WOFF2's transformed glyf (section 5.1) of the rectangles: points as 16-bit triplets, bounding boxes implied. */
function transformedGlyf(): Uint8Array {
  const counts = new Bytes()
  const points = new Bytes()
  const flags = new Bytes()
  const glyphs = new Bytes()
  GLYPH_NAMES.forEach((_, glyph) => {
    counts.u16(contours(glyph).length)
    for (const contour of contours(glyph)) {
      points.u255(contour.length)
      let [x, y] = [0, 0]
      for (const [px, py] of contour) {
        const [dx, dy] = [px - x, py - y]
        ;[x, y] = [px, py]
        flags.u8(124 + (dx >= 0 ? 1 : 0) + (dy >= 0 ? 2 : 0)) // on curve, 16-bit x and y, their signs
        glyphs.u16(Math.abs(dx), Math.abs(dy))
      }
    }
    if (contours(glyph).length) glyphs.u255(0) // no instructions
  })
  const bboxBitmap = new Uint8Array(((GLYPH_NAMES.length + 31) >> 5) << 2)
  return new Bytes()
    .u16(0, 0, GLYPH_NAMES.length, 0)
    .u32(counts.length, points.length, flags.length, glyphs.length, 0, bboxBitmap.length, 0)
    .bytes(counts.done())
    .bytes(points.done())
    .bytes(flags.done())
    .bytes(glyphs.done())
    .bytes(bboxBitmap)
    .done()
}

/** WOFF 2.0 of a TrueType or CFF font: glyf and loca transformed, the rest as they are. */
export function woff2(font: BuiltFont, compress: (data: Uint8Array) => Uint8Array = brotliStored): Uint8Array {
  const tags = Object.keys(font.tables).sort().filter((tag) => tag !== 'loca')
  if (font.tables.loca) tags.splice(tags.indexOf('glyf') + 1, 0, 'loca') // loca follows glyf
  const directory = new Bytes()
  const data: Uint8Array[] = []
  for (const tag of tags) {
    const index = WOFF2_TAGS.includes(tag) ? WOFF2_TAGS.indexOf(tag) : WOFF2_LATER_TAGS[tag]
    if (index === undefined) throw new Error(`no WOFF2 tag index for ${tag}`)
    directory.u8(index).base128(font.tables[tag].length) // transform version 0
    if (tag === 'glyf') {
      const glyf = transformedGlyf()
      directory.base128(glyf.length)
      data.push(glyf)
    } else if (tag === 'loca') {
      directory.base128(0) // rebuilt from glyf
    } else {
      data.push(font.tables[tag])
    }
  }
  const stream = compress(concat(data))
  const totalSfntSize = tags.reduce((sum, tag) => sum + ((font.tables[tag].length + 3) & ~3), 12 + tags.length * 16)
  const body = new Bytes().bytes(directory.done()).bytes(stream).pad4().done()
  return new Bytes()
    .tag('wOF2')
    .u32(font.sfntVersion, 48 + body.length)
    .u16(tags.length, 0)
    .u32(totalSfntSize, stream.length)
    .u16(1, 0)
    .u32(0, 0, 0, 0, 0)
    .bytes(body)
    .done()
}

// ------------------------------------------------------------------------------------------------
// The fixtures

/** A variable TrueType font: Fixture Sans Regular with wght and wdth. */
export const ttfFixture = sfnt(buildFont({ variable: true }))
/** The same face with CFF outlines, not variable. */
export const otfFixture = sfnt(buildFont({ outlines: 'cff' }))
export const woffFixture = woff(buildFont({ variable: true }))
export const woff2Fixture = woff2(buildFont({ variable: true }))
/** Fixture Sans Regular and Fixture Mono Bold. */
export const ttcFixture = collection([sfnt(buildFont()), sfnt(buildFont({ family: 'Fixture Mono', style: 'Bold', weight: 700 }))])
