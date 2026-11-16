// Opens the font file formats: plain sfnt (TrueType, OpenType CFF/CFF2), TrueType/OpenType
// collections, WOFF 1.0 (zlib per table) and WOFF 2.0 (one Brotli stream). The result is each
// face's tables as plain bytes, which src/font/tables.ts reads. WOFF2's transformed glyf, loca and
// hmtx are not rebuilt: the viewer never reads glyph outlines, Chromium draws the font itself.
// WOFF 2.0 needs the Brotli dictionary: `loadBrotliDictionary()` (./brotli-dictionary) must have
// finished before `openFont` reads such a file; `needsBrotliDictionary` tells when it has not.

import { decompress as brotliDecompress, hasDictionary } from '../../vendor/brotli/brotli.mjs'
import { unzlibSync } from '../../vendor/fflate/fflate.mjs'
import { FontError, Reader, tagValue } from './bytes'

export type Flavor = 'sfnt' | 'woff' | 'woff2'

export type TableInfo = {
  tag: string
  /** Size of the table in the font. */
  length: number
  /** Size in the WOFF/WOFF2 file when it differs (compressed or transformed). */
  stored?: number
  /** WOFF2 transformed it (glyf, loca, hmtx); its bytes are not available. */
  transformed?: boolean
  /** The directory places it (partly) past the end of the file, as in a file cut short. */
  outside?: boolean
}

export type Face = {
  /** The sfnt version: 0x00010000 or 'true' for TrueType outlines, 'OTTO' for CFF. */
  sfntVersion: number
  tables: Map<string, Uint8Array>
  tableList: TableInfo[]
  /** Why this face of a collection cannot be read; the other faces still open. */
  error?: string
}

/** Bounds on what a file may make the parser allocate; tests pass small ones. */
export type Limits = {
  /** Most bytes a WOFF or WOFF 2.0 file may unpack to. */
  maxUnpackedBytes: number
}

export const DEFAULT_LIMITS: Limits = { maxUnpackedBytes: 256 * 1024 * 1024 }

/** Faces a collection (sfnt or WOFF 2.0) may list; real ones have a few dozen at most. */
export const MAX_FACES = 10000

export type FontContainer = {
  flavor: Flavor
  collection: boolean
  faces: Face[]
  fileSize: number
  /** The WOFF file carries an extended metadata block. */
  hasWoffMetadata?: boolean
}

export const SFNT_TRUETYPE = 0x00010000
const TAG_TRUE = tagValue('true')
const TAG_OTTO = tagValue('OTTO')
const TAG_TYP1 = tagValue('typ1')
const TAG_TTCF = tagValue('ttcf')
const TAG_WOFF = tagValue('wOFF')
const TAG_WOF2 = tagValue('wOF2')

/** The format of `bytes`, from its first four bytes, or null when it is not a font. */
export function sniffFlavor(bytes: Uint8Array): (Flavor | 'collection') | null {
  if (bytes.byteLength < 4) {
    return null
  }
  const signature = new Reader(bytes).u32(0)
  if (signature === SFNT_TRUETYPE || signature === TAG_TRUE || signature === TAG_OTTO || signature === TAG_TYP1) {
    return 'sfnt'
  }
  if (signature === TAG_TTCF) return 'collection'
  if (signature === TAG_WOFF) return 'woff'
  if (signature === TAG_WOF2) return 'woff2'
  return null
}

/** A WOFF 2.0 file that cannot be opened until the Brotli dictionary is loaded. */
export function needsBrotliDictionary(bytes: Uint8Array): boolean {
  return sniffFlavor(bytes) === 'woff2' && !hasDictionary()
}

export function openFont(bytes: Uint8Array, limits: Limits = DEFAULT_LIMITS): FontContainer {
  const kind = sniffFlavor(bytes)
  switch (kind) {
    case 'sfnt':
      return { flavor: 'sfnt', collection: false, faces: [readSfntFace(bytes, 0)], fileSize: bytes.byteLength }
    case 'collection':
      return readCollection(bytes)
    case 'woff':
      return readWoff(bytes, limits)
    case 'woff2':
      return readWoff2(bytes, limits)
    default:
      throw new FontError('not-a-font', 'the file does not start with a font signature')
  }
}

