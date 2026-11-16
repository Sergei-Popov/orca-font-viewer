// Code point helpers for the Characters tab: Unicode blocks, notations to copy, and the search
// box's parsing of "A", "U+0041", "0x41" or a block name.

import { BLOCK_STARTS } from './blocks-data'

/** Russian names of the blocks people meet most; the rest keep Unicode's English names. */
const BLOCK_NAMES_RU: Record<string, string> = {
  'Basic Latin': 'Основная латиница',
  'Latin-1 Supplement': 'Латиница-1, дополнение',
  'Latin Extended-A': 'Расширенная латиница A',
  'Latin Extended-B': 'Расширенная латиница B',
  'Latin Extended Additional': 'Дополнительная расширенная латиница',
  'IPA Extensions': 'Международный фонетический алфавит',
  'Spacing Modifier Letters': 'Модификаторы',
  'Combining Diacritical Marks': 'Комбинируемые диакритические знаки',
  'Greek and Coptic': 'Греческий и коптский',
  Cyrillic: 'Кириллица',
  'Cyrillic Supplement': 'Кириллица, дополнение',
  'Cyrillic Extended-A': 'Расширенная кириллица A',
  'Cyrillic Extended-B': 'Расширенная кириллица B',
  'Cyrillic Extended-C': 'Расширенная кириллица C',
  'Cyrillic Extended-D': 'Расширенная кириллица D',
  Armenian: 'Армянский',
  Hebrew: 'Иврит',
  Arabic: 'Арабский',
  Georgian: 'Грузинский',
  'General Punctuation': 'Знаки пунктуации',
  'Superscripts and Subscripts': 'Верхние и нижние индексы',
  'Currency Symbols': 'Символы валют',
  'Letterlike Symbols': 'Буквоподобные символы',
  'Number Forms': 'Числовые формы',
  Arrows: 'Стрелки',
  'Mathematical Operators': 'Математические операторы',
  'Miscellaneous Technical': 'Разные технические символы',
  'Box Drawing': 'Псевдографика',
  'Block Elements': 'Блочные элементы',
  'Geometric Shapes': 'Геометрические фигуры',
  'Miscellaneous Symbols': 'Разные символы',
  Dingbats: 'Дингбаты',
  'Private Use Area': 'Область для частного использования',
  'Alphabetic Presentation Forms': 'Алфавитные формы представления',
  'Halfwidth and Fullwidth Forms': 'Полуширинные и полноширинные формы',
  Specials: 'Специальные символы',
  Emoticons: 'Эмотиконы',
  'CJK Unified Ideographs': 'Унифицированные иероглифы ККЯ',
  Hiragana: 'Хирагана',
  Katakana: 'Катакана',
  'Hangul Syllables': 'Слоги хангыль'
}

/** The block of `code`, or '' outside every block. */
export function blockOf(code: number): string {
  let lo = 0
  let hi = BLOCK_STARTS.length - 1
  if (code < 0) return ''
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (BLOCK_STARTS[mid][0] <= code) lo = mid
    else hi = mid - 1
  }
  return BLOCK_STARTS[lo][1]
}

export function blockLabel(block: string, language: 'en' | 'ru', noBlock: string): string {
  if (!block) return noBlock
  return language === 'ru' ? (BLOCK_NAMES_RU[block] ?? block) : block
}

/** "U+0041", at least four hex digits. */
export function uPlus(code: number): string {
  return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`
}

export function hex(code: number): string {
  return code.toString(16).toUpperCase().padStart(4, '0')
}

export function htmlEntity(code: number): string {
  return `&#x${code.toString(16).toUpperCase()};`
}

export function cssEscape(code: number): string {
  return `\\${code.toString(16).toUpperCase()}`
}

export function jsEscape(code: number): string {
  return code > 0xffff ? `\\u{${code.toString(16).toUpperCase()}}` : `\\u${hex(code)}`
}

/** UTF-8 bytes as hex pairs: "D0 91". */
export function utf8Bytes(code: number): string {
  const bytes: number[] = []
  if (code < 0x80) bytes.push(code)
  else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63))
  else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63))
  else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63))
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
}

/** The character itself; surrogates and controls give a visible stand-in or ''. */
export function charOf(code: number): string {
  if (code >= 0xd800 && code <= 0xdfff) return ''
  return String.fromCodePoint(code)
}

/** Code points with no visible glyph of their own: controls, separators, format characters. */
export function isInvisible(code: number): boolean {
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0xa0) ||
    code === 0xad ||
    (code >= 0x2000 && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202f) ||
    (code >= 0x205f && code <= 0x206f) ||
    code === 0x3000 ||
    code === 0xfeff ||
    (code >= 0xfe00 && code <= 0xfe0f) ||
    (code >= 0xe0000 && code <= 0xe007f)
  )
}

export type CharQuery =
  | { kind: 'all' }
  | { kind: 'codes'; codes: Set<number> }
  | { kind: 'range'; from: number; to: number }
  /**
   * Blocks whose names have the words of `text`; `typed`, for a short word that only begins a block
   * name ("сим", "лат"), holds its characters, which the grid shows first (see queryGroups).
   */
  | { kind: 'block'; text: string; typed?: Set<number> }

