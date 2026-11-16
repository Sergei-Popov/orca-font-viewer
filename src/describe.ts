// Turns parsed numbers into the words the Info tab and the header show. DOM-free, so it is tested.

import { coverage } from './font/chars'
import type { FaceInfo } from './font/info'
import type { Language, Strings } from './i18n'

const WEIGHTS: [weight: number, en: string, ru: string][] = [
  [100, 'Thin', 'Тонкий'], [200, 'ExtraLight', 'Сверхсветлый'], [300, 'Light', 'Светлый'],
  [400, 'Regular', 'Обычный'], [500, 'Medium', 'Средний'], [600, 'SemiBold', 'Полужирный'],
  [700, 'Bold', 'Жирный'], [800, 'ExtraBold', 'Сверхжирный'], [900, 'Black', 'Чёрный'],
  [950, 'ExtraBlack', 'Сверхчёрный']
]

/** "700 (Bold)", "700 (Жирный)"; the nearest named weight for values in between. */
export function weightLabel(weight: number, language: Language): string {
  let best = WEIGHTS[0]
  for (const entry of WEIGHTS) {
    if (Math.abs(entry[0] - weight) < Math.abs(best[0] - weight)) best = entry
  }
  const name = language === 'ru' ? best[2] : best[1]
  return best[0] === weight ? `${weight} (${name})` : `${weight} (≈ ${name})`
}

const WIDTHS: Record<Language, string[]> = {
  en: ['UltraCondensed', 'ExtraCondensed', 'Condensed', 'SemiCondensed', 'Normal', 'SemiExpanded', 'Expanded', 'ExtraExpanded', 'UltraExpanded'],
  ru: ['Ультрасжатый', 'Сверхсжатый', 'Сжатый', 'Полусжатый', 'Обычный', 'Полурасширенный', 'Расширенный', 'Сверхрасширенный', 'Ультрарасширенный']
}

/** "5 (Normal)", "5 (Обычный)"; the bare number for a width class outside 1–9. */
export function widthLabel(width: number, language: Language): string {
  const name = WIDTHS[language][width - 1]
  return name ? `${width} (${name})` : String(width)
}

/** The OS/2 fsType embedding licence, in words. */
export function embeddingLabel(fsType: number, s: Strings): string {
  const usage = fsType & 0x000f
  let text: string
  if (usage & 0x0008) text = s.embedEditable
  else if (usage & 0x0004) text = s.embedPreview
  else if (usage & 0x0002) text = s.embedRestricted
  else text = s.embedInstallable
  const extra: string[] = []
  if (fsType & 0x0100) extra.push(s.embedNoSubsetting)
  if (fsType & 0x0200) extra.push(s.embedBitmapOnly)
  return extra.length ? `${text}; ${extra.join(', ')}` : text
}

export function formatBytes(bytes: number, language: Language): string {
  const units = language === 'ru' ? ['Б', 'КБ', 'МБ', 'ГБ'] : ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1
  const number = value.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
  return `${number} ${units[unit]}`
}

export function formatNumber(value: number, language: Language): string {
  return value.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 3 })
}

/** A value such as a line height with exactly `digits` decimals: "1.25", "1,25". */
export function formatFixed(value: number, digits: number, language: Language): string {
  return value.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** A UTC date from the head table; fonts store no time zone. */
export function formatDate(ms: number | null, language: Language): string {
  if (ms === null || !Number.isFinite(ms)) return '—'
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  })
}

/**
 * The sample sentence: the Russian pangram for a Russian UI when the font has Cyrillic, else the
 * font's own sample (name 19) if it draws it, else a pangram it covers, else its own characters.
 */
export function defaultSample(info: FaceInfo, language: Language, s: Strings): string {
  const codes = info.cmap.codes
  const own = info.names.sampleText
  const cyrillic = coverage(codes, s.sampleCyrillic) >= 0.95
  if (language === 'ru' && cyrillic) return s.sampleCyrillic
  if (own && own.length <= 200 && coverage(codes, own) >= 0.9) return own
  if (coverage(codes, s.sampleLatin) >= 0.95) return s.sampleLatin
  if (cyrillic) return s.sampleCyrillic
  // A font for another script: a run of the characters it has, skipping controls and spaces.
  const sample: string[] = []
  for (let i = 0; i < codes.length && sample.length < 40; i++) {
    const code = codes[i]
    if (code > 0x20 && !(code >= 0x7f && code <= 0xa0)) sample.push(String.fromCodePoint(code))
  }
  return sample.join('') || (language === 'ru' ? s.sampleCyrillic : s.sampleLatin)
}

export const ALPHABET_LINES = [
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz',
  'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
  'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
  '0123456789',
  '!?.,:;…–—-_()[]{}<>/\\|@#$%&*+=«»“”‘’"\'§©®™°€£¥₽'
]

/** Alphabet lines the font covers (most of their characters). */
export function alphabetLines(info: FaceInfo): string[] {
  return ALPHABET_LINES.filter((line) => coverage(info.cmap.codes, line) >= 0.8)
}
