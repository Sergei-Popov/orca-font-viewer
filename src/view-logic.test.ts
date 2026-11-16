import { assert, test } from 'orca/testing'
import { ALPHABET_LINES, alphabetLines, defaultSample, embeddingLabel, formatBytes, formatDate, formatFixed, weightLabel, widthLabel } from './describe'
import {
  blockLabel,
  blockOf,
  coverage,
  cssEscape,
  hasCode,
  htmlEntity,
  isInvisible,
  jsEscape,
  fontBlockNames,
  matchesQuery,
  parseCharQuery,
  uPlus,
  utf8Bytes
} from './font/chars'
import { featureName, featureSettings, isOnByDefault, isUserFeature, variationSettings } from './font/features'
import { openFont } from './font/container'
import { describeFace } from './font/info'
import { otfFixture, ttfFixture } from './font/test-fonts'
import { NO_BLOCK, blockOptions, groupByBlock, inBlockFilter, layoutGrid, moveInGrid, rowOf, visibleRange } from './grid'
import { fill, stringsFor } from './i18n'

const en = stringsFor('en-US')
const ru = stringsFor('ru')

test('the block filter has one option for all the gaps between blocks, apart from every block', () => {
  // Two gaps (U+2FE0 and U+10200) around Basic Latin, CJK Symbols and Lycian.
  const codes = Uint32Array.from([0x41, 0x42, 0x2fe0, 0x2fe1, 0x3001, 0x10200, 0x10280])
  const groups = groupByBlock(codes)
  assert.deepEqual(groups.map((group) => group.block), ['Basic Latin', '', 'CJK Symbols and Punctuation', '', 'Lycian'])
  assert.deepEqual(blockOptions(groups), [
    { value: 'Basic Latin', block: 'Basic Latin', count: 2 },
    { value: 'CJK Symbols and Punctuation', block: 'CJK Symbols and Punctuation', count: 1 },
    { value: 'Lycian', block: 'Lycian', count: 1 },
    { value: NO_BLOCK, block: '', count: 3 }
  ])
  const shown = (value: string) => groupByBlock(codes, (_, block) => inBlockFilter(value, block)).flatMap((group) => group.codes)
  assert.deepEqual(shown(NO_BLOCK), [0x2fe0, 0x2fe1, 0x10200])
  assert.deepEqual(shown('Lycian'), [0x10280])
  assert.equal(shown('').length, codes.length)
  assert.deepEqual(blockOptions(groupByBlock(Uint32Array.from([0x41]))), [{ value: 'Basic Latin', block: 'Basic Latin', count: 1 }])
})

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

/** A Latin and Cyrillic font's block names, in the English and the Russian UI. */
const LATIN_CYRILLIC = ['Basic Latin', 'Latin-1 Supplement', 'Cyrillic']
const EN_NAMES = fontBlockNames(LATIN_CYRILLIC, 'en')
const RU_NAMES = fontBlockNames(LATIN_CYRILLIC, 'ru')

test('understands the Characters search box', () => {
  assert.deepEqual(EN_NAMES, LATIN_CYRILLIC)
  assert.deepEqual(RU_NAMES, ['Basic Latin', 'Основная латиница', 'Latin-1 Supplement', 'Латиница-1, дополнение', 'Cyrillic', 'Кириллица'])
  assert.deepEqual(parseCharQuery('', EN_NAMES), { kind: 'all' })
  const one = parseCharQuery('U+0411', EN_NAMES)
  assert.ok(one.kind === 'codes' && one.codes.has(0x411) && one.codes.size === 1)
  const several = parseCharQuery('0x41, u+42', EN_NAMES)
  assert.ok(several.kind === 'codes' && several.codes.has(0x41) && several.codes.has(0x42))
  const range = parseCharQuery('U+0400-04FF', EN_NAMES)
  assert.deepEqual(range, { kind: 'range', from: 0x400, to: 0x4ff })
  const typed = parseCharQuery('Ёж', EN_NAMES)
  assert.ok(typed.kind === 'codes' && typed.codes.has(0x401) && typed.codes.has(0x436))
  assert.deepEqual(parseCharQuery('cyrillic', EN_NAMES), { kind: 'block', text: 'cyrillic' })
  assert.deepEqual(parseCharQuery('Кирил', RU_NAMES), { kind: 'block', text: 'кирил' })
  // English names work in the Russian UI too; Russian ones only there.
  assert.deepEqual(parseCharQuery('cyrillic', RU_NAMES), { kind: 'block', text: 'cyrillic' })
  assert.equal(parseCharQuery('Кирил', EN_NAMES).kind, 'codes')
  assert.ok(matchesQuery(parseCharQuery('cyril', EN_NAMES), 0x411, 'Cyrillic', 'Cyrillic'))
  assert.ok(matchesQuery(parseCharQuery('кирил', RU_NAMES), 0x411, 'Cyrillic', 'Кириллица'))
})

test('words that name no block of the font are searched as the characters typed', () => {
  // The font has no Greek block: "greek" is the letters g, r, e, k.
  const greek = parseCharQuery('greek', EN_NAMES)
  assert.ok(greek.kind === 'codes' && greek.codes.size === 4 && greek.codes.has(0x67) && greek.codes.has(0x6b))
  assert.ok(!matchesQuery(greek, 0x391, 'Greek and Coptic', 'Greek and Coptic'))
  assert.equal(parseCharQuery('greek', fontBlockNames(['Greek and Coptic'], 'en')).kind, 'block')
  // A word or a sentence longer than eight letters is its characters too.
  const sentence = parseCharQuery('Съешь же ещё этих', RU_NAMES)
  assert.ok(sentence.kind === 'codes' && sentence.codes.has(0x44a) && sentence.codes.has(0x451) && !sentence.codes.has(0x20))
  const word = parseCharQuery('Typography', EN_NAMES)
  assert.ok(word.kind === 'codes' && word.codes.size === 8)
})

