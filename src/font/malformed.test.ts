// Damaged and malformed fonts, built here byte by byte and kept small: limits that protect a 64 MiB
// file are passed in scaled down, so each case runs in milliseconds.

import { assert, test } from 'orca/testing'
import { loadBrotliDictionary } from './brotli-dictionary'
import { FontError } from './bytes'
import { faceToSfnt, openFont } from './container'
import { describeFace, faceLabel, newTableCache } from './info'
import { parseCmap, parseFvar, parseName, trimNuls } from './tables'
import { Bytes, collection, ttfFixture, utf16 } from './test-fonts'

const isDamaged = (pattern?: RegExp) => (error: unknown) =>
  error instanceof FontError && error.code === 'damaged' && (!pattern || pattern.test(error.message))

// ------------------------------------------------------------------------------------------------
// Builders

/** A plain sfnt with the given tables, 4-byte aligned. */
function sfnt(tables: Record<string, Uint8Array>, version = 0x00010000): Uint8Array {
  const tags = Object.keys(tables).sort()
  const out = new Bytes().u32(version).u16(tags.length, 0, 0, 0)
  let offset = 12 + tags.length * 16
  for (const tag of tags) {
    out.tag(tag).u32(0, offset, tables[tag].length)
    offset += (tables[tag].length + 3) & ~3
  }
  for (const tag of tags) {
    out.bytes(tables[tag])
    while (out.length % 4) out.u8(0)
  }
  return out.done()
}

function nameTable(records: [platform: number, encoding: number, language: number, nameId: number, data: Uint8Array][]): Uint8Array {
  const out = new Bytes().u16(0, records.length, 6 + records.length * 12)
  const storage = new Bytes()
  for (const [platform, encoding, language, nameId, data] of records) {
    out.u16(platform, encoding, language, nameId, data.length, storage.length)
    storage.bytes(data)
  }
  return out.bytes(storage.done()).done()
}

const BASIC_NAME = nameTable([
  [3, 1, 0x409, 1, utf16('Crafted')],
  [3, 1, 0x409, 2, utf16('Regular')]
])

/** A head table: version, revision, checkSumAdjustment, magic, flags, unitsPerEm 1000. */
const HEAD = new Bytes().u32(0x00010000, 0x00010000, 0x12345678, 0x5f0f3cf5).u16(0, 1000).u32(0, 0, 0, 0).u16(0, 0, 0, 0, 0, 0, 0, 0, 0).done()

type Subtable = { platform: number; encoding: number; data: Uint8Array }

function cmap(subtables: Subtable[]): Uint8Array {
  const out = new Bytes().u16(0, subtables.length)
  let offset = 4 + subtables.length * 8
  for (const sub of subtables) {
    out.u16(sub.platform, sub.encoding).u32(offset)
    offset += sub.data.length
  }
  for (const sub of subtables) out.bytes(sub.data)
  return out.done()
}

function format12(groups: [start: number, end: number, glyph: number][], format = 12): Uint8Array {
  const out = new Bytes().u16(format, 0).u32(16 + groups.length * 12, 0, groups.length)
  for (const [start, end, glyph] of groups) out.u32(start, end, glyph)
  return out.done()
}

function format4(segments: [start: number, end: number, delta: number][]): Uint8Array {
  const all = [...segments, [0xffff, 0xffff, 1] as [number, number, number]]
  const n = all.length
  const out = new Bytes().u16(4, 16 + n * 8, 0, n * 2, 0, 0, 0)
  out.u16(...all.map((s) => s[1])).u16(0).u16(...all.map((s) => s[0])).u16(...all.map((s) => s[2] & 0xffff))
  out.u16(...all.map(() => 0))
  return out.done()
}

function format6(first: number, glyphs: number[]): Uint8Array {
  return new Bytes().u16(6, 10 + glyphs.length * 2, 0, first, glyphs.length).u16(...glyphs).done()
}

function fvar(axisCount: number, instanceCount: number, instanceSize: number, instancesWritten: number): Uint8Array {
  const out = new Bytes().u16(1, 0, 16, 2, axisCount, 20, instanceCount, instanceSize)
  for (let i = 0; i < axisCount; i++) out.tag(`a${String(i).padStart(3, '0')}`).u32(0, 0, 0x10000).u16(0, 256)
  for (let i = 0; i < instancesWritten; i++) {
    out.u16(256, 0)
    for (let a = 0; a < axisCount; a++) out.u32(0x8000)
  }
  return out.done()
}

// ------------------------------------------------------------------------------------------------
// 1 · WOFF2: Brotli output bounded by the directory, and the directory by a limit