/** One face's table directory at `offset` of a sfnt or a collection; tables are views of `bytes`. */
function readSfntFace(bytes: Uint8Array, offset: number): Face {
  const r = new Reader(bytes)
  const sfntVersion = r.u32(offset)
  const numTables = r.u16(offset + 4)
  if (numTables === 0 || numTables > 1024) {
    throw new FontError('damaged', `table directory lists ${numTables} tables`)
  }
  const tables = new Map<string, Uint8Array>()
  const tableList: TableInfo[] = []
  for (let i = 0; i < numTables; i++) {
    const record = offset + 12 + i * 16
    const tag = r.tag(record)
    const tableOffset = r.u32(record + 8)
    const length = r.u32(record + 12)
    if (r.has(tableOffset, length)) {
      tableList.push({ tag, length })
      tables.set(tag, r.slice(tableOffset, length))
    } else {
      tableList.push({ tag, length, outside: true })
    }
  }
  return { sfntVersion, tables, tableList }
}

/** A face that could not be read, kept so the collection's numbering stays right. */
function brokenFace(error: unknown): Face {
  const message = error instanceof FontError ? error.message : String(error)
  return { sfntVersion: 0, tables: new Map(), tableList: [], error: message }
}

function readCollection(bytes: Uint8Array): FontContainer {
  const r = new Reader(bytes)
  const numFonts = r.u32(8)
  if (numFonts === 0 || numFonts > MAX_FACES || !r.has(12, numFonts * 4)) {
    throw new FontError('damaged', `collection lists ${numFonts} fonts`)
  }
  // Faces that share a directory share one Face: a file cannot multiply its work by repeating offsets.
  const byOffset = new Map<number, Face>()
  const faces: Face[] = []
  for (let i = 0; i < numFonts; i++) {
    const offset = r.u32(12 + i * 4)
    let face = byOffset.get(offset)
    if (!face) {
      try {
        face = readSfntFace(bytes, offset)
      } catch (error) {
        face = brokenFace(error)
      }
      byOffset.set(offset, face)
    }
    faces.push(face)
  }
  if (faces.every((face) => face.error)) {
    throw new FontError('damaged', `no face of the collection can be read: ${faces[0].error}`)
  }
  return { flavor: 'sfnt', collection: true, faces, fileSize: bytes.byteLength }
}

function readWoff(bytes: Uint8Array, limits: Limits): FontContainer {
  const r = new Reader(bytes)
  const sfntVersion = r.u32(4)
  const numTables = r.u16(12)
  const totalSfntSize = r.u32(16)
  const metaLength = r.u32(28)
  if (totalSfntSize > limits.maxUnpackedBytes) {
    throw new FontError('damaged', `the WOFF file unpacks to ${totalSfntSize} bytes, more than ${limits.maxUnpackedBytes}`)
  }
  // Check the whole directory before inflating anything: the sizes must add up to the font.
  let total = 12 + numTables * 16
  for (let i = 0; i < numTables; i++) {
    total += r.u32(44 + i * 20 + 12)
    if (total > totalSfntSize) {
      throw new FontError('damaged', `the WOFF tables add up to more than the ${totalSfntSize} bytes the header gives`)
    }
  }
  const tables = new Map<string, Uint8Array>()
  const tableList: TableInfo[] = []
  for (let i = 0; i < numTables; i++) {
    const record = 44 + i * 20
    const tag = r.tag(record)
    const offset = r.u32(record + 4)
    const compLength = r.u32(record + 8)
    const origLength = r.u32(record + 12)
    const stored = r.slice(offset, compLength)
    let data: Uint8Array
    if (compLength < origLength) {
      try {
        data = unzlibSync(stored, { out: new Uint8Array(origLength) })
      } catch (error) {
        throw new FontError('damaged', `table ${tag} does not inflate: ${String(error)}`)
      }
      if (data.byteLength !== origLength) {
        throw new FontError('damaged', `table ${tag} inflates to ${data.byteLength} bytes, not ${origLength}`)
      }
    } else {
      data = stored
    }
    tables.set(tag, data)
    tableList.push(compLength < origLength ? { tag, length: origLength, stored: compLength } : { tag, length: origLength })
  }
  return {
    flavor: 'woff',
    collection: false,
    faces: [{ sfntVersion, tables, tableList }],
    fileSize: bytes.byteLength,
    hasWoffMetadata: metaLength > 0
  }
}

