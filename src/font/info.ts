// Everything the viewer shows about one face, read from its tables. Missing or damaged tables
// leave their fields empty instead of failing the whole font.

import { FontError } from './bytes'
import { type Face, SFNT_TRUETYPE } from './container'
import {
  type CharMap,
  type FeatureEntry,
  type FvarTable,
  type HeadTable,
  type HheaTable,
  type NameTable,
  type Os2Table,
  type PostTable,
  advanceWidths,
  parseCmap,
  parseFeatureList,
  parseFvar,
  parseHead,
  parseHhea,
  parseMaxp,
  parseName,
  parseOs2,
  parsePost
} from './tables'

export type Outlines = 'truetype' | 'cff' | 'cff2' | 'bitmap' | 'unknown'
export type ColorFormat = 'COLRv0' | 'COLRv1' | 'SVG' | 'sbix' | 'CBDT'

export type NameKey =
  | 'copyright' | 'family' | 'subfamily' | 'uniqueId' | 'fullName' | 'version' | 'postScriptName'
  | 'trademark' | 'manufacturer' | 'designer' | 'description' | 'vendorUrl' | 'designerUrl'
  | 'license' | 'licenseUrl' | 'typographicFamily' | 'typographicSubfamily' | 'sampleText'

export const NAME_IDS: Record<NameKey, number> = {
  copyright: 0, family: 1, subfamily: 2, uniqueId: 3, fullName: 4, version: 5, postScriptName: 6,
  trademark: 7, manufacturer: 8, designer: 9, description: 10, vendorUrl: 11, designerUrl: 12,
  license: 13, licenseUrl: 14, typographicFamily: 16, typographicSubfamily: 17, sampleText: 19
}

export type AxisInfo = { tag: string; name: string; min: number; default: number; max: number; hidden: boolean }
export type InstanceInfo = { name: string; coordinates: Record<string, number> }
export type FeatureInfo = { tag: string; table: 'GSUB' | 'GPOS' | 'both'; uiName: string | null }

export type FaceInfo = {
  /** The family the UI shows: typographic family (16) over legacy family (1). */
  family: string
  /** The style the UI shows: typographic subfamily (17) over legacy subfamily (2). */
  style: string
  names: Partial<Record<NameKey, string>>
  outlines: Outlines
  sfntVersion: string
  glyphCount: number | null
  cmap: CharMap
  head: HeadTable | null
  hhea: HheaTable | null
  os2: Os2Table | null
  post: PostTable | null
  axes: AxisInfo[]
  instances: InstanceInfo[]
  features: FeatureInfo[]
  color: ColorFormat[]
  monospace: boolean
  variable: boolean
  /** Tables whose bytes could not be read, with the reason. */
  problems: string[]
  /** Why the face cannot be shown at all (a table it cannot do without is missing), or null. */
  damaged: string | null
}

/**
 * Parsed tables, shared by the faces of a collection: faces often point at the same name or cmap
 * table, and a hostile collection may point hundreds of faces at one expensive table. A name
 * table is known by where it starts alone, so faces that give the same start with different
 * lengths share one parse too.
 */
export type TableCache = WeakMap<ArrayBufferLike, Map<string, unknown>>

export function newTableCache(): TableCache {
  return new WeakMap()
}

function cacheKey(tag: string, bytes: Uint8Array): string {
  return tag === 'name' ? `name:${bytes.byteOffset}` : `${tag}:${bytes.byteOffset}:${bytes.byteLength}`
}

function isCached(cache: TableCache, tag: string, bytes: Uint8Array): boolean {
  return cache.get(bytes.buffer)?.has(cacheKey(tag, bytes)) ?? false
}

