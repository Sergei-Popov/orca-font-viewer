# Changelog

All notable changes to this plugin are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). `scripts/release-plugin.sh` in the hub turns
`[Unreleased]` into the released version.

## [Unreleased]

### Added

- **Font Viewer** custom editor for `.ttf`, `.otf`, `.woff`, `.woff2`, `.ttc` and `.otc`: the
  default view for these files, read-only and offline.
- Preview tab: editable sample text (a Russian pangram for a Russian UI when the font has
  Cyrillic, else the font's own sample or an English pangram), size from 8 to 200 px with
  presets, line height, a waterfall of nine sizes and the alphabet lines the font covers.
- Variable fonts: a slider per axis that reaches the axis's exact minimum, maximum and default,
  and the named instances; only the axes you move or an instance sets are applied, so the browser
  keeps its automatic optical size. OpenType feature switches with readable names (stylistic sets
  use the names the font gives them).
- Collections: a face picker; only the chosen face is read in full and drawn on its own, and a
  face that cannot be read is marked in the picker while the others still open.
- Characters tab: every mapped character grouped by Unicode block, drawn only where it is on
  screen, a search by character, `U+0416`, a `U+0400-04FF` range or the words of a block name
  (`latin-1`, `box draw`, `IPA ext`), a block filter, arrow-key navigation that keeps its column
  across blocks, and a detail panel with the character large on its baseline and its code
  point as U+, decimal, HTML, CSS, JavaScript and UTF-8, each with a copy button.
- Info tab: names (links open in the browser through Orca), weight, width, metrics, licence,
  embedding rights, format, outlines, file size, glyph and character counts, dates, colour
  formats, problems found while reading (tables cut off by the end of the file, a damaged
  character map skipped for the next one), and the table directory. A font whose `head`, `name`
  or `cmap` is missing or cut off gets a "damaged" message instead of an empty view.
- Font parser for sfnt, collections, WOFF 1.0 (fflate) and WOFF 2.0 (brotli.js), unit-tested on
  fonts built by `tools/make-fixtures.py` and on damaged and hostile fonts built in the tests.
  WOFF and WOFF 2.0 data never unpacks past the sizes the file's directory gives (256 MiB at
  most; both decoders are patched to stop there), overlapping character map ranges and oversized
  `fvar` and `name` tables are bounded, Mac Roman character maps are decoded in every format, and
  a face cut out of a collection gets valid checksums.
- English and Russian UI, Orca's light and dark themes, "Aa" icons.
