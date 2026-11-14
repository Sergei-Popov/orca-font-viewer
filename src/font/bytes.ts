// Big-endian reads over a byte range, with bounds checks that throw a FontError instead of
// returning garbage, so a damaged file stops with a message rather than a wrong answer.

export class FontError extends Error {
  constructor(
    readonly code: 'not-a-font' | 'damaged' | 'unsupported',
    message: string
  ) {
    super(message)
    this.name = 'FontError'
  }
}

/** Reads big-endian numbers from `bytes`; offsets are relative to its start. */
export class Reader {
  private readonly view: DataView

  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  get length(): number {
    return this.bytes.byteLength
  }

  private check(offset: number, size: number): void {
    if (!Number.isInteger(offset) || offset < 0 || offset + size > this.bytes.byteLength) {
      throw new FontError('damaged', `read of ${size} bytes at ${offset} is outside ${this.bytes.byteLength}`)
    }
  }

  has(offset: number, size: number): boolean {
    return Number.isInteger(offset) && offset >= 0 && offset + size <= this.bytes.byteLength
  }

  u8(offset: number): number {
    this.check(offset, 1)
    return this.view.getUint8(offset)
  }

  i8(offset: number): number {
    this.check(offset, 1)
    return this.view.getInt8(offset)
  }

  u16(offset: number): number {
    this.check(offset, 2)
    return this.view.getUint16(offset)
  }

  i16(offset: number): number {
    this.check(offset, 2)
    return this.view.getInt16(offset)
  }

  u24(offset: number): number {
    this.check(offset, 3)
    return (this.view.getUint16(offset) << 8) | this.view.getUint8(offset + 2)
  }

  u32(offset: number): number {
    this.check(offset, 4)
    return this.view.getUint32(offset)
  }

  i32(offset: number): number {
    this.check(offset, 4)
    return this.view.getInt32(offset)
  }

  /** 16.16 signed fixed-point. */
  fixed(offset: number): number {
    return this.i32(offset) / 65536
  }

  /** A four-letter OpenType tag; trailing spaces are kept (`'CFF '`). */
  tag(offset: number): string {
    this.check(offset, 4)
    return String.fromCharCode(
      this.view.getUint8(offset),
      this.view.getUint8(offset + 1),
      this.view.getUint8(offset + 2),
      this.view.getUint8(offset + 3)
    )
  }

  /** LONGDATETIME (seconds since 1904-01-01 UTC) as epoch milliseconds, or null when unset. */
  longDateTime(offset: number): number | null {
    const high = this.i32(offset)
    const low = this.u32(offset + 4)
    const seconds = high * 4294967296 + low
    if (seconds <= 0) {
      return null
    }
    return Date.UTC(1904, 0, 1) + seconds * 1000
  }

  slice(offset: number, length: number): Uint8Array {
    this.check(offset, length)
    return this.bytes.subarray(offset, offset + length)
  }
}

/** A tag as four bytes' integer value, for comparisons with the sfnt version field. */
export function tagValue(tag: string): number {
  return ((tag.charCodeAt(0) << 24) | (tag.charCodeAt(1) << 16) | (tag.charCodeAt(2) << 8) | tag.charCodeAt(3)) >>> 0
}