test('reads block names, ranges and punctuation in the search box the way they are meant', () => {
  const names = ['Latin-1 Supplement', 'Box Drawing', 'IPA Extensions', 'Greek Extended', 'Greek and Coptic', 'NKo']
  const parse = (query: string) => parseCharQuery(query, names)
  const block = (query: string, code: number, name: string) => matchesQuery(parse(query), code, name, name)
  // Separators alone search for nothing.
  assert.deepEqual(parse(','), { kind: 'all' })
  assert.deepEqual(parse(' , ,'), { kind: 'all' })
  // Block names with digits, hyphens and abbreviations are not ranges or typed letters.
  assert.equal(parse('latin-1').kind, 'block')
  assert.ok(block('latin-1', 0xe9, 'Latin-1 Supplement'))
  assert.ok(block('box draw', 0x2500, 'Box Drawing'))
  assert.ok(block('IPA ext', 0x250, 'IPA Extensions'))
  assert.ok(block('greek ext', 0x1f00, 'Greek Extended'))
  assert.ok(!block('greek ext', 0x391, 'Greek and Coptic'))
  assert.ok(block("n'ko", 0x7c0, 'NKo'))
  // Short letter runs are typed characters, a ligature included.
  const ffi = parse('ffi')
  assert.ok(ffi.kind === 'codes' && ffi.codes.has(0x66) && ffi.codes.has(0x69) && ffi.codes.size === 2)
  // Ranges, with or without prefixes and in several notations.
  assert.deepEqual(parse('U+0400..U+04FF'), { kind: 'range', from: 0x400, to: 0x4ff })
  assert.deepEqual(parse('400-4FF'), { kind: 'range', from: 0x400, to: 0x4ff })
  assert.deepEqual(parse('0x4FF – 0x400'), { kind: 'range', from: 0x400, to: 0x4ff })
  assert.notEqual(parse('ab-cd').kind, 'range')
})

test('arrow keys keep the column across block boundaries', () => {
  // Latin: 5 cells in rows of 4 (4 + 1); Cyrillic: 6 cells (4 + 2); Emoticons: 1.
  const codes = Uint32Array.from([0x41, 0x42, 0x43, 0x44, 0x45, 0x410, 0x411, 0x412, 0x413, 0x414, 0x415, 0x1f600])
  const groups = groupByBlock(codes)
  const layout = layoutGrid(groups, 4, 20, 50)
  const move = (group: number, index: number, key: 'left' | 'right' | 'up' | 'down') => moveInGrid(layout, groups, { group, index }, key)
  // From column 2 of the short last Latin row (index 4 is column 0): down into Cyrillic column 0.
  assert.deepEqual(move(0, 4, 'down'), { group: 1, index: 0 })
  // Column 2 of Latin row 1 → column 2 of the next row would be past its one cell: the last cell.
  assert.deepEqual(move(0, 2, 'down'), { group: 0, index: 4 })
  // Up from Cyrillic column 3 lands on the short Latin row's last cell, not 4 cells back.
  assert.deepEqual(move(1, 3, 'up'), { group: 0, index: 4 })
  // Down from Cyrillic column 3 of row 1 → row 2 has 2 cells: its last one.
  assert.deepEqual(move(1, 3, 'down'), { group: 1, index: 5 })
  assert.deepEqual(move(1, 5, 'down'), { group: 2, index: 0 })
  assert.deepEqual(move(2, 0, 'up'), { group: 1, index: 4 })
  assert.equal(move(0, 0, 'up'), null)
  assert.equal(move(2, 0, 'down'), null)
  // Left and right walk the characters in order across blocks.
  assert.deepEqual(move(0, 4, 'right'), { group: 1, index: 0 })
  assert.deepEqual(move(1, 0, 'left'), { group: 0, index: 4 })
  assert.equal(move(2, 0, 'right'), null)
  assert.equal(move(0, 0, 'left'), null)
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
  assert.equal(weightLabel(700, 'en'), '700 (Bold)')
  assert.equal(weightLabel(450, 'en'), '450 (≈ Regular)')
  assert.equal(widthLabel(5, 'en'), '5 (Normal)')
  assert.equal(widthLabel(12, 'en'), '12')
  // Russian names in the Russian UI, and Russian decimals.
  assert.equal(weightLabel(700, 'ru'), '700 (Жирный)')
  assert.equal(weightLabel(950, 'ru'), '950 (Сверхчёрный)')
  assert.equal(weightLabel(380, 'ru'), '380 (≈ Обычный)')
  assert.equal(widthLabel(3, 'ru'), '3 (Сжатый)')
  assert.equal(widthLabel(9, 'ru'), '9 (Ультрарасширенный)')
  assert.equal(formatFixed(1.25, 2, 'ru'), '1,25')
  assert.equal(formatFixed(1.2, 2, 'en'), '1.20')
  assert.equal(fill(ru.cmapSymbol, { source: '3/0' }), '3/0 (символьный шрифт)')
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
