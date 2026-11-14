/** Decompresses one Brotli stream; `outSize` is the expected size when known. */
export function decompress(buffer: ArrayLike<number>, outSize?: number | null): Uint8Array
