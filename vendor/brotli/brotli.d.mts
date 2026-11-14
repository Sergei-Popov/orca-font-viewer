/** Decompresses a Brotli stream; with `maxSize`, throws once the output would exceed it. */
export function decompress(buffer: ArrayLike<number>, outSize?: number | null, maxSize?: number): Uint8Array
