/** Decompresses a Brotli stream; with `maxSize`, throws once the output would exceed it. Needs `setDictionary` first. */
export function decompress(buffer: ArrayLike<number>, outSize?: number | null, maxSize?: number): Uint8Array
/** Sets the 122,784-byte static dictionary of RFC 7932 (see dictionary.mjs). */
export function setDictionary(bytes: Uint8Array): void
/** Whether `setDictionary` has been called. */
export function hasDictionary(): boolean
