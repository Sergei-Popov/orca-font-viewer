import { assert, test } from 'orca/testing'
import { openFont } from './font/container'
import { describeFace } from './font/info'
import { otfFixture, ttcFixture, ttfFixture, woff2Fixture } from './font/test-fixtures'
import { axesFor, faceStyle, fontMime, renderSource } from './render'

test('draws a single font from its own bytes and a collection face as a standalone font', () => {
  const single = renderSource(openFont(woff2Fixture), 0, woff2Fixture)
  assert.ok(single.kind === 'bytes' && single.bytes === woff2Fixture)
  const collection = openFont(ttcFixture)
  const second = renderSource(collection, 1, ttcFixture)
  assert.ok(second.kind === 'bytes')
  if (second.kind !== 'bytes') return
  assert.equal(fontMime(second.bytes), 'font/ttf')
  // The cut-out face opens as a plain font with the second face's names.
  const reopened = openFont(second.bytes)
  assert.equal(reopened.collection, false)
  assert.equal(describeFace(reopened.faces[0], 'en').family, 'Fixture Mono')
})

test('a WOFF2 collection with transformed outlines draws only its first face', () => {
  const container = openFont(woff2Fixture)
  const fake = { ...container, collection: true, faces: [container.faces[0], container.faces[0]] }
  const transformed = container.faces[0].tableList.some((table) => table.transformed)
  assert.ok(transformed)
  assert.deepEqual(renderSource(fake, 1, woff2Fixture), { kind: 'woff2-collection' })
  const first = renderSource(fake, 0, woff2Fixture)
  assert.ok(first.kind === 'bytes' && first.bytes === woff2Fixture)
})

test('names the MIME type of a font for a data: URL', () => {
  assert.equal(fontMime(ttfFixture), 'font/ttf')
  assert.equal(fontMime(otfFixture), 'font/otf')
  assert.equal(fontMime(woff2Fixture), 'font/woff2')
  assert.equal(fontMime(ttcFixture), 'font/collection')
})

test('keeps axis values that fit the new face and styles the face with CSS', () => {
  const info = describeFace(openFont(ttfFixture).faces[0], 'en')
  const axes = axesFor(info, new Map([['wght', 650], ['wdth', 400], ['opsz', 12]]))
  assert.deepEqual([...axes], [['wght', 650], ['wdth', 100]])
  const style = faceStyle(info, 'fv-face-1', axes, new Map([['liga', false], ['smcp', true]]))
  assert.equal(style.font, '"fv-face-1", var(--ui-font)')
  assert.equal(style.variation, '"wght" 650, "wdth" 100')
  // smcp is not in the fixture, so only liga is written.
  assert.equal(style.features, '"liga" 0')
  const plain = faceStyle(null, null, new Map(), new Map())
  assert.deepEqual(plain, { font: 'var(--ui-font)', variation: 'normal', features: 'normal' })
})
