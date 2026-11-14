// Everything the viewer shows about one face, read from its tables. Missing or damaged tables
// leave their fields empty instead of failing the whole font.

import { FontError } from './bytes'
import { type Face, type FontContainer, SFNT_TRUETYPE } from './container'
import {
  type CharMap,
  type FeatureEntry,
  type FvarTable,
  type HeadTable,
  type HheaTable,
  type NameRecord,
  type Os2Table,
  type PostTable,
  parseCmap,
  parseFeatureList,
  parseFvar,
  parseHead,
  parseHhea,
  parseMaxp,
  parseName,
  parseOs2,
  parsePost,
  pickName
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
}

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

export function describeFace(face: Face, uiLanguage: string): FaceInfo {
  const problems: string[] = []
  const table = (tag: string) => face.tables.get(tag)
  const tableNames = new Set(face.tableList.map((t) => t.tag))

  const nameBytes = table('name')
  const records: NameRecord[] = nameBytes ? attempt(problems, 'name', () => parseName(nameBytes)) ?? [] : []
  const name = (id: number) => pickName(records, id, uiLanguage)
  const names: Partial<Record<NameKey, string>> = {}
  for (const [key, id] of Object.entries(NAME_IDS) as [NameKey, number][]) {
    const value = name(id)
    if (value) names[key] = value
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
  const cmap =
    (cmapBytes ? attempt(problems, 'cmap', () => parseCmap(cmapBytes)) : null) ??
    { codes: new Uint32Array(0), glyphs: new Uint32Array(0), source: '', symbol: false }

  const fvarBytes = table('fvar')
  const fvar: FvarTable | null = fvarBytes ? attempt(problems, 'fvar', () => parseFvar(fvarBytes)) : null
  const axes: AxisInfo[] = (fvar?.axes ?? []).map((axis) => ({
    tag: axis.tag,
    name: name(axis.nameId) ?? axis.tag,
    min: axis.min,
    default: axis.default,
    max: axis.max,
    hidden: axis.hidden
  }))
  const instances: InstanceInfo[] = (fvar?.instances ?? []).map((instance, i) => ({
    name: name(instance.nameId) ?? `#${i + 1}`,
    coordinates: instance.coordinates
  }))

  const features = new Map<string, FeatureInfo>()
  for (const tag of ['GSUB', 'GPOS'] as const) {
    const bytes = table(tag)
    if (!bytes) continue
    const list: FeatureEntry[] = attempt(problems, tag, () => parseFeatureList(bytes)) ?? []
    for (const entry of list) {
      const existing = features.get(entry.tag)
      const uiName = entry.uiNameId !== null ? name(entry.uiNameId) : null
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

  return {
    family: names.typographicFamily ?? names.family ?? '',
    style: names.typographicSubfamily ?? names.subfamily ?? '',
    names,
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
    monospace: post?.isFixedPitch ?? false,
    variable: tableNames.has('fvar') && axes.length > 0,
    problems
  }
}

/** A short label for a face of a collection: "Menlo Bold". */
export function faceLabel(info: FaceInfo, index: number): string {
  const label = info.names.fullName ?? [info.family, info.style].filter(Boolean).join(' ')
  return label || `#${index + 1}`
}

/** Opens every face; one damaged face does not hide the others. */
export function describeContainer(container: FontContainer, uiLanguage: string): FaceInfo[] {
  return container.faces.map((face) => describeFace(face, uiLanguage))
}
