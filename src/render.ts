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

/**
 * The axis values a person set (with a slider or a named instance), kept for a new face where the
 * axis exists and the value fits. Axes nobody touched stay out, so Chromium keeps its own choices
 * for them, such as automatic optical size.
 */
export function axesFor(info: FaceInfo, previous: ReadonlyMap<string, number>): Map<string, number> {
  const axes = new Map<string, number>()
  for (const axis of info.axes) {
    const value = previous.get(axis.tag)
    if (value !== undefined && value >= axis.min && value <= axis.max) axes.set(axis.tag, value)
  }
  return axes
}

type AxisRange = { min: number; default: number; max: number }

/** The rounding a slider applies to an axis: whole units for wide ranges, finer for narrow ones. */
export function axisStep(axis: AxisRange): number {
  const span = axis.max - axis.min
  return span > 100 ? 1 : span > 10 ? 0.1 : 0.01
}

/**
 * A slider position (the input uses step="any") as an axis value: the minimum, maximum and default
 * are reachable exactly even when they are not multiples of the step; other values are rounded.
 */
export function snapAxisValue(raw: number, axis: AxisRange): number {
  const step = axisStep(axis)
  for (const anchor of [axis.min, axis.max, axis.default]) {
    if (Math.abs(raw - anchor) <= step / 2) return anchor
  }
  const rounded = Math.round(raw / step) * step
  return Math.min(axis.max, Math.max(axis.min, Number(rounded.toFixed(2))))
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
  const axisTags = new Set(info?.axes.map((a) => a.tag) ?? [])
  const moved = new Map([...axes].filter(([tag]) => axisTags.has(tag)))
  return {
    font: family ? `"${family}", var(--ui-font)` : 'var(--ui-font)',
    variation: variationSettings(moved),
    features: featureSettings(used)
  }
}
