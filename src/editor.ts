// The custom editor: Orca opens a font file in a main editor tab here — from the file tree, a file
// link in a chat, or `orca file open` — and sends its bytes. Orca keeps files over 50 MiB out of
// custom editors and shows its own notice instead. The viewer never edits, so Orca never saves the
// tab; an outside write reloads the font and keeps the tab, sizes, text and selection.

import { languageOf, stringsFor } from './i18n'
import { installStyles } from './styles'
import { App } from './ui/app'

const locale = globalThis.orca?.locale
const strings = stringsFor(locale)
installStyles()
document.documentElement.lang = languageOf(locale)
const app = new App(strings, languageOf(locale))
document.body.append(app.root)
app.showMessage(strings.loading)

const api = globalThis.orca?.document
if (!api) {
  app.showMessage(strings.errorTitle, 'This page runs as an Orca custom editor.', 'error')
} else {
  api.onDidChange((doc) => {
    if (doc.content.kind !== 'bytes') {
      app.showMessage(strings.errorTitle, strings.errorText, 'error')
      return
    }
    app.load(new Uint8Array(doc.content.bytes))
  })
}