/** brotli.compress(b'\0' * 65536, quality=11): 13 bytes that unpack to 64 KiB. */
const BROTLI_64K_ZEROS = Uint8Array.from([0x1b, 0xff, 0xff, 0xf8, 0x27, 0x00, 0xe2, 0xb1, 0x40, 0x20, 0xf7, 0x1e, 0x00])

/** A WOFF2 file with one `name` table of `origLength` bytes and `stream` as its Brotli data. */
function woff2(origLength: number, stream: Uint8Array): Uint8Array {
  const header = new Bytes().tag('wOF2').u32(0x00010000, 0).u16(1, 0).u32(0, stream.length).u16(1, 0).u32(0, 0, 0, 0, 0)
  header.u8(5) // flags: known tag 5 = name, transform version 0
  let rest = origLength
  const base128: number[] = []
  do {
    base128.unshift(rest & 0x7f)
    rest = Math.floor(rest / 128)
  } while (rest > 0)
  header.u8(...base128.map((b, i) => (i < base128.length - 1 ? b | 0x80 : b)))
  return header.bytes(stream).done()
}

test('WOFF2: a Brotli stream larger than the directory stops the decoder', async () => {
  await loadBrotliDictionary()
  const start = Date.now()
  assert.throws(() => openFont(woff2(16, BROTLI_64K_ZEROS)), isDamaged(/does not decompress.*more than 16 bytes/))
  assert.ok(Date.now() - start < 1000)
})

test('WOFF2: tables adding up to more than the limit are refused before decoding', async () => {
  await loadBrotliDictionary()
  assert.throws(() => openFont(woff2(65536, BROTLI_64K_ZEROS), { maxUnpackedBytes: 4096 }), isDamaged(/more than 4096/))
  // Within the limit the same stream decodes.
  const font = openFont(woff2(65536, BROTLI_64K_ZEROS), { maxUnpackedBytes: 65536 })
  assert.equal(font.faces[0].tables.get('name')?.length, 65536)
})

// ------------------------------------------------------------------------------------------------
// 5 · WOFF 1.0: origLength checked against totalSfntSize and the limit; inflation bounded

/** zlib.compress(b'\0' * 65536, 9): 84 bytes that inflate to 64 KiB. */
const ZLIB_64K_ZEROS = Uint8Array.from(
  '78daedc101010000008090feafee080a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006a000f0001'
    .match(/../g)!
    .map((pair) => parseInt(pair, 16))
)

function woff(tables: { tag: string; origLength: number; data: Uint8Array }[], totalSfntSize: number): Uint8Array {
  const out = new Bytes().tag('wOFF').u32(0x00010000, 0).u16(tables.length, 0).u32(totalSfntSize).u16(1, 0).u32(0, 0, 0, 0, 0)
  let offset = 44 + tables.length * 20
  for (const table of tables) {
    out.tag(table.tag).u32(offset, table.data.length, table.origLength, 0)
    offset += (table.data.length + 3) & ~3
  }
  for (const table of tables) {
    out.bytes(table.data)
    while (out.length % 4) out.u8(0)
  }
  return out.done()
}

test('WOFF 1.0: table sizes must fit the header and the limit', () => {
  const huge = woff(
    [
      { tag: 'glyf', origLength: 0x40000000, data: ZLIB_64K_ZEROS },
      { tag: 'name', origLength: 0x40000000, data: ZLIB_64K_ZEROS }
    ],
    1024
  )
  assert.throws(() => openFont(huge), isDamaged(/add up to more than the 1024 bytes/))
  const big = woff([{ tag: 'name', origLength: 65536, data: ZLIB_64K_ZEROS }], 65536 + 28)
  assert.throws(() => openFont(big, { maxUnpackedBytes: 1000 }), isDamaged(/more than 1000/))
  assert.equal(openFont(big).faces[0].tables.get('name')?.length, 65536)
})

test('WOFF 1.0: a table that inflates past its origLength is damaged, not looped through', () => {
  const lying = woff([{ tag: 'name', origLength: 100, data: ZLIB_64K_ZEROS }], 200)
  assert.throws(() => openFont(lying), isDamaged(/name does not inflate/))
})

// ------------------------------------------------------------------------------------------------
// 2 · fvar record sizes and work

