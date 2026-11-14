import { assert, test } from 'orca/testing'
import { FontError } from './bytes'
import { faceToSfnt, openFont, sniffFlavor } from './container'
import { describeFace, faceLabel } from './info'
import { otfFixture, ttcFixture, ttfFixture, woff2Fixture, woffFixture } from './test-fixtures'

const isFontError = (code: string) => (error: unknown) => error instanceof FontError && error.code === code

const CODES = [0x20, 0x41, 0x42, 0x66, 0x69, 0x411, 0x1f600]

function checkFixtureFace(bytes: Uint8Array, flavor: string) {
  const font = openFont(bytes)
  assert.equal(font.flavor, flavor)
  assert.equal(font.collection, false)
  assert.equal(font.faces.length, 1)
  const info = describeFace(font.faces[0], 'en-US')
  assert.equal(info.family, 'Fixture Sans')
  assert.equal(info.style, 'Regular')
  assert.equal(info.names.version, 'Version 1.002')
  assert.equal(info.names.postScriptName, 'FixtureSans-Regular')
  assert.equal(info.names.designer, 'Font Viewer')
  assert.equal(info.names.licenseUrl, 'https://example.com/license')
  assert.equal(info.names.sampleText, 'Fixture sample')
  assert.equal(info.outlines, 'truetype')
  assert.equal(info.glyphCount, 9)
  assert.deepEqual([...info.cmap.codes], CODES)
  assert.equal(info.cmap.glyphs[info.cmap.codes.indexOf(0x41)], 2)
  assert.equal(info.os2?.weightClass, 400)
  assert.equal(info.os2?.fsType, 8)
  assert.equal(info.os2?.vendorId, 'TEST')
  assert.equal(info.os2?.xHeight, 500)
  assert.equal(info.os2?.capHeight, 700)
  assert.equal(info.head?.unitsPerEm, 1000)
  assert.equal(new Date(info.head?.created ?? 0).toISOString(), '2026-01-05T12:00:00.000Z')
  assert.equal(info.hhea?.ascender, 800)
  assert.equal(info.variable, true)
  assert.deepEqual(
    info.axes.map((a) => [a.tag, a.name, a.min, a.default, a.max]),
    [
      ['wght', 'Weight', 100, 400, 900],
      ['wdth', 'Width', 75, 100, 125]
    ]
  )
  assert.deepEqual(
    info.instances.map((i) => [i.name, i.coordinates.wght, i.coordinates.wdth]),
    [
      ['Bold', 700, 100],
      ['Thin Condensed', 100, 75]
    ]
  )
  const features = Object.fromEntries(info.features.map((f) => [f.tag, f]))
  assert.equal(features.liga?.table, 'GSUB')
  assert.equal(features.kern?.table, 'GPOS')
  assert.equal(features.ss01?.uiName, 'Alternate A')
  assert.deepEqual(info.color, [])
  assert.deepEqual(info.problems, [])
  return font
}

test('reads a TrueType font', () => {
  const font = checkFixtureFace(ttfFixture, 'sfnt')
  assert.ok(font.faces[0].tableList.some((t) => t.tag === 'glyf'))
})

test('reads a WOFF 1.0 font, inflating its tables', () => {
  const font = checkFixtureFace(woffFixture, 'woff')
  const glyf = font.faces[0].tableList.find((t) => t.tag === 'glyf')
  assert.ok(glyf)
  // Same table bytes as the plain TrueType file.
  const plain = openFont(ttfFixture).faces[0]
  assert.deepEqual([...font.faces[0].tables.get('cmap')!], [...plain.tables.get('cmap')!])
})

test('reads a WOFF 2.0 font through Brotli, skipping transformed tables', () => {
  const font = checkFixtureFace(woff2Fixture, 'woff2')
  const glyf = font.faces[0].tableList.find((t) => t.tag === 'glyf')
  assert.equal(glyf?.transformed, true)
  assert.equal(font.faces[0].tables.has('glyf'), false)
  const plain = openFont(ttfFixture).faces[0]
  for (const tag of ['name', 'cmap', 'OS/2', 'fvar', 'GSUB']) {
    assert.deepEqual([...font.faces[0].tables.get(tag)!], [...plain.tables.get(tag)!], tag)
  }
})

test('reads an OpenType CFF font', () => {
  const font = openFont(otfFixture)
  const info = describeFace(font.faces[0], 'en')
  assert.equal(info.outlines, 'cff')
  assert.equal(info.sfntVersion, 'OTTO')
  assert.equal(info.variable, false)
  assert.deepEqual([...info.cmap.codes], CODES)
})

test('reads every face of a collection and rebuilds one as a standalone font', () => {
  const font = openFont(ttcFixture)
  assert.equal(font.collection, true)
  assert.equal(font.faces.length, 2)
  const labels = font.faces.map((face, i) => faceLabel(face, i, 'en'))
  assert.deepEqual(labels, ['Fixture Sans Regular', 'Fixture Mono Bold'])
  const single = faceToSfnt(font.faces[1])
  assert.equal(sniffFlavor(single), 'sfnt')
  const reopened = openFont(single)
  const info = describeFace(reopened.faces[0], 'en')
  assert.equal(info.family, 'Fixture Mono')
  assert.deepEqual([...info.cmap.codes], CODES)
  // Every table starts on a 4-byte boundary.
  const view = new DataView(single.buffer, single.byteOffset, single.byteLength)
  for (let i = 0; i < view.getUint16(4); i++) {
    assert.equal(view.getUint32(12 + i * 16 + 8) % 4, 0)
  }
})

test('prefers names in the UI language', () => {
  const face = openFont(ttfFixture).faces[0]
  assert.equal(describeFace(face, 'ru-RU').names.family, 'Тестовый')
  assert.equal(describeFace(face, 'de-DE').names.family, 'Fixture Sans')
})

test('refuses files that are not fonts', () => {
  assert.equal(sniffFlavor(new TextEncoder().encode('hello world')), null)
  assert.throws(() => openFont(new TextEncoder().encode('hello world')), isFontError('not-a-font'))
  assert.throws(() => openFont(new Uint8Array(0)), isFontError('not-a-font'))
})

test('reports a truncated font as damaged', () => {
  assert.throws(() => openFont(ttfFixture.subarray(0, 20)), isFontError('damaged'))
  assert.throws(() => openFont(woff2Fixture.subarray(0, woff2Fixture.length - 40)), isFontError('damaged'))
})

test('a damaged table leaves the rest readable', () => {
  const copy = ttfFixture.slice()
  const face = openFont(copy).faces[0]
  const os2 = face.tables.get('OS/2')!
  face.tables.set('OS/2', os2.subarray(0, 10))
  const info = describeFace(face, 'en')
  assert.equal(info.os2, null)
  assert.equal(info.family, 'Fixture Sans')
  assert.equal(info.problems.length, 1)
  assert.ok(info.problems[0].startsWith('OS/2'))
})
