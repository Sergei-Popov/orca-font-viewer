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
