// Human names for OpenType feature tags and which ones a browser turns on by itself, so the
// preview offers the switches a person would use and leaves out shaping internals.

type Names = { en: string; ru: string }

const NAMES: Record<string, Names> = {
  aalt: { en: 'Access all alternates', ru: 'Все альтернативы' },
  afrc: { en: 'Alternative fractions', ru: 'Дроби с косой чертой' },
  c2pc: { en: 'Petite capitals from capitals', ru: 'Прописные в мини-капитель' },
  c2sc: { en: 'Small capitals from capitals', ru: 'Прописные в капитель' },
  calt: { en: 'Contextual alternates', ru: 'Контекстные варианты' },
  case: { en: 'Case-sensitive forms', ru: 'Формы для прописных' },
  clig: { en: 'Contextual ligatures', ru: 'Контекстные лигатуры' },
  cpsp: { en: 'Capital spacing', ru: 'Разрядка прописных' },
  cswh: { en: 'Contextual swash', ru: 'Контекстные росчерки' },
  dlig: { en: 'Discretionary ligatures', ru: 'Дополнительные лигатуры' },
  dnom: { en: 'Denominators', ru: 'Знаменатели' },
  expt: { en: 'Expert forms', ru: 'Экспертные формы' },
  frac: { en: 'Fractions', ru: 'Дроби' },
  fwid: { en: 'Full widths', ru: 'Полноширинные' },
  halt: { en: 'Alternate half widths', ru: 'Полуширинные (альт.)' },
  hist: { en: 'Historical forms', ru: 'Исторические формы' },
  hlig: { en: 'Historical ligatures', ru: 'Исторические лигатуры' },
  hwid: { en: 'Half widths', ru: 'Полуширинные' },
  jalt: { en: 'Justification alternates', ru: 'Варианты для выключки' },
  kern: { en: 'Kerning', ru: 'Кернинг' },
  liga: { en: 'Standard ligatures', ru: 'Стандартные лигатуры' },
  lnum: { en: 'Lining figures', ru: 'Цифры на линии' },
  mgrk: { en: 'Mathematical Greek', ru: 'Математический греческий' },
  nalt: { en: 'Alternate annotation forms', ru: 'Аннотационные формы' },
  numr: { en: 'Numerators', ru: 'Числители' },
  onum: { en: 'Oldstyle figures', ru: 'Старостильные цифры' },
  ordn: { en: 'Ordinals', ru: 'Порядковые' },
  ornm: { en: 'Ornaments', ru: 'Орнаменты' },
  palt: { en: 'Proportional alternate widths', ru: 'Пропорциональные (альт.)' },
  pcap: { en: 'Petite capitals', ru: 'Мини-капитель' },
  pnum: { en: 'Proportional figures', ru: 'Пропорциональные цифры' },
  pwid: { en: 'Proportional widths', ru: 'Пропорциональная ширина' },
  ruby: { en: 'Ruby notation forms', ru: 'Формы руби' },
  salt: { en: 'Stylistic alternates', ru: 'Стилистические варианты' },
  sinf: { en: 'Scientific inferiors', ru: 'Научные нижние индексы' },
  smcp: { en: 'Small capitals', ru: 'Капитель' },
  smpl: { en: 'Simplified forms', ru: 'Упрощённые формы' },
  subs: { en: 'Subscript', ru: 'Нижний индекс' },
  sups: { en: 'Superscript', ru: 'Верхний индекс' },
  swsh: { en: 'Swash', ru: 'Росчерки' },
  titl: { en: 'Titling', ru: 'Заголовочные формы' },
  tnum: { en: 'Tabular figures', ru: 'Моноширинные цифры' },
  trad: { en: 'Traditional forms', ru: 'Традиционные формы' },
  twid: { en: 'Third widths', ru: 'Ширина в треть' },
  unic: { en: 'Unicase', ru: 'Уникейс' },
  vert: { en: 'Vertical alternates', ru: 'Вертикальные формы' },
  vkrn: { en: 'Vertical kerning', ru: 'Вертикальный кернинг' },
  zero: { en: 'Slashed zero', ru: 'Перечёркнутый ноль' }
}

/**
 * Features Chromium applies on its own or that shape a script rather than style it. They are
 * still listed in Info, but the preview offers no switch for them.
 */
const SHAPING = new Set([
  'abvf', 'abvm', 'abvs', 'akhn', 'blwf', 'blwm', 'blws', 'ccmp', 'cfar', 'cjct', 'curs', 'dist',
  'dtls', 'fin2', 'fin3', 'fina', 'flac', 'half', 'haln', 'init', 'isol', 'ljmo', 'locl', 'mark',
  'med2', 'medi', 'mkmk', 'mset', 'nukt', 'pref', 'pres', 'pstf', 'psts', 'rclt', 'rkrf', 'rlig',
  'rphf', 'rtbd', 'rtla', 'rvrn', 'ssty', 'stch', 'tjmo', 'vatu', 'vjmo', 'ltra', 'ltrm', 'rtlm',
  'valt', 'vhal', 'vpal', 'vrt2', 'vrtr', 'jp78', 'jp83', 'jp90', 'jp04', 'nlck', 'hngl', 'size'
])

/** Features a browser turns on for horizontal text unless told otherwise. */
const ON_BY_DEFAULT = new Set(['calt', 'clig', 'kern', 'liga'])

export function featureName(tag: string, uiName: string | null, language: 'en' | 'ru'): string {
  if (uiName) return uiName
  const known = NAMES[tag]
  if (known) return known[language]
  const set = /^ss(\d\d)$/.exec(tag)
  if (set) {
    const n = Number(set[1])
    return language === 'ru' ? `Стилистический набор ${n}` : `Stylistic set ${n}`
  }
  const variant = /^cv(\d\d)$/.exec(tag)
  if (variant) {
    const n = Number(variant[1])
    return language === 'ru' ? `Вариант знака ${n}` : `Character variant ${n}`
  }
  return tag
}

export function isUserFeature(tag: string): boolean {
  return !SHAPING.has(tag)
}

export function isOnByDefault(tag: string): boolean {
  return ON_BY_DEFAULT.has(tag)
}

/**
 * The `font-feature-settings` value for the switches a person changed: only tags that differ
 * from the browser's default are written, so untouched features keep Chromium's behaviour.
 */
export function featureSettings(state: ReadonlyMap<string, boolean>): string {
  const parts: string[] = []
  for (const [tag, on] of state) {
    if (on !== isOnByDefault(tag)) {
      parts.push(`"${tag}" ${on ? 1 : 0}`)
    }
  }
  return parts.length ? parts.join(', ') : 'normal'
}

/** The `font-variation-settings` value for axis positions. */
export function variationSettings(values: ReadonlyMap<string, number>): string {
  const parts: string[] = []
  for (const [tag, value] of values) {
    parts.push(`"${tag}" ${Math.round(value * 1000) / 1000}`)
  }
  return parts.length ? parts.join(', ') : 'normal'
}

/** Sort order for the preview: named sets and variants after the common features. */
export function compareFeatures(a: string, b: string): number {
  const group = (tag: string) => (/^ss\d\d$/.test(tag) ? 2 : /^cv\d\d$/.test(tag) ? 3 : NAMES[tag] ? 0 : 1)
  return group(a) - group(b) || a.localeCompare(b)
}