function cached<T>(cache: TableCache, tag: string, bytes: Uint8Array, parse: () => T): T {
  let perBuffer = cache.get(bytes.buffer)
  if (!perBuffer) {
    perBuffer = new Map()
    cache.set(bytes.buffer, perBuffer)
  }
  const key = cacheKey(tag, bytes)
  if (perBuffer.has(key)) {
    const hit = perBuffer.get(key)
    if (hit instanceof Error) throw hit
    return hit as T
  }
  try {
    const value = parse()
    perBuffer.set(key, value)
    return value
  } catch (error) {
    perBuffer.set(key, error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/** Tables a face cannot be shown without. */
const ESSENTIAL = ['head', 'name', 'cmap']

function attempt<T>(problems: string[], tag: string, read: () => T): T | null {
  try {
    return read()
  } catch (error) {
    problems.push(`${tag}: ${error instanceof FontError ? error.message : String(error)}`)
    return null
  }
}

function describeSfntVersion(value: number): string {
  if (value === SFNT_TRUETYPE) return '1.0'
  const text = String.fromCharCode((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255)
  return /^[\x20-\x7e]{4}$/.test(text) ? text : `0x${value.toString(16).padStart(8, '0')}`
}

const EMPTY_CMAP: CharMap = { codes: new Uint32Array(0), glyphs: new Uint32Array(0), source: '', symbol: false, problems: [] }

function emptyInfo(face: Face, damaged: string): FaceInfo {
  return {
    family: '', style: '', names: {}, outlines: 'unknown', sfntVersion: describeSfntVersion(face.sfntVersion),
    glyphCount: null, cmap: EMPTY_CMAP, head: null, hhea: null, os2: null, post: null, axes: [], instances: [],
    features: [], color: [], monospace: false, variable: false, problems: [damaged], damaged
  }
}

function readNames(face: Face, problems: string[], cache: TableCache): NameTable | null {
  const bytes = face.tables.get('name')
  return bytes ? attempt(problems, 'name', () => cached(cache, 'name', bytes, () => parseName(bytes))) : null
}

/** The label of a face for the collection picker: reads the name table only. */
export function faceLabel(face: Face, index: number, uiLanguage: string, cache: TableCache = newTableCache()): string {
  if (face.error) return `#${index + 1}`
  const names = readNames(face, [], cache)
  const pick = (id: number) => names?.label(id, uiLanguage) ?? null
  const label =
    pick(NAME_IDS.fullName) ??
    [pick(NAME_IDS.typographicFamily) ?? pick(NAME_IDS.family), pick(NAME_IDS.typographicSubfamily) ?? pick(NAME_IDS.subfamily)]
      .filter(Boolean)
      .join(' ')
  return label || `#${index + 1}`
}

/** What the collection picker's labels may cost over all faces: name records parsed plus bytes decoded. */
export const LABEL_BUDGET = 1 << 18

/**
 * The collection picker's label of every face. Together they cost at most `budget` (name records
 * parsed plus string bytes decoded); once it is spent, the faces left are labelled "#n".
 */
export function faceLabels(faces: readonly Face[], uiLanguage: string, cache: TableCache = newTableCache(), budget = LABEL_BUDGET): string[] {
  let left = budget
  return faces.map((face, index) => {
    const bytes = face.tables.get('name')
    if (face.error || !bytes || left <= 0) return `#${index + 1}`
    if (!isCached(cache, 'name', bytes)) {
      const records = bytes.byteLength >= 4 ? (bytes[2] << 8) | bytes[3] : 0
      if (records > left) {
        left = 0
        return `#${index + 1}`
      }
      left -= records
    }
    const names = readNames(face, [], cache)
    const before = names?.decodedBytes ?? 0
    const label = faceLabel(face, index, uiLanguage, cache)
    left -= (names?.decodedBytes ?? 0) - before
    return label
  })
}

/**
 * Whether a font is monospaced: post says so; or OS/2 PANOSE says Latin Text (2) with Monospaced
 * proportion (9), as Noto Sans Mono does while its post says otherwise; or nearly all its printable
 * ASCII characters (U+0021–007E, at least ten) have one advance width. Only ASCII is measured: in
 * a CJK font nearly every glyph is one em wide, yet its Latin letters are proportional.
 */
export function isMonospace(post: PostTable | null, os2: Os2Table | null, hhea: HheaTable | null, hmtx: Uint8Array | undefined, cmap: CharMap): boolean {
  if (post?.isFixedPitch) return true
  if (os2?.panose[0] === 2 && os2.panose[3] === 9) return true
  if (!hhea || !hmtx) return false
  const glyphs: number[] = []
  let lo = 0
  let hi = cmap.codes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cmap.codes[mid] < 0x21) lo = mid + 1
    else hi = mid
  }
  for (let i = lo; i < cmap.codes.length && cmap.codes[i] <= 0x7e; i++) {
    if (cmap.glyphs[i] !== 0) glyphs.push(cmap.glyphs[i])
  }
  const counts = new Map<number, number>()
  let measured = 0
  for (const advance of advanceWidths(hmtx, hhea.numberOfHMetrics, glyphs)) {
    if (!advance) continue
    measured++
    counts.set(advance, (counts.get(advance) ?? 0) + 1)
  }
  if (measured < 10) return false
  return Math.max(...counts.values()) >= measured * 0.95
}

export function describeFace(face: Face, uiLanguage: string, cache: TableCache = newTableCache()): FaceInfo {
  if (face.error) {
    return emptyInfo(face, face.error)
  }
  const problems: string[] = []
  const table = (tag: string) => face.tables.get(tag)
  const tableNames = new Set(face.tableList.map((t) => t.tag))
  for (const entry of face.tableList) {
    if (entry.outside) problems.push(`${entry.tag}: its ${entry.length} bytes lie past the end of the file`)
  }

  const names = readNames(face, problems, cache)
  const name = (id: number) => names?.pick(id, uiLanguage) ?? null
  // Names the UI shows as labels are cut to LABEL_MAX characters; the Info tab shows them whole.
  const label = (id: number) => names?.label(id, uiLanguage) ?? null
  const nameValues: Partial<Record<NameKey, string>> = {}
  for (const [key, id] of Object.entries(NAME_IDS) as [NameKey, number][]) {
    const value = name(id)
    if (value) nameValues[key] = value
  }

  const headBytes = table('head')
  const head = headBytes ? attempt(problems, 'head', () => parseHead(headBytes)) : null
  const hheaBytes = table('hhea')
  const hhea = hheaBytes ? attempt(problems, 'hhea', () => parseHhea(hheaBytes)) : null
  const maxpBytes = table('maxp')
  const glyphCount = maxpBytes ? attempt(problems, 'maxp', () => parseMaxp(maxpBytes)) : null
  const os2Bytes = table('OS/2')
  const os2 = os2Bytes ? attempt(problems, 'OS/2', () => parseOs2(os2Bytes)) : null
  const postBytes = table('post')
  const post = postBytes ? attempt(problems, 'post', () => parsePost(postBytes)) : null
  const cmapBytes = table('cmap')
  const cmap = (cmapBytes ? attempt(problems, 'cmap', () => cached(cache, 'cmap', cmapBytes, () => parseCmap(cmapBytes))) : null) ?? EMPTY_CMAP
  problems.push(...cmap.problems)

  const fvarBytes = table('fvar')
  const fvar: FvarTable | null = fvarBytes ? attempt(problems, 'fvar', () => cached(cache, 'fvar', fvarBytes, () => parseFvar(fvarBytes))) : null
  if (fvar?.skippedInstances) {
    problems.push(`fvar: ${fvar.skippedInstances} named instances were not read`)
  }
  const axes: AxisInfo[] = (fvar?.axes ?? []).map((axis) => ({
    tag: axis.tag,
    name: label(axis.nameId) ?? axis.tag,
    min: axis.min,
    default: axis.default,
    max: axis.max,
    hidden: axis.hidden
  }))
  const instances: InstanceInfo[] = (fvar?.instances ?? []).map((instance, i) => ({
    name: label(instance.nameId) ?? `#${i + 1}`,
    coordinates: instance.coordinates
  }))

  const features = new Map<string, FeatureInfo>()
  for (const tag of ['GSUB', 'GPOS'] as const) {
    const bytes = table(tag)
    if (!bytes) continue
    const list: FeatureEntry[] = attempt(problems, tag, () => cached(cache, tag, bytes, () => parseFeatureList(bytes))) ?? []
    for (const entry of list) {
      const existing = features.get(entry.tag)
      const uiName = entry.uiNameId !== null ? label(entry.uiNameId) : null
      if (existing) {
        existing.table = existing.table === tag ? tag : 'both'
        existing.uiName ??= uiName
      } else {
        features.set(entry.tag, { tag: entry.tag, table: tag, uiName })
      }
    }
  }

  let outlines: Outlines = 'unknown'
  if (tableNames.has('CFF2')) outlines = 'cff2'
  else if (tableNames.has('CFF ')) outlines = 'cff'
  else if (tableNames.has('glyf')) outlines = 'truetype'
  else if (tableNames.has('CBDT') || tableNames.has('sbix') || tableNames.has('EBDT')) outlines = 'bitmap'

  const color: ColorFormat[] = []
  const colr = table('COLR')
  if (colr && colr.byteLength >= 2) color.push(((colr[0] << 8) | colr[1]) >= 1 ? 'COLRv1' : 'COLRv0')
  else if (tableNames.has('COLR')) color.push('COLRv0')
  if (tableNames.has('SVG ')) color.push('SVG')
  if (tableNames.has('sbix')) color.push('sbix')
  if (tableNames.has('CBDT')) color.push('CBDT')

  const missing = ESSENTIAL.filter((tag) => !face.tables.has(tag))
  let damaged: string | null = null
  if (missing.length) {
    const outside = missing.filter((tag) => face.tableList.some((t) => t.tag === tag && t.outside))
    const absent = missing.filter((tag) => !outside.includes(tag))
    damaged = [
      outside.length ? `${outside.join(', ')} ${outside.length === 1 ? 'lies' : 'lie'} past the end of the file` : '',
      absent.length ? `the font has no ${absent.join(', ')} table` : ''
    ]
      .filter(Boolean)
      .join('; ')
  }

  return {
    family: label(NAME_IDS.typographicFamily) ?? label(NAME_IDS.family) ?? '',
    style: label(NAME_IDS.typographicSubfamily) ?? label(NAME_IDS.subfamily) ?? '',
    names: nameValues,
    outlines,
    sfntVersion: describeSfntVersion(face.sfntVersion),
    glyphCount,
    cmap,
    head,
    hhea,
    os2,
    post,
    axes,
    instances,
    features: [...features.values()],
    color,
    monospace: isMonospace(post, os2, hhea, table('hmtx'), cmap),
    variable: tableNames.has('fvar') && axes.length > 0,
    problems,
    damaged
  }
}
