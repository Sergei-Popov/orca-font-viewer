// Which bytes Chromium gets to draw a face, and the CSS that styles it. DOM-free, so it is tested.

import { type FontContainer, faceToSfnt } from './font/container'
import { featureSettings, variationSettings } from './font/features'
import type { FaceInfo } from './font/info'

export type RenderSource = { kind: 'bytes'; bytes: Uint8Array } | { kind: 'woff2-collection' }

/**
 * A single font file is drawn as it is (Chromium reads WOFF and WOFF2 itself). A face of a
 * collection is cut out into a standalone sfnt, because a FontFace always takes a collection's
 * first face. WOFF2 collections are the exception: their TrueType outlines are stored
 * transformed, which this viewer does not rebuild, so only the first face (the whole file) draws.
 */
export function renderSource(container: FontContainer, index: number, original: Uint8Array): RenderSource {
  if (!container.collection) return { kind: 'bytes', bytes: original }
  const face = container.faces[index]
  if (container.flavor === 'sfnt') return { kind: 'bytes', bytes: faceToSfnt(face) }
  if (!face.tableList.some((table) => table.transformed)) return { kind: 'bytes', bytes: faceToSfnt(face) }
  return index === 0 ? { kind: 'bytes', bytes: original } : { kind: 'woff2-collection' }
}

/** The MIME type for a data: URL fallback. */
export function fontMime(bytes: Uint8Array): string {
  const tag = String.fromCharCode(...bytes.subarray(0, 4))
  if (tag === 'wOFF') return 'font/woff'
  if (tag === 'wOF2') return 'font/woff2'
  if (tag === 'OTTO') return 'font/otf'
  if (tag === 'ttcf') return 'font/collection'
  return 'font/ttf'
}

/** Axis values for a face: kept from the previous face where the axis exists and fits, else its default. */
export function axesFor(info: FaceInfo, previous: ReadonlyMap<string, number>): Map<string, number> {
  const axes = new Map<string, number>()
  for (const axis of info.axes) {
    const value = previous.get(axis.tag)
    axes.set(axis.tag, value !== undefined && value >= axis.min && value <= axis.max ? value : axis.default)
  }
  return axes
}

/** The CSS variable values for the viewed face. */
export function faceStyle(
  info: FaceInfo | null,
  family: string | null,
  axes: ReadonlyMap<string, number>,
  features: ReadonlyMap<string, boolean>
): { font: string; variation: string; features: string } {
  const present = new Set(info?.features.map((f) => f.tag) ?? [])
  const used = new Map([...features].filter(([tag]) => present.has(tag)))
  return {
    font: family ? `"${family}", var(--ui-font)` : 'var(--ui-font)',
    variation: info?.axes.length ? variationSettings(axes) : 'normal',
    features: featureSettings(used)
  }
}
