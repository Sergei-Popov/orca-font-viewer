// 24×24 stroke icons, drawn for this plugin in the style of Orca's own line icons.

const paths = {
  font: '<path d="M4 19l5-14h1l5 14"/><path d="M6 14h7"/><path d="M15.5 12.5a3 3 0 0 1 4.5 2.6V19"/><path d="M20 16.5c-3.5-.6-5 .3-5 1.4 0 1.6 3.2 1.8 5-.2"/>',
  error: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.2v.1"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  external: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5L11 13"/><path d="M17 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1H10"/>'
} as const

export type IconName = keyof typeof paths

/** An inline SVG for `name`, sized by the surrounding font (1.25em by default). */
export function icon(name: IconName): string {
  return (
    `<svg class="fv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`
  )
}
