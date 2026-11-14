# Vendored libraries

Copied as single ESM files because plugin frames load no npm packages. Rebuild with esbuild:

```sh
npm install esbuild@0.25.12 fflate@0.8.3 brotli@2.1.0 base64-js@1.5.1
echo "export { unzlibSync } from 'fflate'" > fflate-entry.js
echo "export { decompress } from 'brotli/decompress.js'" > brotli-entry.js
npx esbuild fflate-entry.js --bundle --format=esm --platform=browser --outfile=vendor/fflate/fflate.mjs
npx esbuild brotli-entry.js --bundle --format=esm --platform=browser --outfile=vendor/brotli/brotli.mjs
```

| File                 | What                                         | Licence                         |
| -------------------- | -------------------------------------------- | ------------------------------- |
| `fflate/fflate.mjs`  | fflate 0.8.3, `unzlibSync` only (WOFF 1.0)   | MIT                             |
| `brotli/brotli.mjs`  | brotli.js 2.1.0 decompressor (WOFF 2.0)      | MIT; Google decoder Apache-2.0  |

## Local patches

Both decoders are patched so that a hostile font cannot make them produce more data than the
font's directory announces. Search the files for `font-viewer patch` and reapply after a rebuild:

- **`brotli/brotli.mjs`**: `decompress(buffer, outSize, maxSize)` stores `maxSize` as
  `output.limit`, and the meta-block loop of `BrotliDecompress` throws
  `Brotli data holds more than <limit> bytes` when `pos + meta_block_remaining_len` of a
  non-metadata block passes it — before the block is decoded or the buffer grows. `brotli.d.mts`
  declares the third parameter.
- **`fflate/fflate.mjs`**: in `inflt`, with a caller-supplied output buffer (`opts.out`, no
  resizing), the literal/length loop throws `inflated data is larger than the output buffer` once
  the output position passes the buffer's end. Without it fflate drops the extra bytes silently but
  keeps decoding, so a small stream can spin through gigabytes of output.
