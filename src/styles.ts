// The page's CSS, built on the `--orca-*` theme variables so it follows Orca's light and dark
// themes; Orca updates the variables in place and toggles `light`/`dark` on <html>.

export const css = String.raw`
:root {
  --bg: var(--orca-background, #ffffff);
  --fg: var(--orca-foreground, #0a0a0a);
  --card: var(--orca-card, #ffffff);
  --muted: var(--orca-muted, #f5f5f5);
  --muted-fg: var(--orca-muted-foreground, #737373);
  --accent: var(--orca-accent, #f5f5f5);
  --accent-fg: var(--orca-accent-foreground, #171717);
  --border: var(--orca-border, #e5e5e5);
  --input: var(--orca-input, #e5e5e5);
  --primary: var(--orca-primary, #171717);
  --primary-fg: var(--orca-primary-foreground, #fafafa);
  --ring: var(--orca-ring, #a3a3a3);
  --destructive: var(--orca-destructive, #dc2626);
  --popover: var(--orca-popover, #ffffff);
  --popover-fg: var(--orca-popover-foreground, #0a0a0a);
  --radius: var(--orca-radius, 6px);
  --warning-bg: #fef3c7;
  --warning-fg: #78350f;
  --ui-font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --mono-font: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --fv-font: var(--ui-font);
  --fv-variation: normal;
  --fv-features: normal;
  color-scheme: light;
}
:root.dark {
  --bg: var(--orca-background, #0a0a0a);
  --fg: var(--orca-foreground, #fafafa);
  --card: var(--orca-card, #0a0a0a);
  --muted: var(--orca-muted, #262626);
  --muted-fg: var(--orca-muted-foreground, #a3a3a3);
  --accent: var(--orca-accent, #262626);
  --accent-fg: var(--orca-accent-foreground, #fafafa);
  --border: var(--orca-border, #2e2e2e);
  --input: var(--orca-input, #2e2e2e);
  --primary: var(--orca-primary, #fafafa);
  --primary-fg: var(--orca-primary-foreground, #171717);
  --ring: var(--orca-ring, #737373);
  --destructive: var(--orca-destructive, #f87171);
  --popover: var(--orca-popover, #171717);
  --popover-fg: var(--orca-popover-foreground, #fafafa);
  --warning-bg: #422006;
  --warning-fg: #fde68a;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  background: var(--bg);
  color: var(--fg);
  font: 12px/1.45 var(--ui-font);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
button, select, input, textarea { font: inherit; color: inherit; }
.fv-icon { width: 1.25em; height: 1.25em; display: block; flex: none; }
.fv-hidden { display: none !important; }

/* Text drawn in the font being viewed. */
.fv-face {
  font-family: var(--fv-font);
  font-variation-settings: var(--fv-variation);
  font-feature-settings: var(--fv-features);
  font-weight: normal;
  font-style: normal;
  font-synthesis: none;
  font-kerning: normal;
}

.fv-app { display: flex; flex-direction: column; height: 100%; min-height: 0; container: app / inline-size; }

/* Header: name, badges, face picker; then the tabs. */
.fv-header {
  flex: none; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px;
  padding: 10px 16px 8px; background: var(--card);
}
.fv-title { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.fv-title h1 { margin: 0; font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fv-title span { color: var(--muted-fg); font-size: 13px; white-space: nowrap; }
.fv-badges { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.fv-badge {
  display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 999px;
  background: var(--muted); color: var(--muted-fg); font-size: 11px; white-space: nowrap;
}
.fv-badge.strong { background: var(--accent); color: var(--accent-fg); }
.fv-spacer { flex: 1; min-width: 0; }
.fv-face-picker { display: flex; align-items: center; gap: 6px; color: var(--muted-fg); }

.fv-tabs {
  flex: none; display: flex; gap: 2px; padding: 0 12px; border-bottom: 1px solid var(--border);
  background: var(--card);
}
.fv-tab {
  height: 32px; padding: 0 10px; border: 0; border-bottom: 2px solid transparent; background: none;
  color: var(--muted-fg); cursor: pointer; margin-bottom: -1px;
}
.fv-tab:hover { color: var(--fg); }
.fv-tab[aria-selected="true"] { color: var(--fg); border-bottom-color: var(--primary); font-weight: 500; }
.fv-tab:focus-visible, .fv-btn:focus-visible, .fv-select:focus-visible, .fv-input:focus-visible,
.fv-range:focus-visible, .fv-chip:focus-visible, .fv-cell:focus-visible, .fv-link:focus-visible {
  outline: 2px solid var(--ring); outline-offset: 1px;
}

.fv-notice {
  flex: none; margin: 10px 16px 0; padding: 8px 10px; border-radius: var(--radius);
  background: var(--warning-bg); color: var(--warning-fg); font-size: 12px;
}
.fv-body { flex: 1; min-height: 0; position: relative; }
.fv-panel { position: absolute; inset: 0; overflow: auto; }

/* Controls shared by the tabs. */
.fv-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 26px;
  min-width: 26px; padding: 0 8px; border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--bg); cursor: pointer; flex: none; white-space: nowrap;
}
.fv-btn:hover { background: var(--accent); color: var(--accent-fg); }
.fv-btn.ghost { border-color: transparent; background: transparent; }
.fv-btn.ghost:hover { background: var(--accent); }
.fv-select, .fv-input {
  height: 26px; padding: 0 6px; border: 1px solid var(--input); border-radius: var(--radius);
  background: var(--bg); min-width: 0;
}
.fv-select { cursor: pointer; }
.fv-input::placeholder { color: var(--muted-fg); }
.fv-label { color: var(--muted-fg); white-space: nowrap; }
.fv-value { font: 11px var(--mono-font); color: var(--muted-fg); min-width: 3.5em; text-align: right; }
.fv-range {
  --fill: 0%;
  -webkit-appearance: none; appearance: none; height: 16px; margin: 0; background: transparent;
  cursor: pointer; min-width: 60px; flex: 1;
}
.fv-range::-webkit-slider-runnable-track {
  height: 4px; border-radius: 2px;
  background: linear-gradient(to right, var(--primary) var(--fill), var(--muted) var(--fill));
}
.fv-range::-webkit-slider-thumb {
  -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4px; border-radius: 50%;
  background: var(--primary); border: 2px solid var(--card);
}
.fv-section-title {
  margin: 0 0 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--muted-fg);
}

/* Preview tab. */
.fv-preview { display: flex; min-height: 100%; }
.fv-preview-main { flex: 1; min-width: 0; padding: 0 16px 24px; }
.fv-toolbar {
  position: sticky; top: 0; z-index: 2; display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px;
  padding: 10px 0; background: var(--bg); border-bottom: 1px solid var(--border);
}
.fv-control { display: flex; align-items: center; gap: 8px; min-width: 180px; flex: 1; max-width: 340px; }
.fv-presets { display: flex; gap: 0; }
.fv-preset { min-width: 0; height: 24px; padding: 0 6px; font: 11px var(--mono-font); color: var(--muted-fg); }
.fv-sample {
  margin: 18px 0 8px; padding: 4px 0; outline: none; overflow-wrap: anywhere; white-space: pre-wrap;
  min-height: 1.2em; cursor: text; border-radius: 4px;
}
.fv-sample:hover { background: color-mix(in srgb, var(--muted) 45%, transparent); }
.fv-sample:focus { background: color-mix(in srgb, var(--muted) 60%, transparent); }
.fv-hint { color: var(--muted-fg); font-size: 11px; margin-bottom: 18px; }
.fv-block { margin-top: 22px; }
.fv-waterfall { display: flex; flex-direction: column; }
.fv-wf-row {
  display: grid; grid-template-columns: 34px 1fr; align-items: baseline; gap: 10px; padding: 3px 0;
  border-top: 1px solid var(--border);
}
.fv-wf-row:first-child { border-top: 0; }
.fv-wf-size { font: 11px var(--mono-font); color: var(--muted-fg); text-align: right; }
.fv-wf-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.25; }
.fv-alphabet { font-size: 30px; line-height: 1.35; overflow-wrap: anywhere; }

.fv-side {
  flex: none; width: 272px; border-left: 1px solid var(--border); padding: 12px 14px 24px;
  background: var(--card); display: flex; flex-direction: column; gap: 20px;
}
@container app (max-width: 720px) {
  .fv-preview { flex-direction: column; }
  .fv-side { width: auto; border-left: 0; border-top: 1px solid var(--border); }
}
.fv-axis { display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; }
.fv-axis-head { display: flex; align-items: baseline; gap: 6px; }
.fv-axis-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fv-axis-tag { font: 10px var(--mono-font); color: var(--muted-fg); }
.fv-axis-row { display: flex; align-items: center; gap: 8px; }
.fv-chips { display: flex; flex-direction: column; gap: 2px; }
.fv-chip {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 4px 6px; border: 0;
  border-radius: var(--radius); background: transparent; cursor: pointer; text-align: left;
}
.fv-chip:hover { background: var(--accent); }
.fv-chip-box {
  width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--input); flex: none;
  display: flex; align-items: center; justify-content: center; color: var(--primary-fg);
}
.fv-chip[aria-pressed="true"] .fv-chip-box { background: var(--primary); border-color: var(--primary); }
.fv-chip-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fv-chip-tag { font: 10px var(--mono-font); color: var(--muted-fg); }

/* Characters tab. */
.fv-chars { display: flex; flex-direction: column; height: 100%; }
.fv-chars .fv-toolbar { position: static; padding: 10px 16px; flex-wrap: nowrap; }
.fv-search { flex: 1; min-width: 120px; max-width: 360px; }
.fv-chars .fv-select { max-width: 260px; }
.fv-count { overflow: hidden; text-overflow: ellipsis; }
.fv-chars-body { flex: 1; min-height: 0; display: flex; }
.fv-grid-scroll { flex: 1; min-width: 0; overflow: auto; position: relative; }
.fv-grid-scroll:focus { outline: none; }
.fv-grid-scroll:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
.fv-grid-sizer { position: relative; width: 100%; }
.fv-grid-header {
  position: absolute; left: 0; right: 0; height: 30px; padding: 10px 16px 0; font-size: 11px;
  font-weight: 600; color: var(--muted-fg); display: flex; gap: 8px; align-items: baseline;
}
.fv-grid-header small { font-weight: 400; }
.fv-grid-row { position: absolute; left: 16px; right: 16px; display: grid; }
/* Each cell draws its left and top lines inside and its right and bottom lines outside, so
   neighbours share one 1px line and the grid gets a full outer frame. */
.fv-cell {
  position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 72px; border: 0; background: transparent; cursor: pointer; padding: 0; overflow: hidden; min-width: 0;
  box-shadow: inset 1px 1px 0 var(--border), 1px 0 0 var(--border), 0 1px 0 var(--border), 1px 1px 0 var(--border);
}
.fv-cell:hover { background: var(--accent); }
.fv-cell[aria-selected="true"] { background: var(--primary); color: var(--primary-fg); }
.fv-cell[aria-selected="true"] .fv-cell-code { color: var(--primary-fg); opacity: 0.8; }
.fv-cell-glyph { font-size: 28px; line-height: 44px; height: 44px; white-space: pre; }
.fv-cell-glyph.invisible { font: 10px var(--mono-font); color: var(--muted-fg); line-height: 44px; }
.fv-cell-glyph.blank { width: 16px; height: 24px; margin: 10px 0; border: 1px dashed var(--muted-fg); border-radius: 2px; opacity: 0.6; }
.fv-cell-code { font: 9.5px var(--mono-font); color: var(--muted-fg); }
.fv-empty { padding: 32px 16px; color: var(--muted-fg); text-align: center; }

.fv-detail {
  flex: none; width: 260px; border-left: 1px solid var(--border); background: var(--card); overflow: auto;
  padding: 12px 14px 20px;
}
@container app (max-width: 620px) { .fv-detail { width: 200px; } }
.fv-detail-head { display: flex; align-items: center; }
.fv-detail-glyph {
  position: relative; height: 150px; display: flex; align-items: center; justify-content: center;
  font-size: 112px; line-height: 1; white-space: pre; border: 1px solid var(--border); border-radius: var(--radius);
  margin: 4px 0 12px; overflow: hidden;
}
.fv-baseline { position: absolute; left: 0; right: 0; border-top: 1px dashed var(--border); pointer-events: none; }
.fv-detail-glyph.invisible { font: 14px var(--mono-font); color: var(--muted-fg); }
.fv-detail-name { font: 600 13px var(--mono-font); }
.fv-detail-block { color: var(--muted-fg); margin-bottom: 8px; }
.fv-copy-row {
  display: grid; grid-template-columns: 74px 1fr auto; align-items: center; gap: 6px; padding: 3px 0;
  border-top: 1px solid var(--border);
}
.fv-copy-row code { font: 11.5px var(--mono-font); overflow-wrap: anywhere; user-select: text; }

/* Info tab. */
.fv-info { padding: 14px 16px 28px; max-width: 920px; }
.fv-info section { margin-bottom: 22px; }
.fv-kv { display: grid; grid-template-columns: minmax(120px, 190px) 1fr; gap: 0; margin: 0; }
.fv-kv dt, .fv-kv dd { padding: 5px 0; border-top: 1px solid var(--border); margin: 0; }
.fv-kv dt { color: var(--muted-fg); padding-right: 12px; }
.fv-kv dd { overflow-wrap: anywhere; white-space: pre-wrap; user-select: text; }
.fv-kv dd.mono { font-family: var(--mono-font); font-size: 11.5px; }
.fv-link { color: inherit; text-decoration: underline; text-decoration-color: var(--muted-fg); cursor: pointer; }
.fv-link:hover { text-decoration-color: currentColor; }
.fv-link-icon { display: inline-block; vertical-align: -2px; margin-left: 3px; color: var(--muted-fg); }
.fv-link-icon .fv-icon { width: 12px; height: 12px; }
.fv-table { border-collapse: collapse; font-size: 12px; min-width: 320px; }
.fv-table th, .fv-table td { padding: 4px 16px 4px 0; text-align: left; border-top: 1px solid var(--border); }
.fv-table th { color: var(--muted-fg); font-weight: 500; }
.fv-table td.num { text-align: right; font-family: var(--mono-font); font-size: 11.5px; }
.fv-table td.tag { font-family: var(--mono-font); white-space: pre; }
.fv-problems { margin: 0; padding-left: 18px; color: var(--destructive); }

/* Whole-page message: loading and errors. */
.fv-message {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 8px; padding: 24px; text-align: center; background: var(--bg);
}
.fv-message h2 { margin: 0; font-size: 14px; font-weight: 600; }
.fv-message p { margin: 0; max-width: 520px; color: var(--muted-fg); }
.fv-message .fv-icon { width: 36px; height: 36px; color: var(--muted-fg); }
.fv-message.error .fv-icon { color: var(--destructive); }

.fv-toast {
  position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); padding: 6px 12px;
  border-radius: var(--radius); background: var(--popover); color: var(--popover-fg);
  border: 1px solid var(--border); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  opacity: 0; pointer-events: none; transition: opacity 0.3s ease; white-space: nowrap; z-index: 10;
}
.fv-toast.show { opacity: 1; transition: none; }
`

/** Adds the stylesheet once. */
export function installStyles(doc: Document = document): void {
  if (doc.getElementById('fv-styles')) {
    return
  }
  const style = doc.createElement('style')
  style.id = 'fv-styles'
  style.textContent = css
  doc.head.append(style)
}
