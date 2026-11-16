import { assert, test } from 'orca/testing'
import { loadBrotliDictionary } from './font/brotli-dictionary'
import { openFont, sniffFlavor } from './font/container'
import { describeFace } from './font/info'
import { ttcFixture, ttfFixture, woff2Fixture } from './font/test-fonts'
import { axesFor, faceStyle, renderSource, snapAxisValue } from './render'

test('draws a single font from its own bytes and a collection face as a standalone font', async () => {
  await loadBrotliDictionary()
  const single = renderSource(openFont(woff2Fixture), 0, woff2Fixture)
  assert.ok(single.kind === 'bytes' && single.bytes === woff2Fixture)
  const collection = openFont(ttcFixture)
  const second = renderSource(collection, 1, ttcFixture)
  assert.ok(second.kind === 'bytes')
  if (second.kind !== 'bytes') return
  assert.equal(sniffFlavor(second.bytes), 'sfnt')
  // The cut-out face opens as a plain font with the second face's names.
  const reopened = openFont(second.bytes)
  assert.equal(reopened.collection, false)
  assert.equal(describeFace(reopened.faces[0], 'en').family, 'Fixture Mono')
})

test('a WOFF2 collection with transformed outlines draws only its first face', async () => {
  await loadBrotliDictionary()
  const container = openFont(woff2Fixture)
  const fake = { ...container, collection: true, faces: [container.faces[0], container.faces[0]] }
  const transformed = container.faces[0].tableList.some((table) => table.transformed)
  assert.ok(transformed)
  assert.deepEqual(renderSource(fake, 1, woff2Fixture), { kind: 'woff2-collection' })
  const first = renderSource(fake, 0, woff2Fixture)
  assert.ok(first.kind === 'bytes' && first.bytes === woff2Fixture)
})

test('keeps the moved axis values that fit the new face and styles the face with CSS', () => {
  const info = describeFace(openFont(ttfFixture).faces[0], 'en')
  // wdth 400 is out of the face's range and opsz is not an axis of it: both are dropped.
  const axes = axesFor(info, new Map([['wght', 650], ['wdth', 400], ['opsz', 12]]))
  assert.deepEqual([...axes], [['wght', 650]])
  const style = faceStyle(info, 'fv-face-1', axes, new Map([['liga', false], ['smcp', true]]))
  assert.equal(style.font, '"fv-face-1", var(--ui-font)')
  // Only the moved axis is written, so the browser keeps applying the others itself (opsz).
  assert.equal(style.variation, '"wght" 650')
  // smcp is not in the fixture, so only liga is written.
  assert.equal(style.features, '"liga" 0')
  const plain = faceStyle(null, null, new Map(), new Map())
  assert.deepEqual(plain, { font: 'var(--ui-font)', variation: 'normal', features: 'normal' })
  // A variable face nobody moved an axis of keeps the browser's defaults.
  assert.equal(faceStyle(info, 'fv-face-1', axesFor(info, new Map()), new Map()).variation, 'normal')
})

test('axis sliders reach the ends and the default of odd ranges', () => {
  const opsz = { min: 8, default: 12, max: 60 }
  const wght = { min: 294.67, default: 400, max: 900 }
  assert.equal(snapAxisValue(294.67, wght), 294.67)
  assert.equal(snapAxisValue(294.9, wght), 294.67)
  assert.equal(snapAxisValue(899.6, wght), 900)
  assert.equal(snapAxisValue(900, wght), 900)
  assert.equal(snapAxisValue(512.34, wght), 512)
  assert.equal(snapAxisValue(400.4, wght), 400)
  assert.equal(snapAxisValue(12.04, opsz), 12)
  assert.equal(snapAxisValue(30.26, opsz), 30.3)
  const slnt = { min: -11.5, default: 0, max: 0 }
  assert.equal(snapAxisValue(-11.48, slnt), -11.5)
  assert.equal(snapAxisValue(-3.333, slnt), -3.3)
})