/** The 63 tags WOFF2 encodes by index (flags & 0x3f); 63 means a tag follows. */
const WOFF2_KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca',
  'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea',
  'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL',
  'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill'
]

/** A cursor for WOFF2's variable-length integers. */
class Cursor {
  constructor(
    private readonly r: Reader,
    public offset: number
  ) {}

  u8(): number {
    return this.r.u8(this.offset++)
  }

  u16(): number {
    const value = this.r.u16(this.offset)
    this.offset += 2
    return value
  }

  u32(): number {
    const value = this.r.u32(this.offset)
    this.offset += 4
    return value
  }

  tag(): string {
    const value = this.r.tag(this.offset)
    this.offset += 4
    return value
  }

  /** UIntBase128: 1–5 bytes, 7 bits each, most significant first. */
  base128(): number {
    let value = 0
    for (let i = 0; i < 5; i++) {
      const byte = this.u8()
      if (i === 0 && byte === 0x80) {
        throw new FontError('damaged', 'UIntBase128 with a leading zero')
      }
      if (value > 0x1ffffff) {
        throw new FontError('damaged', 'UIntBase128 overflows 32 bits')
      }
      value = value * 128 + (byte & 0x7f)
      if ((byte & 0x80) === 0) {
        return value
      }
    }
    throw new FontError('damaged', 'UIntBase128 longer than 5 bytes')
  }

  /** 255UInt16. */
  u255(): number {
    const code = this.u8()
    if (code === 253) return this.u16()
    if (code === 255) return this.u8() + 253
    if (code === 254) return this.u8() + 506
    return code
  }
}

type Woff2Entry = { tag: string; origLength: number; transformLength: number; transformed: boolean }

