import { assert, test } from 'orca/testing'
import { ALPHABET_LINES, alphabetLines, defaultSample, embeddingLabel, formatBytes, formatDate, weightLabel, widthLabel } from './describe'
import {
  blockLabel,
  blockOf,
  coverage,
  cssEscape,
  hasCode,
  htmlEntity,
  isInvisible,
  jsEscape,
  matchesQuery,
  parseCharQuery,
  uPlus,
  utf8Bytes
} from './font/chars'
import { featureName, featureSettings, isOnByDefault, isUserFeature, variationSettings } from './font/features'
import { openFont } from './font/container'
import { describeFace } from './font/info'
import { otfFixture, ttfFixture } from './font/test-fixtures'
import { groupByBlock, layoutGrid, rowOf, visibleRange } from './grid'
import { fill, stringsFor } from './i18n'

const en = stringsFor('en-US')
const ru = stringsFor('ru')

test('names Unicode blocks, including gaps', () => {
  assert.equal(blockOf(0x41), 'Basic Latin')
  assert.equal(blockOf(0x411), 'Cyrillic')
  assert.equal(blockOf(0x1f600), 'Emoticons')
  assert.equal(blockOf(0x10ffff), 'Supplementary Private Use Area-B')
  assert.equal(blockOf(0x2fe0), '') // between Ideographic Description and CJK Symbols? a gap
  assert.equal(blockLabel('Cyrillic', 'ru', '-'), 'Кириллица')
  assert.equal(blockLabel('Emoticons', 'en', '-'), 'Emoticons')
  assert.equal(blockLabel('', 'en', 'No block'), 'No block')
})

test('writes a code point in every notation', () => {
  assert.equal(uPlus(0x41), 'U+0041')
  assert.equal(uPlus(0x1f600), 'U+1F600')
  assert.equal(htmlEntity(0x411), '&#x411;')
  assert.equal(cssEscape(0x411), '\\411')
  assert.equal(jsEscape(0x411), '\\u0411')
  assert.equal(jsEscape(0x1f600), '\\u{1F600}')
  assert.equal(utf8Bytes(0x41), '41')
  assert.equal(utf8Bytes(0x411), 'D0 91')
  assert.equal(utf8Bytes(0x20ac), 'E2 82 AC')
  assert.equal(utf8Bytes(0x1f600), 'F0 9F 98 80')
  assert.ok(isInvisible(0x20) === false && isInvisible(0x200b) && isInvisible(0x0a))
})

test('understands the Characters search box', () => {
  assert.deepEqual(parseCharQuery(''), { kind: 'all' })
  const one = parseCharQuery('U+0411')
  assert.ok(one.kind === 'codes' && one.codes.has(0x411) && one.codes.size === 1)
  const several = parseCharQuery('0x41, u+42')
  assert.ok(several.kind === 'codes' && several.codes.has(0x41) && several.codes.has(0x42))
  const range = parseCharQuery('U+0400-04FF')
  assert.deepEqual(range, { kind: 'range', from: 0x400, to: 0x4ff })
  const typed = parseCharQuery('Ёж')
  assert.ok(typed.kind === 'codes' && typed.codes.has(0x401) && typed.codes.has(0x436))
  assert.deepEqual(parseCharQuery('cyrillic'), { kind: 'block', text: 'cyrillic' })
  assert.deepEqual(parseCharQuery('Кирил'), { kind: 'block', text: 'кирил' })
  assert.ok(matchesQuery(parseCharQuery('cyril'), 0x411, 'Cyrillic', 'Кириллица'))
  assert.ok(matchesQuery(parseCharQuery('кирил'), 0x411, 'Cyrillic', 'Кириллица'))
  assert.ok(!matchesQuery(parseCharQuery('greek'), 0x411, 'Cyrillic', 'Cyrillic'))
})

test('measures coverage of sorted code points', () => {
  const codes = Uint32Array.from([0x41, 0x42, 0x43, 0x411])
  assert.ok(hasCode(codes, 0x411))
  assert.ok(!hasCode(codes, 0x44))
  assert.equal(coverage(codes, 'AB'), 1)
  assert.equal(coverage(codes, 'ABCD'), 0.75)
  assert.equal(coverage(codes, '   '), 1)
})

test('describes weights, widths and embedding rights', () => {
  assert.equal(weightLabel(700), '700 (Bold)')
  assert.equal(weightLabel(450), '450 (≈ Regular)')
  assert.equal(widthLabel(5), '5 (Normal)')
  assert.equal(widthLabel(12), '12')
  assert.equal(embeddingLabel(0, en), en.embedInstallable)
  assert.equal(embeddingLabel(0x0002, en), en.embedRestricted)
  assert.equal(embeddingLabel(0x0004, en), en.embedPreview)
  assert.equal(embeddingLabel(0x0008 | 0x0100, en), `${en.embedEditable}; ${en.embedNoSubsetting}`)
  assert.equal(embeddingLabel(0x0204, ru), `${ru.embedPreview}; ${ru.embedBitmapOnly}`)
})