test('fvar: instance records must have the size the spec gives', () => {
  assert.throws(() => parseFvar(fvar(3, 65535, 0, 0)), isDamaged(/instance records of 0 bytes/))
  assert.throws(() => parseFvar(fvar(3, 1, 4 + 3 * 4 + 4, 1)), isDamaged(/instance records/))
  assert.throws(() => parseFvar(fvar(65, 0, 0, 0)), isDamaged(/65 axes/))
  const ok = parseFvar(fvar(3, 2, 4 + 3 * 4, 2))
  assert.equal(ok.instances.length, 2)
  assert.equal(ok.instances[1].coordinates.a002, 0.5)
})

test('fvar: instances past the table or over the work limit are skipped, axes kept', () => {
  const short = parseFvar(fvar(3, 65535, 16, 10))
  assert.equal(short.axes.length, 3)
  assert.equal(short.instances.length, 10)
  assert.equal(short.skippedInstances, 65525)
  const limited = parseFvar(fvar(4, 10, 20, 10), 12)
  assert.equal(limited.instances.length, 3)
  assert.equal(limited.skippedInstances, 7)
  const info = describeFace(openFont(sfnt({ name: BASIC_NAME, head: HEAD, cmap: cmap([]), fvar: fvar(3, 65535, 16, 10) })).faces[0], 'en')
  assert.equal(info.axes.length, 3)
  assert.ok(info.problems.some((p) => /65525 named instances were not read/.test(p)))
})

// ------------------------------------------------------------------------------------------------
// 3 · name: shared strings decoded once, NUL runs trimmed in linear time

test('name: trailing NULs are trimmed, inner ones kept', () => {
  assert.equal(trimNuls('Name\0\0\0'), 'Name')
  assert.equal(trimNuls('\0\0\0A'), '\0\0\0A')
  assert.equal(trimNuls('\0'.repeat(30000) + 'A').length, 30001)
})

test('name: thousands of records sharing one long string decode it once', () => {
  const payload = utf16('A'.repeat(30000))
  const records: [number, number, number, number, Uint8Array][] = []
  for (let i = 0; i < 2000; i++) records.push([3, 1, 0x409, 1 + (i % 20), payload])
  // Every record points at the same storage: write it once.
  const table = new Bytes().u16(0, records.length, 6 + records.length * 12)
  for (const [p, e, l, id] of records) table.u16(p, e, l, id, payload.length, 0)
  const names = parseName(table.bytes(payload).done())
  assert.equal(names.size, 2000)
  assert.equal(names.pick(1, 'en')?.length, 30000)
  assert.equal(names.pick(4, 'en')?.length, 30000)
  assert.equal(names.decodedStrings, 1)
})

test('name: blank records are skipped for the next best', () => {
  const names = parseName(
    nameTable([
      [3, 1, 0x409, 1, utf16('   ')],
      [1, 0, 0, 1, Uint8Array.from([0x80, 0x41])]
    ])
  )
  assert.equal(names.pick(1, 'en'), 'ÄA')
})

// ------------------------------------------------------------------------------------------------
// 4, 9, 15 · cmap: overlaps bounded, damaged subtables skipped, Mac Roman everywhere

test('cmap: overlapping groups are read once and bounded', () => {
  const overlap = cmap([{ platform: 3, encoding: 10, data: format12(Array(16).fill([0, 0x10ffff, 1])) }])
  const bounded = parseCmap(overlap, 5000)
  assert.equal(bounded.codes.length, 5000)
  assert.ok(bounded.problems[0].includes('overlap'))
  const full = parseCmap(overlap)
  assert.equal(full.codes.length, 0x110000)
  assert.equal(full.codes[0x41], 0x41)
  const segments = cmap([{ platform: 3, encoding: 1, data: format4(Array(64).fill([0, 0xfffe, 1])) }])
  const bmp = parseCmap(segments, 70000)
  assert.equal(bmp.codes.length, 0xffff)
  assert.ok(bmp.problems[0].includes('overlap'))
})

test('cmap: codes in descending order come out sorted, first mapping wins', () => {
  const map = parseCmap(cmap([{ platform: 3, encoding: 10, data: format12([[0x500, 0x501, 7], [0x41, 0x42, 3], [0x41, 0x41, 9]]) }]))
  assert.deepEqual([...map.codes], [0x41, 0x42, 0x500, 0x501])
  assert.deepEqual([...map.glyphs], [3, 4, 7, 8])
})

test('cmap: a damaged preferred subtable falls back to the next one', () => {
  const damaged = new Bytes().u16(12, 0).u32(1000, 0, 50).u32(0x41, 0x5a, 1).done() // lists 50 groups, holds 1
  const map = parseCmap(
    cmap([
      { platform: 3, encoding: 10, data: damaged },
      { platform: 3, encoding: 1, data: format4([[0x30, 0x39, 1]]) }
    ])
  )
  assert.equal(map.source, '3/1')
  assert.equal(map.codes.length, 10)
  assert.ok(map.problems[0].startsWith('cmap 3/10 format 12:'))
})

