// The part of Node's zlib that src/font/brotli-dictionary.test.ts uses: Google's Brotli encoder and
// decoder as the reference. Only tests import it; the plugin's own typings leave Node out.
declare module 'node:zlib' {
  export const constants: {
    BROTLI_PARAM_QUALITY: number
    BROTLI_PARAM_MODE: number
    BROTLI_PARAM_LGWIN: number
    BROTLI_MODE_TEXT: number
    BROTLI_MODE_FONT: number
  }
  export function brotliCompressSync(data: Uint8Array, options?: { params?: Record<number, number> }): Uint8Array
  export function brotliDecompressSync(data: Uint8Array): Uint8Array
}
