# Font Viewer for Orca

Fonts in [Orca](https://orca.dev)'s editor tabs — opened from the file tree, a file link in an
agent chat, or `orca file open`, just like images. Without the plugin Orca shows
"Binary file — cannot display" for them.

| Files                                                  | What opens                                   |
| ------------------------------------------------------ | -------------------------------------------- |
| `.ttf`, `.otf`, `.woff`, `.woff2`, `.ttc`, `.otc`      | **Font Viewer**, the default view for fonts  |

Three tabs:

- **Preview** — sample text you can edit, at any size from 8 to 200 px (with presets) and line
  height; a waterfall of 12–96 px; the Latin, Cyrillic, digit and punctuation lines the font
  covers. The sample is a Russian pangram when Orca's UI is Russian and the font has Cyrillic,
  else the font's own sample text or an English pangram.
  - **Variable fonts:** a slider for every axis and a list of the named instances.
  - **OpenType features:** switches for ligatures, small caps, figures, fractions, stylistic sets
    and character variants, with the names the font gives its stylistic sets.
- **Characters** — every character the font maps, grouped by Unicode block. Search by the
  character itself, a code point (`U+0416`, `0x416`), a range (`U+0400-04FF`) or a block name;
  click a character (or move with the arrow keys) to see it large on the font's baseline with
  its code point as `U+0416`, decimal, HTML `&#x416;`, CSS `\416`, JavaScript `\u0416` and UTF-8
  bytes, each with a copy button. Fonts with tens of thousands of characters stay fast: only the
  rows on screen are drawn.
- **Info** — names (family, style, version, designer, vendor, copyright, licence; links open in
  the browser after Orca asks), weight and width classes, italic angle, units per em,
  ascender, descender, x-height, cap height, embedding rights (OS/2 `fsType`), format and
  outlines (TrueType, CFF, CFF2, bitmap), colour formats (COLR, SVG, sbix, CBDT), file size,
  glyph and character counts, creation and modification dates, and the table directory.

Collections (`.ttc`, `.otc`) get a face picker; each face is drawn on its own. Badges in the
header show the format, outlines, variable, colour, monospace, glyph and character counts. A file
that is not a font, or is damaged, gets a message saying so; if Chromium refuses to draw a font
that the viewer can still read, the Info and Characters tabs keep working and a notice says why.

It is read-only and offline: no capabilities, no network, the file is never modified. The UI
follows Orca's language (English or Russian) and its light and dark themes.

**Size limit.** Orca sends at most 64 MB to a plugin editor and shows its own notice for larger
files.

## Install

From the catalog: Orca → Settings → Plugins → ⋯ → **Catalog sources…** → add
`https://github.com/Sergei-Popov/orca-plugin.git`, then install **Font Viewer**.

From source:

```sh
git clone https://github.com/Sergei-Popov/orca-font-viewer.git
orca plugin dev load ./orca-font-viewer   # prints the access it needs and an --approve fingerprint
```

## Develop

No build step: Orca transpiles the TypeScript in `src/` on load.

```sh
orca plugin dev watch . --check   # load, reload on save, stream logs
orca plugin test .                # unit tests (src/**/*.test.ts)
npx -p typescript tsc -p .        # type check (after `orca plugin types .`)
orca plugin validate .
orca plugin shot local.font-viewer --editor "$PWD/path/to/font.ttf"   # PNG of the editor
```

- `src/editor.ts` — the custom editor entry: bytes document → `App`.
- `src/ui/` — the view: `app.ts` (header, tabs, FontFace loading), `preview.ts`, `characters.ts`,
  `info.ts`, `dom.ts`; `src/styles.ts`, `src/icons.ts`, `src/i18n.ts`.
- `src/font/` — the font parser, DOM-free: `container.ts` (sfnt, collections, WOFF, WOFF2, cutting a
  face out of a collection), `tables.ts` (name, head, hhea, maxp, post, OS/2, cmap, fvar,
  GSUB/GPOS feature lists), `info.ts`, `features.ts`, `chars.ts`, `blocks-data.ts` (Unicode 16.0
  blocks). Tested in `src/font/font.test.ts` against fonts built by `tools/make-fixtures.py`.
- `src/describe.ts`, `src/grid.ts`, `src/render.ts` — pure helpers for the view, tested in
  `src/view-logic.test.ts` and `src/render.test.ts`.
- `tools/` — generators for the test fonts, the block table and the icons (`make-icons.py` draws
  "Aa" from STIXGeneral, OFL; `rasterize-icons.sh` makes the PNGs).
- `vendor/` — [fflate](https://github.com/101arrowz/fflate) 0.8.3 (MIT) for WOFF 1.0 and
  [brotli.js](https://github.com/devongovett/brotli.js) 2.1.0 (MIT, Google's decoder Apache-2.0)
  for WOFF 2.0; see `vendor/README.md`.

Branches follow git-flow: `feature/*` from `develop`, releases through `release/x.y.z` into
`main`, tagged `vX.Y.Z`. Only the maintainers push and open pull requests.

## License

MIT © Sergei Popov, except `vendor/fflate/` — MIT (`vendor/fflate/LICENSE`) and
`vendor/brotli/` — MIT and Apache-2.0 (`vendor/brotli/LICENSE`). The icons draw glyphs of
STIXGeneral (SIL Open Font License 1.1).