/** Lower case without apostrophes, so "n'ko" finds "NKo". */
function normalize(text: string): string {
  return text.toLowerCase().replace(/['’]/g, '')
}

/**
 * Whether every word of `query` begins a word of the block name: "IPA ext", "box draw", "cjk ext",
 * "кирил"; "ate" does not find "Private Use Area".
 */
export function blockNameMatches(query: string, name: string): boolean {
  const target = normalize(name)
  const words = normalize(query).split(/\s+/).filter(Boolean)
  return words.length > 0 && words.every((word) => beginsAWord(target, word))
}

function beginsAWord(target: string, word: string): boolean {
  for (let at = target.indexOf(word); at >= 0; at = target.indexOf(word, at + 1)) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(target[at - 1])) return true
  }
  return false
}

/** Whether `word` is a whole word of the block name: "latin" of "Basic Latin", not "lat". */
function isWordOf(word: string, name: string): boolean {
  return normalize(name)
    .split(/[^\p{L}\p{N}]+/u)
    .includes(normalize(word))
}

/** Typed characters a block search also shows when they are all in the font: up to eight. */
const TYPED_WITH_BLOCKS = 8

/**
 * The names a block search may match for a font: those of the blocks it has characters in, in
 * English and in the UI language.
 */
export function fontBlockNames(blocks: Iterable<string>, language: 'en' | 'ru'): string[] {
  const names = new Set<string>()
  for (const block of blocks) {
    if (!block) continue
    names.add(block)
    names.add(blockLabel(block, language, block))
  }
  return [...names]
}

const RANGE = /^(u\+|0x)?([0-9a-f]{1,6})\s*(?:-|–|—|\.\.|…)\s*(?:u\+|0x)?([0-9a-f]{1,6})$/i

/**
 * What the Characters search box asks for: "U+0041", "u+41", "0x41", a range ("U+0400-04FF",
 * "U+0400..U+04FF", "400-4FF"), the starts of words of a block name ("cyrillic", "latin-1",
 * "IPA ext", and "кирил" in the Russian UI), or typed characters ("Ёж", "ffi", a word or a
 * sentence). Words are a block search only when they match one of `blockNames` (the font's own
 * blocks: see fontBlockNames); otherwise they are the characters typed. A single word of up to
 * eight characters that only begins a block name ("сим" of "символы", "лат" of "латиница") and
 * whose characters are all in the font (`codes`, sorted) is both: its characters come first, then
 * the blocks. Text that holds nothing to search for shows everything.
 */
export function parseCharQuery(input: string, blockNames: readonly string[], codes: Uint32Array = new Uint32Array(0)): CharQuery {
  const text = input.trim()
  const parts = text.split(/[\s,]+/).filter(Boolean)
  if (!parts.length) return { kind: 'all' }
  const range = RANGE.exec(text)
  // Without U+/0x, a range needs digits on both sides, so "ab-cd" or "latin-1" are not ranges.
  if (range && (range[1] || (range[2].length >= 2 && range[3].length >= 2 && /\d/.test(range[2] + range[3])))) {
    const from = parseInt(range[2], 16)
    const to = parseInt(range[3], 16)
    return { kind: 'range', from: Math.min(from, to), to: Math.max(from, to) }
  }
  if (parts.every((part) => /^(u\+|0x)[0-9a-f]{1,6}$/i.test(part))) {
    return { kind: 'codes', codes: new Set(parts.map((part) => parseInt(part.slice(2), 16))) }
  }
  // Words: a block of the font when one matches ("latin-1", "box draw", "Thai"), else the typed
  // characters, however many.
  const wordy = /[\s-]/.test(text) || /^[\p{L}'’]{3,}$/u.test(text)
  const typed = new Set([...parts.join('')].map((c) => c.codePointAt(0)!))
  const matched = wordy ? blockNames.filter((name) => blockNameMatches(text, name)) : []
  if (!matched.length) return { kind: 'codes', codes: typed }
  const word = /^[\p{L}\p{N}'’]+$/u.test(text)
  if (
    word &&
    [...text].length <= TYPED_WITH_BLOCKS &&
    !matched.some((name) => isWordOf(text, name)) &&
    [...typed].every((code) => hasCode(codes, code))
  ) {
    return { kind: 'block', text: normalize(text), typed }
  }
  return { kind: 'block', text: normalize(text) }
}

/** Whether `code` (in `block`, shown as `label`) matches the query. */
export function matchesQuery(query: CharQuery, code: number, block: string, label: string): boolean {
  switch (query.kind) {
    case 'all':
      return true
    case 'codes':
      return query.codes.has(code)
    case 'range':
      return code >= query.from && code <= query.to
    case 'block':
      return blockNameMatches(query.text, block) || blockNameMatches(query.text, label)
  }
}

/** Which of `codes` (sorted) are present: used to choose sample text and alphabet lines. */
export function coverage(sorted: Uint32Array, text: string): number {
  const chars = [...new Set([...text].map((c) => c.codePointAt(0)!))].filter((c) => c > 0x20)
  if (!chars.length) return 1
  let found = 0
  for (const c of chars) {
    if (hasCode(sorted, c)) found++
  }
  return found / chars.length
}

export function hasCode(sorted: Uint32Array, code: number): boolean {
  let lo = 0
  let hi = sorted.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const value = sorted[mid]
    if (value === code) return true
    if (value < code) lo = mid + 1
    else hi = mid - 1
  }
  return false
}
