# Vendored libraries

Copied as single ESM files because plugin frames load no npm packages. Rebuild with esbuild:

```sh
npm install esbuild@0.25.12 fflate@0.8.3 brotli@2.1.0
echo "export { unzlibSync } from 'fflate'" > fflate-entry.js
echo "export { decompress } from 'brotli/decompress.js'" > brotli-entry.js
npx esbuild fflate-entry.js --bundle --format=esm --platform=browser --outfile=vendor/fflate/fflate.mjs
npx esbuild brotli-entry.js --bundle --format=esm --platform=browser --outfile=vendor/brotli/brotli.mjs
```

| File                    | What                                                  | Licence                        |
| ----------------------- | ----------------------------------------------------- | ------------------------------ |
| `fflate/fflate.mjs`     | fflate 0.8.3, `unzlibSync` only (WOFF 1.0)            | MIT                            |
| `brotli/brotli.mjs`     | brotli.js 2.1.0 decompressor (WOFF 2.0), **modified** | MIT; Google decoder Apache-2.0 |
| `brotli/dictionary.mjs` | the Brotli static dictionary as a word list           | MIT (google/brotli)            |

## The Brotli dictionary

Brotli needs its 122,784-byte static dictionary (RFC 7932, Appendix A). brotli.js embeds it as a
base64 string; Font Viewer **removes that string** (and base64-js, which decoded it) and ships the
dictionary as `brotli/dictionary.mjs` instead: its 13,504 words listed by length, as UTF-8 text (13
words that are not valid UTF-8 on their own as byte values). `src/font/brotli-dictionary.ts`
imports it on the first WOFF 2.0 file, puts the bytes back together and passes them to
`setDictionary()`; `decompress()` refuses to run before that. Chromium has no Brotli
`DecompressionStream` (tested in Orca 1.4.258's Chromium 150 and in Chrome 157), so the dictionary
has to come with the plugin.

- Source: `c/common/dictionary.bin` of [google/brotli](https://github.com/google/brotli) v1.1.0
  (commit `ed738e842d2fbdf2d6459e39267a633c4a9b2f5d`), sha256
  `20e42eb1b511c21806d4d227d07e5dd06877d8ce7b3a817f378f313653f35c70` (the dictionary bytes; the
  unit test `src/font/brotli-dictionary.test.ts` checks the assembled word list against it).
- `brotli/dictionary.mjs` as generated: sha256
  `b46aaa9d261eb630d7cdc38904e1bbde8b127ea50caa8a8aaac2a7facd9d58e8`.
- Regenerate: `node tools/make-brotli-dictionary.mjs` (downloads the pinned file and checks its
  sha256), or `node tools/make-brotli-dictionary.mjs path/to/dictionary.bin`.

## Local patches

Search the files for `font-viewer patch` and reapply after a rebuild. Both decoders are patched so
that a malformed font cannot make them produce more data than the font's directory announces:

- **`brotli/brotli.mjs`**: the embedded dictionary and base64-js are removed; `setDictionary(bytes)`
  and `hasDictionary()` are exported, and `decompress` throws `the Brotli dictionary is not loaded`
  until the dictionary is set (see above). `decompress(buffer, outSize, maxSize)` stores `maxSize` as
  `output.limit`, and the meta-block loop of `BrotliDecompress` throws
  `Brotli data holds more than <limit> bytes` when `pos + meta_block_remaining_len` of a
  non-metadata block passes it — before the block is decoded or the buffer grows. `brotli.d.mts`
  declares the third parameter.
- **`fflate/fflate.mjs`**: in `inflt`, with a caller-supplied output buffer (`opts.out`, no
  resizing), the literal/length loop throws `inflated data is larger than the output buffer` once
  the output position passes the buffer's end. Without it fflate drops the extra bytes silently but
  keeps decoding, so a small stream can spin through gigabytes of output.