function readWoff2(bytes: Uint8Array, limits: Limits): FontContainer {
  const r = new Reader(bytes)
  const flavor = r.u32(4)
  const numTables = r.u16(12)
  const totalCompressedSize = r.u32(20)
  const metaLength = r.u32(32)
  if (numTables === 0) {
    throw new FontError('damaged', 'WOFF2 file lists no tables')
  }
  const cursor = new Cursor(r, 48)
  const entries: Woff2Entry[] = []
  for (let i = 0; i < numTables; i++) {
    const flags = cursor.u8()
    const tagIndex = flags & 0x3f
    const tag = tagIndex === 63 ? cursor.tag() : WOFF2_KNOWN_TAGS[tagIndex]
    const version = flags >> 6
    const origLength = cursor.base128()
    // glyf and loca are transformed unless version 3 says null; every other table only when not 0.
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0
    const transformLength = transformed ? cursor.base128() : origLength
    entries.push({ tag, origLength, transformLength, transformed })
  }

  let faceIndices: { sfntVersion: number; indices: number[] }[]
  const collection = flavor === TAG_TTCF
  if (collection) {
    cursor.u32() // collection header version
    const numFonts = cursor.u255()
    if (numFonts === 0 || numFonts > MAX_FACES) {
      throw new FontError('damaged', `collection lists ${numFonts} fonts`)
    }
    faceIndices = []
    for (let f = 0; f < numFonts; f++) {
      const count = cursor.u255()
      const sfntVersion = cursor.u32()
      const indices: number[] = []
      for (let t = 0; t < count; t++) {
        indices.push(cursor.u255())
      }
      faceIndices.push({ sfntVersion, indices })
    }
  } else {
    faceIndices = [{ sfntVersion: flavor, indices: entries.map((_, i) => i) }]
  }

  if (!hasDictionary()) {
    // A caller's mistake, not a damaged file: never shown as one.
    throw new Error('the Brotli dictionary is not loaded; await loadBrotliDictionary() first')
  }
  const compressed = r.slice(cursor.offset, totalCompressedSize)
  const expected = entries.reduce((sum, e) => sum + e.transformLength, 0)
  if (expected > limits.maxUnpackedBytes) {
    throw new FontError('damaged', `the WOFF2 tables add up to ${expected} bytes, more than ${limits.maxUnpackedBytes}`)
  }
  let stream: Uint8Array
  try {
    // The decoder stops as soon as the stream would run past what the directory announced.
    stream = brotliDecompress(compressed, expected, expected)
  } catch (error) {
    throw new FontError('damaged', `the WOFF2 data does not decompress: ${String(error)}`)
  }
  if (stream.byteLength < expected) {
    throw new FontError('damaged', `WOFF2 data holds ${stream.byteLength} bytes, the directory needs ${expected}`)
  }

  // Tables follow each other in directory order, without padding.
  const data: (Uint8Array | null)[] = []
  let at = 0
  for (const entry of entries) {
    data.push(entry.transformed ? null : stream.subarray(at, at + entry.origLength))
    at += entry.transformLength
  }

  const faces: Face[] = faceIndices.map(({ sfntVersion, indices }) => {
    const tables = new Map<string, Uint8Array>()
    const tableList: TableInfo[] = []
    for (const index of indices) {
      const entry = entries[index]
      if (!entry) {
        return brokenFace(`the face refers to table ${index} of ${entries.length}`)
      }
      const bytesOfTable = data[index]
      if (bytesOfTable) {
        tables.set(entry.tag, bytesOfTable)
      }
      tableList.push({
        tag: entry.tag,
        length: entry.origLength,
        ...(entry.transformed ? { transformed: true, stored: entry.transformLength } : {})
      })
    }
    return { sfntVersion, tables, tableList }
  })
  if (faces.every((face) => face.error)) {
    throw new FontError('damaged', `no face of the file can be read: ${faces[0].error}`)
  }

  return {
    flavor: 'woff2',
    collection,
    faces,
    fileSize: bytes.byteLength,
    hasWoffMetadata: metaLength > 0
  }
}

/**
 * A standalone sfnt with one face's tables, for faces of a collection: Chromium's FontFace loads
 * only single fonts. Tables are copied in tag order, 4-byte aligned, with their checksums; head's
 * checkSumAdjustment is zeroed for its checksum and then set for the new file, as the spec says.
 */
export function faceToSfnt(face: Face): Uint8Array {
  const tags = [...face.tables.keys()].sort()
  const numTables = tags.length
  const headerSize = 12 + numTables * 16
  let total = headerSize
  for (const tag of tags) {
    total += align4(face.tables.get(tag)!.byteLength)
  }
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  const entrySelector = Math.floor(Math.log2(numTables))
  const searchRange = 2 ** entrySelector * 16
  view.setUint32(0, face.sfntVersion)
  view.setUint16(4, numTables)
  view.setUint16(6, searchRange)
  view.setUint16(8, entrySelector)
  view.setUint16(10, numTables * 16 - searchRange)
  let offset = headerSize
  let headAt = -1
  tags.forEach((tag, i) => {
    const table = face.tables.get(tag)!
    const record = 12 + i * 16
    for (let c = 0; c < 4; c++) {
      view.setUint8(record + c, tag.charCodeAt(c))
    }
    out.set(table, offset)
    if (tag === 'head' && table.byteLength >= 12) {
      view.setUint32(offset + 8, 0)
      headAt = offset
    }
    view.setUint32(record + 4, checksum(out.subarray(offset, offset + align4(table.byteLength))))
    view.setUint32(record + 8, offset)
    view.setUint32(record + 12, table.byteLength)
    offset += align4(table.byteLength)
  })
  if (headAt >= 0) {
    view.setUint32(headAt + 8, (0xb1b0afba - checksum(out)) >>> 0)
  }
  return out
}

function align4(n: number): number {
  return (n + 3) & ~3
}

function checksum(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let sum = 0
  for (let i = 0; i + 4 <= bytes.byteLength; i += 4) {
    sum = (sum + view.getUint32(i)) >>> 0
  }
  return sum
}
