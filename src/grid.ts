// Layout of the Characters grid: code points grouped by Unicode block, cut into rows of cells,
// with each row's top offset so the view draws only the rows on screen (CJK fonts have 40 000+
// characters, Last Resort over a million).

import { BLOCK_STARTS } from './font/blocks-data'
import { blockOf } from './font/chars'

export type BlockGroup = { block: string; codes: number[] }

/** Splits sorted code points into runs of the same block, keeping those `keep` accepts. */
export function groupByBlock(codes: Uint32Array, keep: (code: number, block: string) => boolean = () => true): BlockGroup[] {
  const groups: BlockGroup[] = []
  let current: BlockGroup | null = null
  let blockEnd = -1
  let block = ''
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]
    if (code > blockEnd) {
      block = blockOf(code)
      blockEnd = nextBlockStart(code) - 1
    }
    if (!keep(code, block)) continue
    if (!current || current.block !== block) {
      current = { block, codes: [] }
      groups.push(current)
    }
    current.codes.push(code)
  }
  return groups
}

const STARTS = BLOCK_STARTS.map(([first]) => first)

/** The first code point after `code`'s block (or gap); 0x110000 at the end. */
function nextBlockStart(code: number): number {
  let lo = 0
  let hi = STARTS.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (STARTS[mid] <= code) lo = mid + 1
    else hi = mid
  }
  return lo < STARTS.length ? STARTS[lo] : 0x110000
}

export type GridRow =
  | { kind: 'header'; top: number; group: number }
  | { kind: 'cells'; top: number; group: number; from: number; to: number }

export type GridLayout = { rows: GridRow[]; height: number; total: number }

export function layoutGrid(groups: readonly BlockGroup[], columns: number, headerHeight: number, rowHeight: number): GridLayout {
  const rows: GridRow[] = []
  let top = 0
  let total = 0
  const perRow = Math.max(1, columns)
  groups.forEach((group, index) => {
    rows.push({ kind: 'header', top, group: index })
    top += headerHeight
    for (let from = 0; from < group.codes.length; from += perRow) {
      rows.push({ kind: 'cells', top, group: index, from, to: Math.min(group.codes.length, from + perRow) })
      top += rowHeight
    }
    total += group.codes.length
  })
  return { rows, height: top, total }
}

/** Indexes [first, last) of the rows that intersect the viewport, plus `overscan` px around it. */
export function visibleRange(layout: GridLayout, scrollTop: number, viewport: number, overscan: number): [number, number] {
  const rows = layout.rows
  const top = Math.max(0, scrollTop - overscan)
  const bottom = scrollTop + viewport + overscan
  let lo = 0
  let hi = rows.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (rows[mid].top < top) lo = mid + 1
    else hi = mid
  }
  const first = Math.max(0, lo - 1)
  let last = first
  while (last < rows.length && rows[last].top < bottom) last++
  return [first, last]
}

/** The row holding the `index`-th code point of group `group`. */
export function rowOf(layout: GridLayout, group: number, index: number): number {
  return layout.rows.findIndex((row) => row.kind === 'cells' && row.group === group && index >= row.from && index < row.to)
}

export type GridPosition = { group: number; index: number }
export type GridMove = 'left' | 'right' | 'up' | 'down'

/**
 * The cell an arrow key leads to: left and right step through the characters in order, across
 * blocks; up and down go to the row above or below and keep the column (the last cell of a
 * shorter row), skipping block headers. Null at the edges.
 */
export function moveInGrid(layout: GridLayout, groups: readonly BlockGroup[], from: GridPosition, move: GridMove): GridPosition | null {
  if (move === 'left' || move === 'right') {
    const step = move === 'right' ? 1 : -1
    let { group, index } = from
    index += step
    while (group >= 0 && group < groups.length && (index < 0 || index >= groups[group].codes.length)) {
      group += step
      if (group < 0 || group >= groups.length) return null
      index = step > 0 ? 0 : groups[group].codes.length - 1
    }
    return group >= 0 && group < groups.length ? { group, index } : null
  }
  const current = rowOf(layout, from.group, from.index)
  if (current < 0) return null
  const row = layout.rows[current]
  if (row.kind !== 'cells') return null
  const column = from.index - row.from
  const step = move === 'down' ? 1 : -1
  for (let i = current + step; i >= 0 && i < layout.rows.length; i += step) {
    const next = layout.rows[i]
    if (next.kind !== 'cells') continue
    return { group: next.group, index: Math.min(next.from + column, next.to - 1) }
  }
  return null
}
