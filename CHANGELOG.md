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
- Variable fonts: a slider per axis and the named instances; OpenType feature switches with
  readable names (stylistic sets use the names the font gives them).
- Collections: a face picker; each face is drawn on its own.
- Characters tab: every mapped character grouped by Unicode block, drawn only where it is on
  screen, a search by character, `U+0416`, a `U+0400-04FF` range or a block name, a block filter,
  arrow-key navigation, and a detail panel with the character large on its baseline and its code
  point as U+, decimal, HTML, CSS, JavaScript and UTF-8, each with a copy button.
- Info tab: names (links open in the browser through Orca), weight, width, metrics, licence,
  embedding rights, format, outlines, file size, glyph and character counts, dates, colour
  formats, problems found while reading, and the table directory.
- Font parser for sfnt, collections, WOFF 1.0 (fflate) and WOFF 2.0 (brotli.js), unit-tested on
  fonts built by `tools/make-fixtures.py`.
- English and Russian UI, Orca's light and dark themes, "Aa" icons.