test('cmap: Mac Roman subtables map their high half in every format', () => {
  const six = parseCmap(cmap([{ platform: 1, encoding: 0, data: format6(0x7f, [1, 2, 3]) }]))
  // 0x7F stays, 0x80 is Ä, 0x81 is Å.
  assert.deepEqual([...six.codes], [0x7f, 0xc4, 0xc5])
  const four = parseCmap(cmap([{ platform: 1, encoding: 0, data: format4([[0xf0, 0xf0, 5]]) }]))
  assert.deepEqual([...four.codes], [0xf8ff])
})

// ------------------------------------------------------------------------------------------------
// 6, 8 · collections: one bad face is marked, shared tables parsed once

test('collection: a face that cannot be read is marked; the others open', () => {
  const font = sfnt({ name: BASIC_NAME, head: HEAD, cmap: cmap([{ platform: 3, encoding: 1, data: format4([[0x41, 0x5a, 1]]) }]) })
  const bytes = collection([font], (starts) => [starts[0], 0xfffff0, starts[0]], 3)
  const opened = openFont(bytes)
  assert.equal(opened.faces.length, 3)
  assert.ok(opened.faces[1].error)
  assert.equal(opened.faces[0], opened.faces[2])
  const cache = newTableCache()
  assert.equal(faceLabel(opened.faces[0], 0, 'en', cache), 'Crafted Regular')
  assert.equal(faceLabel(opened.faces[1], 1, 'en', cache), '#2')
  const broken = describeFace(opened.faces[1], 'en', cache)
  assert.ok(broken.damaged)
  // Faces sharing a cmap share one parse.
  assert.equal(describeFace(opened.faces[0], 'en', cache).cmap, describeFace(opened.faces[2], 'en', cache).cmap)
  assert.throws(() => openFont(collection([font], () => [0xfffff0, 0xfffff4], 2)), isDamaged(/no face of the collection/))
})

// ------------------------------------------------------------------------------------------------
// 7 · tables past the end of the file

test('tables past the end of the file are reported; without head, name or cmap the face is damaged', () => {
  const view = new DataView(ttfFixture.buffer, ttfFixture.byteOffset, ttfFixture.byteLength)
  let headOffset = 0
  for (let t = 0; t < view.getUint16(4); t++) {
    const record = 12 + t * 16
    if (String.fromCharCode(...ttfFixture.subarray(record, record + 4)) === 'head') headOffset = view.getUint32(record + 8)
  }
  const cut = ttfFixture.slice(0, headOffset)
  const info = describeFace(openFont(cut).faces[0], 'en')
  assert.ok(info.problems.some((p) => p.startsWith('head: its 54 bytes lie past the end of the file')))
  assert.equal(info.damaged, 'head, name, cmap lie past the end of the file')
  const whole = describeFace(openFont(ttfFixture).faces[0], 'en')
  assert.equal(whole.damaged, null)
  assert.deepEqual(whole.problems, [])
  // head pointed past the end, cmap not listed at all: both are named.
  const noCmap = sfnt({ name: BASIC_NAME, head: HEAD })
  new DataView(noCmap.buffer).setUint32(12 + 8, 0x7ffffff0) // head sorts first
  assert.equal(describeFace(openFont(noCmap).faces[0], 'en').damaged, 'head lies past the end of the file; the font has no cmap table')
})

// ------------------------------------------------------------------------------------------------
// 16 · head checksum of a face cut out of a collection

test('a cut-out face has valid table checksums and checkSumAdjustment', () => {
  const font = sfnt({ name: BASIC_NAME, head: HEAD, cmap: cmap([]) })
  const single = faceToSfnt(openFont(collection([font])).faces[0])
  const view = new DataView(single.buffer)
  const sum = (from: number, length: number) => {
    let total = 0
    for (let i = from; i < from + length; i += 4) total = (total + view.getUint32(i)) >>> 0
    return total
  }
  for (let t = 0; t < view.getUint16(4); t++) {
    const record = 12 + t * 16
    const tag = String.fromCharCode(...single.subarray(record, record + 4))
    const offset = view.getUint32(record + 8)
    const length = (view.getUint32(record + 12) + 3) & ~3
    let expected = sum(offset, length)
    if (tag === 'head') expected = (expected - view.getUint32(offset + 8)) >>> 0
    assert.equal(view.getUint32(record + 4), expected, tag)
  }
  assert.equal(sum(0, single.length), 0xb1b0afba)
})
