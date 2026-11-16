// The Brotli dictionary rebuilt from its word list, checked against RFC 7932 and against Google's
// own encoder and decoder (Node's zlib), on text and on a WOFF 2.0 font.

import { constants, brotliCompressSync, brotliDecompressSync } from 'node:zlib'
import { assert, test } from 'orca/testing'
import { decompress, setDictionary } from '../../vendor/brotli/brotli.mjs'
import { WORDS_BY_LENGTH } from '../../vendor/brotli/dictionary.mjs'
import { DICTIONARY_SHA256, DICTIONARY_SIZE, assembleDictionary, loadBrotliDictionary } from './brotli-dictionary'
import { openFont } from './container'
import { buildFont, woff2 } from './test-fonts'

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')

/** Brotli at the settings of Google's woff2_compress (quality 11, font mode, 4 MiB window). */
const reference = (data: Uint8Array, mode = constants.BROTLI_MODE_FONT) =>
  new Uint8Array(
    brotliCompressSync(data, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_MODE]: mode, [constants.BROTLI_PARAM_LGWIN]: 22 }
    })
  )

/** Decodes `stream` with every dictionary byte inverted, then puts the real dictionary back. */
async function withScrambledDictionary(stream: Uint8Array, size: number): Promise<Uint8Array | null> {
  const real = assembleDictionary(WORDS_BY_LENGTH)
  setDictionary(real.map((b) => b ^ 0xff))
  try {
    return decompress(stream, size, size)
  } catch {
    return null
  } finally {
    setDictionary(real)
  }
}

test('the word list assembles to the 122,784 bytes of RFC 7932', async () => {
  const bytes = assembleDictionary(WORDS_BY_LENGTH)
  assert.equal(bytes.length, DICTIONARY_SIZE)
  assert.equal(hex(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))), DICTIONARY_SHA256)
  assert.throws(() => assembleDictionary({ ...WORDS_BY_LENGTH, 7: WORDS_BY_LENGTH[7].slice(1) }), /lists 2047 words of 7 bytes/)
  assert.throws(() => assembleDictionary({ ...WORDS_BY_LENGTH, 4: ['abc', ...WORDS_BY_LENGTH[4].slice(1)] }), /4 bytes .* has 3/)
})

test('decodes what the reference encoder writes with dictionary words, as the reference decoder does', async () => {
  await loadBrotliDictionary()
  const text = new TextEncoder().encode(
    'Copyright 2026 the Example Project Authors. This Font Software is licensed under the SIL Open Font ' +
      'License, Version 1.1. <a href="https://example.com/license">Read the License</a> — Лицензия, 許可証.'
  )
  const stream = reference(text, constants.BROTLI_MODE_TEXT)
  assert.deepEqual([...decompress(stream, text.length, text.length)], [...text])
  assert.deepEqual([...new Uint8Array(brotliDecompressSync(stream))], [...text])
  // The stream refers to the dictionary: with other words in it, it decodes to something else.
  const scrambled = await withScrambledDictionary(stream, text.length)
  assert.ok(scrambled === null || scrambled.some((b, i) => b !== text[i]))
})

test('a WOFF 2.0 font from the reference encoder decodes to the tables of the plain font', async () => {
  await loadBrotliDictionary()
  const built = buildFont({ variable: true })
  let tables: Uint8Array = new Uint8Array(0)
  let stream: Uint8Array = new Uint8Array(0)
  const font = openFont(
    woff2(built, (data) => {
      tables = data
      return (stream = reference(data))
    })
  )
  assert.equal(font.flavor, 'woff2')
  // The encoder used dictionary words here too (names, URLs).
  const scrambled = await withScrambledDictionary(stream, tables.length)
  assert.ok(scrambled === null || scrambled.some((b, i) => b !== tables[i]))
  const face = font.faces[0]
  for (const [tag, bytes] of Object.entries(built.tables)) {
    if (tag === 'glyf' || tag === 'loca') {
      assert.equal(face.tables.has(tag), false, tag) // transformed: not rebuilt
    } else {
      assert.deepEqual([...face.tables.get(tag)!], [...bytes], tag)
    }
  }
})
