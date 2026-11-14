/** Inflates zlib-wrapped DEFLATE data. */
export function unzlibSync(data: Uint8Array, opts?: { out?: Uint8Array; dictionary?: Uint8Array }): Uint8Array