test('formats sizes and dates', () => {
  assert.equal(formatBytes(512, 'en'), '512 B')
  assert.equal(formatBytes(171272, 'en'), '167 KB')
  assert.equal(formatBytes(7909644, 'en'), '7.5 MB')
  assert.equal(formatBytes(7909644, 'ru'), '7,5 МБ')
  assert.equal(formatDate(Date.UTC(2026, 0, 5, 23, 0), 'en'), 'January 5, 2026')
  assert.equal(formatDate(null, 'en'), '—')
  assert.equal(fill('{a} of {b}', { a: 1, b: 2 }), '1 of 2')
})

test('picks a sample the font can draw', () => {
  const info = describeFace(openFont(ttfFixture).faces[0], 'en')
  // The fixture's own sample "Fixture sample" uses letters it lacks: its few characters win.
  assert.equal(defaultSample(info, 'en', en), 'ABfiБ😀')
  const both = codesOf(en.sampleLatin + ru.sampleCyrillic)
  const covered = { ...info, names: {}, cmap: { ...info.cmap, codes: both } }
  assert.equal(defaultSample(covered, 'ru', ru), ru.sampleCyrillic)
  assert.equal(defaultSample(covered, 'en', en), en.sampleLatin)
  const withOwn = { ...covered, names: { sampleText: 'the lazy dog' } }
  assert.equal(defaultSample(withOwn, 'en', en), 'the lazy dog')
  assert.equal(defaultSample(withOwn, 'ru', ru), ru.sampleCyrillic)
  const latinOnly = { ...info, names: {}, cmap: { ...info.cmap, codes: codesOf(en.sampleLatin) } }
  assert.equal(defaultSample(latinOnly, 'ru', ru), en.sampleLatin)
  assert.deepEqual(alphabetLines({ ...info, cmap: { ...info.cmap, codes: codesOf(ALPHABET_LINES[0] + ALPHABET_LINES[4]) } }), [
    ALPHABET_LINES[0],
    ALPHABET_LINES[4]
  ])
})

test('offers user-facing feature switches with names', () => {
  assert.equal(featureName('smcp', null, 'en'), 'Small capitals')
  assert.equal(featureName('smcp', null, 'ru'), 'Капитель')
  assert.equal(featureName('ss03', null, 'en'), 'Stylistic set 3')
  assert.equal(featureName('cv11', null, 'ru'), 'Вариант знака 11')
  assert.equal(featureName('ss01', 'Single-storey a', 'en'), 'Single-storey a')
  assert.equal(featureName('abcd', null, 'en'), 'abcd')
  assert.ok(isUserFeature('liga') && isUserFeature('ss01') && !isUserFeature('ccmp') && !isUserFeature('init'))
  assert.ok(isOnByDefault('liga') && !isOnByDefault('smcp'))
  assert.equal(featureSettings(new Map([['liga', true], ['smcp', false]])), 'normal')
  assert.equal(featureSettings(new Map([['liga', false], ['smcp', true]])), '"liga" 0, "smcp" 1')
  assert.equal(variationSettings(new Map([['wght', 650.1234], ['wdth', 87.5]])), '"wght" 650.123, "wdth" 87.5')
  assert.equal(variationSettings(new Map()), 'normal')
})

test('lays the character grid out by block and finds the visible rows', () => {
  const codes = Uint32Array.from([0x41, 0x42, 0x43, 0x44, 0x45, 0x411, 0x412, 0x1f600])
  const groups = groupByBlock(codes)
  assert.deepEqual(
    groups.map((g) => [g.block, g.codes.length]),
    [
      ['Basic Latin', 5],
      ['Cyrillic', 2],
      ['Emoticons', 1]
    ]
  )
  const layout = layoutGrid(groups, 2, 20, 50)
  // Latin: header + 3 rows, Cyrillic: header + 1, Emoticons: header + 1.
  assert.equal(layout.rows.length, 8)
  assert.equal(layout.height, 3 * 20 + 5 * 50)
  assert.equal(layout.total, 8)
  assert.deepEqual(visibleRange(layout, 0, 60, 0), [0, 2])
  assert.deepEqual(visibleRange(layout, 0, 71, 0), [0, 3])
  const [first] = visibleRange(layout, 200, 50, 0)
  assert.equal(layout.rows[first].kind, 'cells')
  assert.equal(rowOf(layout, 1, 1), 5)
  const filtered = groupByBlock(codes, (code, block) => block === 'Cyrillic' || code === 0x41)
  assert.deepEqual(filtered.map((g) => g.codes), [[0x41], [0x411, 0x412]])
})

test('a CFF font gets a sample too', () => {
  const info = describeFace(openFont(otfFixture).faces[0], 'ru')
  assert.equal(info.names.family, 'Тестовый')
  assert.ok(defaultSample(info, 'ru', ru).length > 0)
})

function codesOf(text: string): Uint32Array {
  return Uint32Array.from([...new Set([...text].map((c) => c.codePointAt(0)!))].sort((a, b) => a - b))
}
