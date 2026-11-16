/*! brotli.js 2.1.0 decompressor (MIT, Copyright Devon Govett), a port of Google's Brotli decoder
 * (Copyright 2013 Google Inc., Apache License 2.0). See LICENSE. Bundled with esbuild and modified by
 * Font Viewer (lines marked "font-viewer patch"): decompress() takes a max_size and stops before
 * passing it, and the static dictionary is no longer embedded (as base64, with base64-js to decode
 * it) but set with setDictionary() from the word list in dictionary.mjs. */

// node_modules/brotli/dec/streams.js
var BrotliInput = class {
  constructor(buffer) {
    this.buffer = buffer;
    this.pos = 0;
  }
  read(buf, i, count) {
    if (this.pos + count > this.buffer.length) {
      count = this.buffer.length - this.pos;
    }
    for (var p = 0; p < count; p++)
      buf[i + p] = this.buffer[this.pos + p];
    this.pos += count;
    return count;
  }
};
var BrotliOutput = class {
  constructor(buf) {
    this.buffer = buf;
    this.pos = 0;
  }
  write(buf, count) {
    if (this.pos + count > this.buffer.length)
      throw new Error("Output buffer is not large enough");
    this.buffer.set(buf.subarray(0, count), this.pos);
    this.pos += count;
    return count;
  }
};

// node_modules/brotli/dec/bit_reader.js
var BROTLI_READ_SIZE = 4096;
var BROTLI_IBUF_SIZE = 2 * BROTLI_READ_SIZE + 32;
var BROTLI_IBUF_MASK = 2 * BROTLI_READ_SIZE - 1;
var kBitMask = new Uint32Array([
  0,
  1,
  3,
  7,
  15,
  31,
  63,
  127,
  255,
  511,
  1023,
  2047,
  4095,
  8191,
  16383,
  32767,
  65535,
  131071,
  262143,
  524287,
  1048575,
  2097151,
  4194303,
  8388607,
  16777215
]);
var BrotliBitReader = class {
  constructor(input) {
    this.buf_ = new Uint8Array(BROTLI_IBUF_SIZE);
    this.input_ = input;
    this.reset();
  }
  reset() {
    this.buf_ptr_ = 0;
    this.val_ = 0;
    this.pos_ = 0;
    this.bit_pos_ = 0;
    this.bit_end_pos_ = 0;
    this.eos_ = 0;
    this.readMoreInput();
    for (var i = 0; i < 4; i++) {
      this.val_ |= this.buf_[this.pos_] << 8 * i;
      ++this.pos_;
    }
    return this.bit_end_pos_ > 0;
  }
  /* Fills up the input ringbuffer by calling the input callback.
  
     Does nothing if there are at least 32 bytes present after current position.
  
     Returns 0 if either:
      - the input callback returned an error, or
      - there is no more input and the position is past the end of the stream.
  
     After encountering the end of the input stream, 32 additional zero bytes are
     copied to the ringbuffer, therefore it is safe to call this function after
     every 32 bytes of input is read.
  */
  readMoreInput() {
    if (this.bit_end_pos_ > 256) {
      return;
    } else if (this.eos_) {
      if (this.bit_pos_ > this.bit_end_pos_)
        throw new Error("Unexpected end of input " + this.bit_pos_ + " " + this.bit_end_pos_);
    } else {
      var dst = this.buf_ptr_;
      var bytes_read = this.input_.read(this.buf_, dst, BROTLI_READ_SIZE);
      if (bytes_read < 0) {
        throw new Error("Unexpected end of input");
      }
      if (bytes_read < BROTLI_READ_SIZE) {
        this.eos_ = 1;
        for (var p = 0; p < 32; p++)
          this.buf_[dst + bytes_read + p] = 0;
      }
      if (dst === 0) {
        for (var p = 0; p < 32; p++)
          this.buf_[(BROTLI_READ_SIZE << 1) + p] = this.buf_[p];
        this.buf_ptr_ = BROTLI_READ_SIZE;
      } else {
        this.buf_ptr_ = 0;
      }
      this.bit_end_pos_ += bytes_read << 3;
    }
  }
  /* Guarantees that there are at least 24 bits in the buffer. */
  fillBitWindow() {
    while (this.bit_pos_ >= 8) {
      this.val_ >>>= 8;
      this.val_ |= this.buf_[this.pos_ & BROTLI_IBUF_MASK] << 24;
      ++this.pos_;
      this.bit_pos_ = this.bit_pos_ - 8 >>> 0;
      this.bit_end_pos_ = this.bit_end_pos_ - 8 >>> 0;
    }
  }
  /* Reads the specified number of bits from Read Buffer. */
  readBits(n_bits) {
    if (32 - this.bit_pos_ < n_bits) {
      this.fillBitWindow();
    }
    var val = this.val_ >>> this.bit_pos_ & kBitMask[n_bits];
    this.bit_pos_ += n_bits;
    return val;
  }
};
BrotliBitReader.READ_SIZE = BROTLI_READ_SIZE;
BrotliBitReader.IBUF_MASK = BROTLI_IBUF_MASK;
var bit_reader_default = BrotliBitReader;

// node_modules/brotli/dec/dictionary.js
// font-viewer patch: the 122,784-byte static dictionary comes from setDictionary() (assembled from
// dictionary.mjs on the first WOFF 2.0 file) instead of a base64 copy decoded at load time.
var dictionary = null;
function setDictionary(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 122784) {
    throw new Error("the Brotli dictionary must be 122784 bytes");
  }
  dictionary = bytes;
}
function hasDictionary() {
  return dictionary !== null;
}
var offsetsByLength = new Uint32Array([
  0,
  0,
  0,
  0,
  0,
  4096,
  9216,
  21504,
  35840,
  44032,
  53248,
  63488,
  74752,
  87040,
  93696,
  100864,
  104704,
  106752,
  108928,
  113536,
  115968,
  118528,
  119872,
  121280,
  122016
]);
var sizeBitsByLength = new Uint8Array([
  0,
  0,
  0,
  0,
  10,
  10,
  11,
  11,
  10,
  10,
  10,
  10,
  10,
  9,
  9,
  8,
  7,
  7,
  8,
  7,
  7,
  6,
  6,
  5,
  5
]);
var minDictionaryWordLength = 4;
var maxDictionaryWordLength = 24;

// node_modules/brotli/dec/huffman.js
function HuffmanCode(bits, value) {
  this.bits = bits;
  this.value = value;
}
var MAX_LENGTH = 15;
function GetNextKey(key, len) {
  var step = 1 << len - 1;
  while (key & step) {
    step >>= 1;
  }
  return (key & step - 1) + step;
}
function ReplicateValue(table, i, step, end, code) {
  do {
    end -= step;
    table[i + end] = new HuffmanCode(code.bits, code.value);
  } while (end > 0);
}
function NextTableBitSize(count, len, root_bits) {
  var left = 1 << len - root_bits;
  while (len < MAX_LENGTH) {
    left -= count[len];
    if (left <= 0) break;
    ++len;
    left <<= 1;
  }
  return len - root_bits;
}
function BrotliBuildHuffmanTable(root_table, table, root_bits, code_lengths, code_lengths_size) {
  var start_table = table;
  var code;
  var len;
  var symbol;
  var key;
  var step;
  var low;
  var mask;
  var table_bits;
  var table_size;
  var total_size;
  var sorted;
  var count = new Int32Array(MAX_LENGTH + 1);
  var offset = new Int32Array(MAX_LENGTH + 1);
  sorted = new Int32Array(code_lengths_size);
  for (symbol = 0; symbol < code_lengths_size; symbol++) {
    count[code_lengths[symbol]]++;
  }
  offset[1] = 0;
  for (len = 1; len < MAX_LENGTH; len++) {
    offset[len + 1] = offset[len] + count[len];
  }
  for (symbol = 0; symbol < code_lengths_size; symbol++) {
    if (code_lengths[symbol] !== 0) {
      sorted[offset[code_lengths[symbol]]++] = symbol;
    }
  }
  table_bits = root_bits;
  table_size = 1 << table_bits;
  total_size = table_size;
  if (offset[MAX_LENGTH] === 1) {
    for (key = 0; key < total_size; ++key) {
      root_table[table + key] = new HuffmanCode(0, sorted[0] & 65535);
    }
    return total_size;
  }
  key = 0;
  symbol = 0;
  for (len = 1, step = 2; len <= root_bits; ++len, step <<= 1) {
    for (; count[len] > 0; --count[len]) {
      code = new HuffmanCode(len & 255, sorted[symbol++] & 65535);
      ReplicateValue(root_table, table + key, step, table_size, code);
      key = GetNextKey(key, len);
    }
  }
  mask = total_size - 1;
  low = -1;
  for (len = root_bits + 1, step = 2; len <= MAX_LENGTH; ++len, step <<= 1) {
    for (; count[len] > 0; --count[len]) {
      if ((key & mask) !== low) {
        table += table_size;
        table_bits = NextTableBitSize(count, len, root_bits);
        table_size = 1 << table_bits;
        total_size += table_size;
        low = key & mask;
        root_table[start_table + low] = new HuffmanCode(table_bits + root_bits & 255, table - start_table - low & 65535);
      }
      code = new HuffmanCode(len - root_bits & 255, sorted[symbol++] & 65535);
      ReplicateValue(root_table, table + (key >> root_bits), step, table_size, code);
      key = GetNextKey(key, len);
    }
  }
  return total_size;
}

// node_modules/brotli/dec/context.js
var lookup = new Uint8Array([
  /* CONTEXT_UTF8, last byte. */
  /* ASCII range. */
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  4,
  4,
  0,
  0,
  4,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  8,
  12,
  16,
  12,
  12,
  20,
  12,
  16,
  24,
  28,
  12,
  12,
  32,
  12,
  36,
  12,
  44,
  44,
  44,
  44,
  44,
  44,
  44,
  44,
  44,
  44,
  32,
  32,
  24,
  40,
  28,
  12,
  12,
  48,
  52,
  52,
  52,
  48,
  52,
  52,
  52,
  48,
  52,
  52,
  52,
  52,
  52,
  48,
  52,
  52,
  52,
  52,
  52,
  48,
  52,
  52,
  52,
  52,
  52,
  24,
  12,
  28,
  12,
  12,
  12,
  56,
  60,
  60,
  60,
  56,
  60,
  60,
  60,
  56,
  60,
  60,
  60,
  60,
  60,
  56,
  60,
  60,
  60,
  60,
  60,
  56,
  60,
  60,
  60,
  60,
  60,
  24,
  12,
  28,
  12,
  0,
  /* UTF8 continuation byte range. */
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  0,
  1,
  /* UTF8 lead byte range. */
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  2,
  3,
  /* CONTEXT_UTF8 second last byte. */
  /* ASCII range. */
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  1,
  1,
  1,
  1,
  1,
  1,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  1,
  1,
  1,
  1,
  0,
  /* UTF8 continuation byte range. */
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  /* UTF8 lead byte range. */
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  /* CONTEXT_SIGNED, second last byte. */
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  7,
  /* CONTEXT_SIGNED, last byte, same as the above values shifted by 3 bits. */
  0,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  24,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  32,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  40,
  48,
  48,
  48,
  48,
  48,
  48,
  48,
  48,
  48,
  48,
  48,
  48,
  48,
  48,
  48,
  56,
  /* CONTEXT_LSB6, last byte. */
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  29,
  30,
  31,
  32,
  33,
  34,
  35,
  36,
  37,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  48,
  49,
  50,
  51,
  52,
  53,
  54,
  55,
  56,
  57,
  58,
  59,
  60,
  61,
  62,
  63,
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  29,
  30,
  31,
  32,
  33,
  34,
  35,
  36,
  37,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  48,
  49,
  50,
  51,
  52,
  53,
  54,
  55,
  56,
  57,
  58,
  59,
  60,
  61,
  62,
  63,
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  29,
  30,
  31,
  32,
  33,
  34,
  35,
  36,
  37,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  48,
  49,
  50,
  51,
  52,
  53,
  54,
  55,
  56,
  57,
  58,
  59,
  60,
  61,
  62,
  63,
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  29,
  30,
  31,
  32,
  33,
  34,
  35,
  36,
  37,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  48,
  49,
  50,
  51,
  52,
  53,
  54,
  55,
  56,
  57,
  58,
  59,
  60,
  61,
  62,
  63,
  /* CONTEXT_MSB6, last byte. */
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  6,
  6,
  6,
  6,
  7,
  7,
  7,
  7,
  8,
  8,
  8,
  8,
  9,
  9,
  9,
  9,
  10,
  10,
  10,
  10,
  11,
  11,
  11,
  11,
  12,
  12,
  12,
  12,
  13,
  13,
  13,
  13,
  14,
  14,
  14,
  14,
  15,
  15,
  15,
  15,
  16,
  16,
  16,
  16,
  17,
  17,
  17,
  17,
  18,
  18,
  18,
  18,
  19,
  19,
  19,
  19,
  20,
  20,
  20,
  20,
  21,
  21,
  21,
  21,
  22,
  22,
  22,
  22,
  23,
  23,
  23,
  23,
  24,
  24,
  24,
  24,
  25,
  25,
  25,
  25,
  26,
  26,
  26,
  26,
  27,
  27,
  27,
  27,
  28,
  28,
  28,
  28,
  29,
  29,
  29,
  29,
  30,
  30,
  30,
  30,
  31,
  31,
  31,
  31,
  32,
  32,
  32,
  32,
  33,
  33,
  33,
  33,
  34,
  34,
  34,
  34,
  35,
  35,
  35,
  35,
  36,
  36,
  36,
  36,
  37,
  37,
  37,
  37,
  38,
  38,
  38,
  38,
  39,
  39,
  39,
  39,
  40,
  40,
  40,
  40,
  41,
  41,
  41,
  41,
  42,
  42,
  42,
  42,
  43,
  43,
  43,
  43,
  44,
  44,
  44,
  44,
  45,
  45,
  45,
  45,
  46,
  46,
  46,
  46,
  47,
  47,
  47,
  47,
  48,
  48,
  48,
  48,
  49,
  49,
  49,
  49,
  50,
  50,
  50,
  50,
  51,
  51,
  51,
  51,
  52,
  52,
  52,
  52,
  53,
  53,
  53,
  53,
  54,
  54,
  54,
  54,
  55,
  55,
  55,
  55,
  56,
  56,
  56,
  56,
  57,
  57,
  57,
  57,
  58,
  58,
  58,
  58,
  59,
  59,
  59,
  59,
  60,
  60,
  60,
  60,
  61,
  61,
  61,
  61,
  62,
  62,
  62,
  62,
  63,
  63,
  63,
  63,
  /* CONTEXT_{M,L}SB6, second last byte, */
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0
]);
var lookupOffsets = new Uint16Array([
  /* CONTEXT_LSB6 */
  1024,
  1536,
  /* CONTEXT_MSB6 */
  1280,
  1536,
  /* CONTEXT_UTF8 */
  0,
  256,
  /* CONTEXT_SIGNED */
  768,
  512
]);

// node_modules/brotli/dec/prefix.js
function prefixCodeRange(offset, nbits) {
  return { offset, nbits };
}
var kBlockLengthPrefixCode = [
  prefixCodeRange(1, 2),
  prefixCodeRange(5, 2),
  prefixCodeRange(9, 2),
  prefixCodeRange(13, 2),
  prefixCodeRange(17, 3),
  prefixCodeRange(25, 3),
  prefixCodeRange(33, 3),
  prefixCodeRange(41, 3),
  prefixCodeRange(49, 4),
  prefixCodeRange(65, 4),
  prefixCodeRange(81, 4),
  prefixCodeRange(97, 4),
  prefixCodeRange(113, 5),
  prefixCodeRange(145, 5),
  prefixCodeRange(177, 5),
  prefixCodeRange(209, 5),
  prefixCodeRange(241, 6),
  prefixCodeRange(305, 6),
  prefixCodeRange(369, 7),
  prefixCodeRange(497, 8),
  prefixCodeRange(753, 9),
  prefixCodeRange(1265, 10),
  prefixCodeRange(2289, 11),
  prefixCodeRange(4337, 12),
  prefixCodeRange(8433, 13),
  prefixCodeRange(16625, 24)
];
var kInsertLengthPrefixCode = [
  prefixCodeRange(0, 0),
  prefixCodeRange(1, 0),
  prefixCodeRange(2, 0),
  prefixCodeRange(3, 0),
  prefixCodeRange(4, 0),
  prefixCodeRange(5, 0),
  prefixCodeRange(6, 1),
  prefixCodeRange(8, 1),
  prefixCodeRange(10, 2),
  prefixCodeRange(14, 2),
  prefixCodeRange(18, 3),
  prefixCodeRange(26, 3),
  prefixCodeRange(34, 4),
  prefixCodeRange(50, 4),
  prefixCodeRange(66, 5),
  prefixCodeRange(98, 5),
  prefixCodeRange(130, 6),
  prefixCodeRange(194, 7),
  prefixCodeRange(322, 8),
  prefixCodeRange(578, 9),
  prefixCodeRange(1090, 10),
  prefixCodeRange(2114, 12),
  prefixCodeRange(6210, 14),
  prefixCodeRange(22594, 24)
];
var kCopyLengthPrefixCode = [
  prefixCodeRange(2, 0),
  prefixCodeRange(3, 0),
  prefixCodeRange(4, 0),
  prefixCodeRange(5, 0),
  prefixCodeRange(6, 0),
  prefixCodeRange(7, 0),
  prefixCodeRange(8, 0),
  prefixCodeRange(9, 0),
  prefixCodeRange(10, 1),
  prefixCodeRange(12, 1),
  prefixCodeRange(14, 2),
  prefixCodeRange(18, 2),
  prefixCodeRange(22, 3),
  prefixCodeRange(30, 3),
  prefixCodeRange(38, 4),
  prefixCodeRange(54, 4),
  prefixCodeRange(70, 5),
  prefixCodeRange(102, 5),
  prefixCodeRange(134, 6),
  prefixCodeRange(198, 7),
  prefixCodeRange(326, 8),
  prefixCodeRange(582, 9),
  prefixCodeRange(1094, 10),
  prefixCodeRange(2118, 24)
];
var kInsertRangeLut = [
  0,
  0,
  8,
  8,
  0,
  16,
  8,
  16,
  16
];
var kCopyRangeLut = [
  0,
  8,
  0,
  8,
  16,
  0,
  16,
  8,
  16
];

// node_modules/brotli/dec/transform.js
var kIdentity = 0;
var kOmitLast1 = 1;
var kOmitLast2 = 2;
var kOmitLast3 = 3;
var kOmitLast4 = 4;
var kOmitLast5 = 5;
var kOmitLast6 = 6;
var kOmitLast7 = 7;
var kOmitLast8 = 8;
var kOmitLast9 = 9;
var kUppercaseFirst = 10;
var kUppercaseAll = 11;
var kOmitFirst1 = 12;
var kOmitFirst2 = 13;
var kOmitFirst3 = 14;
var kOmitFirst4 = 15;
var kOmitFirst5 = 16;
var kOmitFirst6 = 17;
var kOmitFirst7 = 18;
var kOmitFirst9 = 20;
function Transform(prefix, transform, suffix) {
  this.prefix = new Uint8Array(prefix.length);
  this.transform = transform;
  this.suffix = new Uint8Array(suffix.length);
  for (var i = 0; i < prefix.length; i++)
    this.prefix[i] = prefix.charCodeAt(i);
  for (var i = 0; i < suffix.length; i++)
    this.suffix[i] = suffix.charCodeAt(i);
}
var kTransforms = [
  new Transform("", kIdentity, ""),
  new Transform("", kIdentity, " "),
  new Transform(" ", kIdentity, " "),
  new Transform("", kOmitFirst1, ""),
  new Transform("", kUppercaseFirst, " "),
  new Transform("", kIdentity, " the "),
  new Transform(" ", kIdentity, ""),
  new Transform("s ", kIdentity, " "),
  new Transform("", kIdentity, " of "),
  new Transform("", kUppercaseFirst, ""),
  new Transform("", kIdentity, " and "),
  new Transform("", kOmitFirst2, ""),
  new Transform("", kOmitLast1, ""),
  new Transform(", ", kIdentity, " "),
  new Transform("", kIdentity, ", "),
  new Transform(" ", kUppercaseFirst, " "),
  new Transform("", kIdentity, " in "),
  new Transform("", kIdentity, " to "),
  new Transform("e ", kIdentity, " "),
  new Transform("", kIdentity, '"'),
  new Transform("", kIdentity, "."),
  new Transform("", kIdentity, '">'),
  new Transform("", kIdentity, "\n"),
  new Transform("", kOmitLast3, ""),
  new Transform("", kIdentity, "]"),
  new Transform("", kIdentity, " for "),
  new Transform("", kOmitFirst3, ""),
  new Transform("", kOmitLast2, ""),
  new Transform("", kIdentity, " a "),
  new Transform("", kIdentity, " that "),
  new Transform(" ", kUppercaseFirst, ""),
  new Transform("", kIdentity, ". "),
  new Transform(".", kIdentity, ""),
  new Transform(" ", kIdentity, ", "),
  new Transform("", kOmitFirst4, ""),
  new Transform("", kIdentity, " with "),
  new Transform("", kIdentity, "'"),
  new Transform("", kIdentity, " from "),
  new Transform("", kIdentity, " by "),
  new Transform("", kOmitFirst5, ""),
  new Transform("", kOmitFirst6, ""),
  new Transform(" the ", kIdentity, ""),
  new Transform("", kOmitLast4, ""),
  new Transform("", kIdentity, ". The "),
  new Transform("", kUppercaseAll, ""),
  new Transform("", kIdentity, " on "),
  new Transform("", kIdentity, " as "),
  new Transform("", kIdentity, " is "),
  new Transform("", kOmitLast7, ""),
  new Transform("", kOmitLast1, "ing "),
  new Transform("", kIdentity, "\n	"),
  new Transform("", kIdentity, ":"),
  new Transform(" ", kIdentity, ". "),
  new Transform("", kIdentity, "ed "),
  new Transform("", kOmitFirst9, ""),
  new Transform("", kOmitFirst7, ""),
  new Transform("", kOmitLast6, ""),
  new Transform("", kIdentity, "("),
  new Transform("", kUppercaseFirst, ", "),
  new Transform("", kOmitLast8, ""),
  new Transform("", kIdentity, " at "),
  new Transform("", kIdentity, "ly "),
  new Transform(" the ", kIdentity, " of "),
  new Transform("", kOmitLast5, ""),
  new Transform("", kOmitLast9, ""),
  new Transform(" ", kUppercaseFirst, ", "),
  new Transform("", kUppercaseFirst, '"'),
  new Transform(".", kIdentity, "("),
  new Transform("", kUppercaseAll, " "),
  new Transform("", kUppercaseFirst, '">'),
  new Transform("", kIdentity, '="'),
  new Transform(" ", kIdentity, "."),
  new Transform(".com/", kIdentity, ""),
  new Transform(" the ", kIdentity, " of the "),
  new Transform("", kUppercaseFirst, "'"),
  new Transform("", kIdentity, ". This "),
  new Transform("", kIdentity, ","),
  new Transform(".", kIdentity, " "),
  new Transform("", kUppercaseFirst, "("),
  new Transform("", kUppercaseFirst, "."),
  new Transform("", kIdentity, " not "),
  new Transform(" ", kIdentity, '="'),
  new Transform("", kIdentity, "er "),
  new Transform(" ", kUppercaseAll, " "),
  new Transform("", kIdentity, "al "),
  new Transform(" ", kUppercaseAll, ""),
  new Transform("", kIdentity, "='"),
  new Transform("", kUppercaseAll, '"'),
  new Transform("", kUppercaseFirst, ". "),
  new Transform(" ", kIdentity, "("),
  new Transform("", kIdentity, "ful "),
  new Transform(" ", kUppercaseFirst, ". "),
  new Transform("", kIdentity, "ive "),
  new Transform("", kIdentity, "less "),
  new Transform("", kUppercaseAll, "'"),
  new Transform("", kIdentity, "est "),
  new Transform(" ", kUppercaseFirst, "."),
  new Transform("", kUppercaseAll, '">'),
  new Transform(" ", kIdentity, "='"),
  new Transform("", kUppercaseFirst, ","),
  new Transform("", kIdentity, "ize "),
  new Transform("", kUppercaseAll, "."),
  new Transform("\xC2\xA0", kIdentity, ""),
  new Transform(" ", kIdentity, ","),
  new Transform("", kUppercaseFirst, '="'),
  new Transform("", kUppercaseAll, '="'),
  new Transform("", kIdentity, "ous "),
  new Transform("", kUppercaseAll, ", "),
  new Transform("", kUppercaseFirst, "='"),
  new Transform(" ", kUppercaseFirst, ","),
  new Transform(" ", kUppercaseAll, '="'),
  new Transform(" ", kUppercaseAll, ", "),
  new Transform("", kUppercaseAll, ","),
  new Transform("", kUppercaseAll, "("),
  new Transform("", kUppercaseAll, ". "),
  new Transform(" ", kUppercaseAll, "."),
  new Transform("", kUppercaseAll, "='"),
  new Transform(" ", kUppercaseAll, ". "),
  new Transform(" ", kUppercaseFirst, '="'),
  new Transform(" ", kUppercaseAll, "='"),
  new Transform(" ", kUppercaseFirst, "='")
];
var kNumTransforms = kTransforms.length;
function ToUpperCase(p, i) {
  if (p[i] < 192) {
    if (p[i] >= 97 && p[i] <= 122) {
      p[i] ^= 32;
    }
    return 1;
  }
  if (p[i] < 224) {
    p[i + 1] ^= 32;
    return 2;
  }
  p[i + 2] ^= 5;
  return 3;
}
function transformDictionaryWord(dst, idx, word, len, transform) {
  var prefix = kTransforms[transform].prefix;
  var suffix = kTransforms[transform].suffix;
  var t = kTransforms[transform].transform;
  var skip = t < kOmitFirst1 ? 0 : t - (kOmitFirst1 - 1);
  var i = 0;
  var start_idx = idx;
  var uppercase;
  if (skip > len) {
    skip = len;
  }
  var prefix_pos = 0;
  while (prefix_pos < prefix.length) {
    dst[idx++] = prefix[prefix_pos++];
  }
  word += skip;
  len -= skip;
  if (t <= kOmitLast9) {
    len -= t;
  }
  for (i = 0; i < len; i++) {
    dst[idx++] = dictionary[word + i];
  }
  uppercase = idx - len;
  if (t === kUppercaseFirst) {
    ToUpperCase(dst, uppercase);
  } else if (t === kUppercaseAll) {
    while (len > 0) {
      var step = ToUpperCase(dst, uppercase);
      uppercase += step;
      len -= step;
    }
  }
  var suffix_pos = 0;
  while (suffix_pos < suffix.length) {
    dst[idx++] = suffix[suffix_pos++];
  }
  return idx - start_idx;
}

// node_modules/brotli/dec/decode.js
var kDefaultCodeLength = 8;
var kCodeLengthRepeatCode = 16;
var kNumLiteralCodes = 256;
var kNumInsertAndCopyCodes = 704;
var kNumBlockLengthCodes = 26;
var kLiteralContextBits = 6;
var kDistanceContextBits = 2;
var HUFFMAN_TABLE_BITS = 8;
var HUFFMAN_TABLE_MASK = 255;
var HUFFMAN_MAX_TABLE_SIZE = 1080;
var CODE_LENGTH_CODES = 18;
var kCodeLengthCodeOrder = new Uint8Array([
  1,
  2,
  3,
  4,
  0,
  5,
  17,
  6,
  16,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15
]);
var NUM_DISTANCE_SHORT_CODES = 16;
var kDistanceShortCodeIndexOffset = new Uint8Array([
  3,
  2,
  1,
  0,
  3,
  3,
  3,
  3,
  3,
  3,
  2,
  2,
  2,
  2,
  2,
  2
]);
var kDistanceShortCodeValueOffset = new Int8Array([
  0,
  0,
  0,
  0,
  -1,
  1,
  -2,
  2,
  -3,
  3,
  -1,
  1,
  -2,
  2,
  -3,
  3
]);
var kMaxHuffmanTableSize = new Uint16Array([
  256,
  402,
  436,
  468,
  500,
  534,
  566,
  598,
  630,
  662,
  694,
  726,
  758,
  790,
  822,
  854,
  886,
  920,
  952,
  984,
  1016,
  1048,
  1080
]);
function DecodeWindowBits(br) {
  var n;
  if (br.readBits(1) === 0) {
    return 16;
  }
  n = br.readBits(3);
  if (n > 0) {
    return 17 + n;
  }
  n = br.readBits(3);
  if (n > 0) {
    return 8 + n;
  }
  return 17;
}
function DecodeVarLenUint8(br) {
  if (br.readBits(1)) {
    var nbits = br.readBits(3);
    if (nbits === 0) {
      return 1;
    } else {
      return br.readBits(nbits) + (1 << nbits);
    }
  }
  return 0;
}
var MetaBlockLength = class {
  constructor() {
    this.meta_block_length = 0;
    this.input_end = 0;
    this.is_uncompressed = 0;
    this.is_metadata = false;
  }
};
function DecodeMetaBlockLength(br) {
  var out = new MetaBlockLength();
  var size_nibbles;
  var size_bytes;
  var i;
  out.input_end = br.readBits(1);
  if (out.input_end && br.readBits(1)) {
    return out;
  }
  size_nibbles = br.readBits(2) + 4;
  if (size_nibbles === 7) {
    out.is_metadata = true;
    if (br.readBits(1) !== 0)
      throw new Error("Invalid reserved bit");
    size_bytes = br.readBits(2);
    if (size_bytes === 0)
      return out;
    for (i = 0; i < size_bytes; i++) {
      var next_byte = br.readBits(8);
      if (i + 1 === size_bytes && size_bytes > 1 && next_byte === 0)
        throw new Error("Invalid size byte");
      out.meta_block_length |= next_byte << i * 8;
    }
  } else {
    for (i = 0; i < size_nibbles; ++i) {
      var next_nibble = br.readBits(4);
      if (i + 1 === size_nibbles && size_nibbles > 4 && next_nibble === 0)
        throw new Error("Invalid size nibble");
      out.meta_block_length |= next_nibble << i * 4;
    }
  }
  ++out.meta_block_length;
  if (!out.input_end && !out.is_metadata) {
    out.is_uncompressed = br.readBits(1);
  }
  return out;
}
function ReadSymbol(table, index, br) {
  var start_index = index;
  var nbits;
  br.fillBitWindow();
  index += br.val_ >>> br.bit_pos_ & HUFFMAN_TABLE_MASK;
  nbits = table[index].bits - HUFFMAN_TABLE_BITS;
  if (nbits > 0) {
    br.bit_pos_ += HUFFMAN_TABLE_BITS;
    index += table[index].value;
    index += br.val_ >>> br.bit_pos_ & (1 << nbits) - 1;
  }
  br.bit_pos_ += table[index].bits;
  return table[index].value;
}
function ReadHuffmanCodeLengths(code_length_code_lengths, num_symbols, code_lengths, br) {
  var symbol = 0;
  var prev_code_len = kDefaultCodeLength;
  var repeat = 0;
  var repeat_code_len = 0;
  var space = 32768;
  var table = [];
  for (var i = 0; i < 32; i++)
    table.push(new HuffmanCode(0, 0));
  BrotliBuildHuffmanTable(table, 0, 5, code_length_code_lengths, CODE_LENGTH_CODES);
  while (symbol < num_symbols && space > 0) {
    var p = 0;
    var code_len;
    br.readMoreInput();
    br.fillBitWindow();
    p += br.val_ >>> br.bit_pos_ & 31;
    br.bit_pos_ += table[p].bits;
    code_len = table[p].value & 255;
    if (code_len < kCodeLengthRepeatCode) {
      repeat = 0;
      code_lengths[symbol++] = code_len;
      if (code_len !== 0) {
        prev_code_len = code_len;
        space -= 32768 >> code_len;
      }
    } else {
      var extra_bits = code_len - 14;
      var old_repeat;
      var repeat_delta;
      var new_len = 0;
      if (code_len === kCodeLengthRepeatCode) {
        new_len = prev_code_len;
      }
      if (repeat_code_len !== new_len) {
        repeat = 0;
        repeat_code_len = new_len;
      }
      old_repeat = repeat;
      if (repeat > 0) {
        repeat -= 2;
        repeat <<= extra_bits;
      }
      repeat += br.readBits(extra_bits) + 3;
      repeat_delta = repeat - old_repeat;
      if (symbol + repeat_delta > num_symbols) {
        throw new Error("[ReadHuffmanCodeLengths] symbol + repeat_delta > num_symbols");
      }
      for (var x = 0; x < repeat_delta; x++)
        code_lengths[symbol + x] = repeat_code_len;
      symbol += repeat_delta;
      if (repeat_code_len !== 0) {
        space -= repeat_delta << 15 - repeat_code_len;
      }
    }
  }
  if (space !== 0) {
    throw new Error("[ReadHuffmanCodeLengths] space = " + space);
  }
  for (; symbol < num_symbols; symbol++)
    code_lengths[symbol] = 0;
}
function ReadHuffmanCode(alphabet_size, tables, table, br) {
  var table_size = 0;
  var simple_code_or_skip;
  var code_lengths = new Uint8Array(alphabet_size);
  br.readMoreInput();
  simple_code_or_skip = br.readBits(2);
  if (simple_code_or_skip === 1) {
    var i;
    var max_bits_counter = alphabet_size - 1;
    var max_bits = 0;
    var symbols = new Int32Array(4);
    var num_symbols = br.readBits(2) + 1;
    while (max_bits_counter) {
      max_bits_counter >>= 1;
      ++max_bits;
    }
    for (i = 0; i < num_symbols; ++i) {
      symbols[i] = br.readBits(max_bits) % alphabet_size;
      code_lengths[symbols[i]] = 2;
    }
    code_lengths[symbols[0]] = 1;
    switch (num_symbols) {
      case 1:
        break;
      case 3:
        if (symbols[0] === symbols[1] || symbols[0] === symbols[2] || symbols[1] === symbols[2]) {
          throw new Error("[ReadHuffmanCode] invalid symbols");
        }
        break;
      case 2:
        if (symbols[0] === symbols[1]) {
          throw new Error("[ReadHuffmanCode] invalid symbols");
        }
        code_lengths[symbols[1]] = 1;
        break;
      case 4:
        if (symbols[0] === symbols[1] || symbols[0] === symbols[2] || symbols[0] === symbols[3] || symbols[1] === symbols[2] || symbols[1] === symbols[3] || symbols[2] === symbols[3]) {
          throw new Error("[ReadHuffmanCode] invalid symbols");
        }
        if (br.readBits(1)) {
          code_lengths[symbols[2]] = 3;
          code_lengths[symbols[3]] = 3;
        } else {
          code_lengths[symbols[0]] = 2;
        }
        break;
    }
  } else {
    var i;
    var code_length_code_lengths = new Uint8Array(CODE_LENGTH_CODES);
    var space = 32;
    var num_codes = 0;
    var huff = [
      new HuffmanCode(2, 0),
      new HuffmanCode(2, 4),
      new HuffmanCode(2, 3),
      new HuffmanCode(3, 2),
      new HuffmanCode(2, 0),
      new HuffmanCode(2, 4),
      new HuffmanCode(2, 3),
      new HuffmanCode(4, 1),
      new HuffmanCode(2, 0),
      new HuffmanCode(2, 4),
      new HuffmanCode(2, 3),
      new HuffmanCode(3, 2),
      new HuffmanCode(2, 0),
      new HuffmanCode(2, 4),
      new HuffmanCode(2, 3),
      new HuffmanCode(4, 5)
    ];
    for (i = simple_code_or_skip; i < CODE_LENGTH_CODES && space > 0; ++i) {
      var code_len_idx = kCodeLengthCodeOrder[i];
      var p = 0;
      var v;
      br.fillBitWindow();
      p += br.val_ >>> br.bit_pos_ & 15;
      br.bit_pos_ += huff[p].bits;
      v = huff[p].value;
      code_length_code_lengths[code_len_idx] = v;
      if (v !== 0) {
        space -= 32 >> v;
        ++num_codes;
      }
    }
    if (!(num_codes === 1 || space === 0))
      throw new Error("[ReadHuffmanCode] invalid num_codes or space");
    ReadHuffmanCodeLengths(code_length_code_lengths, alphabet_size, code_lengths, br);
  }
  table_size = BrotliBuildHuffmanTable(tables, table, HUFFMAN_TABLE_BITS, code_lengths, alphabet_size);
  if (table_size === 0) {
    throw new Error("[ReadHuffmanCode] BuildHuffmanTable failed: ");
  }
  return table_size;
}
function ReadBlockLength(table, index, br) {
  var code;
  var nbits;
  code = ReadSymbol(table, index, br);
  nbits = kBlockLengthPrefixCode[code].nbits;
  return kBlockLengthPrefixCode[code].offset + br.readBits(nbits);
}
function TranslateShortCodes(code, ringbuffer, index) {
  var val;
  if (code < NUM_DISTANCE_SHORT_CODES) {
    index += kDistanceShortCodeIndexOffset[code];
    index &= 3;
    val = ringbuffer[index] + kDistanceShortCodeValueOffset[code];
  } else {
    val = code - NUM_DISTANCE_SHORT_CODES + 1;
  }
  return val;
}
function MoveToFront(v, index) {
  var value = v[index];
  var i = index;
  for (; i; --i) v[i] = v[i - 1];
  v[0] = value;
}
function InverseMoveToFrontTransform(v, v_len) {
  var mtf = new Uint8Array(256);
  var i;
  for (i = 0; i < 256; ++i) {
    mtf[i] = i;
  }
  for (i = 0; i < v_len; ++i) {
    var index = v[i];
    v[i] = mtf[index];
    if (index) MoveToFront(mtf, index);
  }
}
var HuffmanTreeGroup = class {
  constructor(alphabet_size, num_htrees) {
    this.alphabet_size = alphabet_size;
    this.num_htrees = num_htrees;
    this.codes = new Array(num_htrees + num_htrees * kMaxHuffmanTableSize[alphabet_size + 31 >>> 5]);
    this.htrees = new Uint32Array(num_htrees);
  }
  decode(br) {
    var i;
    var table_size;
    var next = 0;
    for (i = 0; i < this.num_htrees; ++i) {
      this.htrees[i] = next;
      table_size = ReadHuffmanCode(this.alphabet_size, this.codes, next, br);
      next += table_size;
    }
  }
};
function DecodeContextMap(context_map_size, br) {
  var out = { num_htrees: null, context_map: null };
  var use_rle_for_zeros;
  var max_run_length_prefix = 0;
  var table;
  var i;
  br.readMoreInput();
  var num_htrees = out.num_htrees = DecodeVarLenUint8(br) + 1;
  var context_map = out.context_map = new Uint8Array(context_map_size);
  if (num_htrees <= 1) {
    return out;
  }
  use_rle_for_zeros = br.readBits(1);
  if (use_rle_for_zeros) {
    max_run_length_prefix = br.readBits(4) + 1;
  }
  table = [];
  for (i = 0; i < HUFFMAN_MAX_TABLE_SIZE; i++) {
    table[i] = new HuffmanCode(0, 0);
  }
  ReadHuffmanCode(num_htrees + max_run_length_prefix, table, 0, br);
  for (i = 0; i < context_map_size; ) {
    var code;
    br.readMoreInput();
    code = ReadSymbol(table, 0, br);
    if (code === 0) {
      context_map[i] = 0;
      ++i;
    } else if (code <= max_run_length_prefix) {
      var reps = 1 + (1 << code) + br.readBits(code);
      while (--reps) {
        if (i >= context_map_size) {
          throw new Error("[DecodeContextMap] i >= context_map_size");
        }
        context_map[i] = 0;
        ++i;
      }
    } else {
      context_map[i] = code - max_run_length_prefix;
      ++i;
    }
  }
  if (br.readBits(1)) {
    InverseMoveToFrontTransform(context_map, context_map_size);
  }
  return out;
}
function DecodeBlockType(max_block_type, trees, tree_type, block_types, ringbuffers, indexes, br) {
  var ringbuffer = tree_type * 2;
  var index = tree_type;
  var type_code = ReadSymbol(trees, tree_type * HUFFMAN_MAX_TABLE_SIZE, br);
  var block_type;
  if (type_code === 0) {
    block_type = ringbuffers[ringbuffer + (indexes[index] & 1)];
  } else if (type_code === 1) {
    block_type = ringbuffers[ringbuffer + (indexes[index] - 1 & 1)] + 1;
  } else {
    block_type = type_code - 2;
  }
  if (block_type >= max_block_type) {
    block_type -= max_block_type;
  }
  block_types[tree_type] = block_type;
  ringbuffers[ringbuffer + (indexes[index] & 1)] = block_type;
  ++indexes[index];
}
function CopyUncompressedBlockToOutput(output, len, pos, ringbuffer, ringbuffer_mask, br) {
  var rb_size = ringbuffer_mask + 1;
  var rb_pos = pos & ringbuffer_mask;
  var br_pos = br.pos_ & bit_reader_default.IBUF_MASK;
  var nbytes;
  if (len < 8 || br.bit_pos_ + (len << 3) < br.bit_end_pos_) {
    while (len-- > 0) {
      br.readMoreInput();
      ringbuffer[rb_pos++] = br.readBits(8);
      if (rb_pos === rb_size) {
        output.write(ringbuffer, rb_size);
        rb_pos = 0;
      }
    }
    return;
  }
  if (br.bit_end_pos_ < 32) {
    throw new Error("[CopyUncompressedBlockToOutput] br.bit_end_pos_ < 32");
  }
  while (br.bit_pos_ < 32) {
    ringbuffer[rb_pos] = br.val_ >>> br.bit_pos_;
    br.bit_pos_ += 8;
    ++rb_pos;
    --len;
  }
  nbytes = br.bit_end_pos_ - br.bit_pos_ >> 3;
  if (br_pos + nbytes > bit_reader_default.IBUF_MASK) {
    var tail = bit_reader_default.IBUF_MASK + 1 - br_pos;
    for (var x = 0; x < tail; x++)
      ringbuffer[rb_pos + x] = br.buf_[br_pos + x];
    nbytes -= tail;
    rb_pos += tail;
    len -= tail;
    br_pos = 0;
  }
  for (var x = 0; x < nbytes; x++)
    ringbuffer[rb_pos + x] = br.buf_[br_pos + x];
  rb_pos += nbytes;
  len -= nbytes;
  if (rb_pos >= rb_size) {
    output.write(ringbuffer, rb_size);
    rb_pos -= rb_size;
    for (var x = 0; x < rb_pos; x++)
      ringbuffer[x] = ringbuffer[rb_size + x];
  }
  while (rb_pos + len >= rb_size) {
    nbytes = rb_size - rb_pos;
    if (br.input_.read(ringbuffer, rb_pos, nbytes) < nbytes) {
      throw new Error("[CopyUncompressedBlockToOutput] not enough bytes");
    }
    output.write(ringbuffer, rb_size);
    len -= nbytes;
    rb_pos = 0;
  }
  if (br.input_.read(ringbuffer, rb_pos, len) < len) {
    throw new Error("[CopyUncompressedBlockToOutput] not enough bytes");
  }
  br.reset();
}
function JumpToByteBoundary(br) {
  var new_bit_pos = br.bit_pos_ + 7 & ~7;
  var pad_bits = br.readBits(new_bit_pos - br.bit_pos_);
  return pad_bits == 0;
}
function BrotliDecompressedSize(buffer) {
  var input = new BrotliInput(buffer);
  var br = new bit_reader_default(input);
  DecodeWindowBits(br);
  var out = DecodeMetaBlockLength(br);
  return out.meta_block_length;
}
function decompress(buffer, output_size, max_size) {
  // font-viewer patch: fail loudly rather than misread a stream that refers to the dictionary.
  if (dictionary === null) {
    throw new Error("the Brotli dictionary is not loaded");
  }
  var input = new BrotliInput(buffer);
  if (output_size == null) {
    output_size = BrotliDecompressedSize(buffer);
  }
  var output_buffer = new Uint8Array(output_size);
  var output = new BrotliOutput(output_buffer);
  // font-viewer patch: stop before a meta-block would take the output past max_size.
  output.limit = max_size == null ? Infinity : max_size;
  BrotliDecompress(input, output);
  if (output.pos < output.buffer.length) {
    output.buffer = output.buffer.subarray(0, output.pos);
  }
  return output.buffer;
}
function BrotliDecompress(input, output) {
  var i;
  var pos = 0;
  var input_end = 0;
  var window_bits = 0;
  var max_backward_distance;
  var max_distance = 0;
  var ringbuffer_size;
  var ringbuffer_mask;
  var ringbuffer;
  var ringbuffer_end;
  var dist_rb = [16, 15, 11, 4];
  var dist_rb_idx = 0;
  var prev_byte1 = 0;
  var prev_byte2 = 0;
  var hgroup = [new HuffmanTreeGroup(0, 0), new HuffmanTreeGroup(0, 0), new HuffmanTreeGroup(0, 0)];
  var block_type_trees;
  var block_len_trees;
  var br;
  var kRingBufferWriteAheadSlack = 128 + bit_reader_default.READ_SIZE;
  br = new bit_reader_default(input);
  window_bits = DecodeWindowBits(br);
  max_backward_distance = (1 << window_bits) - 16;
  ringbuffer_size = 1 << window_bits;
  ringbuffer_mask = ringbuffer_size - 1;
  ringbuffer = new Uint8Array(ringbuffer_size + kRingBufferWriteAheadSlack + maxDictionaryWordLength);
  ringbuffer_end = ringbuffer_size;
  block_type_trees = [];
  block_len_trees = [];
  for (var x = 0; x < 3 * HUFFMAN_MAX_TABLE_SIZE; x++) {
    block_type_trees[x] = new HuffmanCode(0, 0);
    block_len_trees[x] = new HuffmanCode(0, 0);
  }
  while (!input_end) {
    var meta_block_remaining_len = 0;
    var is_uncompressed;
    var block_length = [1 << 28, 1 << 28, 1 << 28];
    var block_type = [0];
    var num_block_types = [1, 1, 1];
    var block_type_rb = [0, 1, 0, 1, 0, 1];
    var block_type_rb_index = [0];
    var distance_postfix_bits;
    var num_direct_distance_codes;
    var distance_postfix_mask;
    var num_distance_codes;
    var context_map = null;
    var context_modes = null;
    var num_literal_htrees;
    var dist_context_map = null;
    var num_dist_htrees;
    var context_offset = 0;
    var context_map_slice = null;
    var literal_htree_index = 0;
    var dist_context_offset = 0;
    var dist_context_map_slice = null;
    var dist_htree_index = 0;
    var context_lookup_offset1 = 0;
    var context_lookup_offset2 = 0;
    var context_mode;
    var htree_command;
    for (i = 0; i < 3; ++i) {
      hgroup[i].codes = null;
      hgroup[i].htrees = null;
    }
    br.readMoreInput();
    var _out = DecodeMetaBlockLength(br);
    meta_block_remaining_len = _out.meta_block_length;
    // font-viewer patch: refuse output beyond the caller's limit instead of growing the buffer.
    if (!_out.is_metadata && pos + meta_block_remaining_len > output.limit) {
      throw new Error("Brotli data holds more than " + output.limit + " bytes");
    }
    if (pos + meta_block_remaining_len > output.buffer.length) {
      var tmp = new Uint8Array(pos + meta_block_remaining_len);
      tmp.set(output.buffer);
      output.buffer = tmp;
    }
    input_end = _out.input_end;
    is_uncompressed = _out.is_uncompressed;
    if (_out.is_metadata) {
      JumpToByteBoundary(br);
      for (; meta_block_remaining_len > 0; --meta_block_remaining_len) {
        br.readMoreInput();
        br.readBits(8);
      }
      continue;
    }
    if (meta_block_remaining_len === 0) {
      continue;
    }
    if (is_uncompressed) {
      br.bit_pos_ = br.bit_pos_ + 7 & ~7;
      CopyUncompressedBlockToOutput(
        output,
        meta_block_remaining_len,
        pos,
        ringbuffer,
        ringbuffer_mask,
        br
      );
      pos += meta_block_remaining_len;
      continue;
    }
    for (i = 0; i < 3; ++i) {
      num_block_types[i] = DecodeVarLenUint8(br) + 1;
      if (num_block_types[i] >= 2) {
        ReadHuffmanCode(num_block_types[i] + 2, block_type_trees, i * HUFFMAN_MAX_TABLE_SIZE, br);
        ReadHuffmanCode(kNumBlockLengthCodes, block_len_trees, i * HUFFMAN_MAX_TABLE_SIZE, br);
        block_length[i] = ReadBlockLength(block_len_trees, i * HUFFMAN_MAX_TABLE_SIZE, br);
        block_type_rb_index[i] = 1;
      }
    }
    br.readMoreInput();
    distance_postfix_bits = br.readBits(2);
    num_direct_distance_codes = NUM_DISTANCE_SHORT_CODES + (br.readBits(4) << distance_postfix_bits);
    distance_postfix_mask = (1 << distance_postfix_bits) - 1;
    num_distance_codes = num_direct_distance_codes + (48 << distance_postfix_bits);
    context_modes = new Uint8Array(num_block_types[0]);
    for (i = 0; i < num_block_types[0]; ++i) {
      br.readMoreInput();
      context_modes[i] = br.readBits(2) << 1;
    }
    var _o1 = DecodeContextMap(num_block_types[0] << kLiteralContextBits, br);
    num_literal_htrees = _o1.num_htrees;
    context_map = _o1.context_map;
    var _o2 = DecodeContextMap(num_block_types[2] << kDistanceContextBits, br);
    num_dist_htrees = _o2.num_htrees;
    dist_context_map = _o2.context_map;
    hgroup[0] = new HuffmanTreeGroup(kNumLiteralCodes, num_literal_htrees);
    hgroup[1] = new HuffmanTreeGroup(kNumInsertAndCopyCodes, num_block_types[1]);
    hgroup[2] = new HuffmanTreeGroup(num_distance_codes, num_dist_htrees);
    for (i = 0; i < 3; ++i) {
      hgroup[i].decode(br);
    }
    context_map_slice = 0;
    dist_context_map_slice = 0;
    context_mode = context_modes[block_type[0]];
    context_lookup_offset1 = lookupOffsets[context_mode];
    context_lookup_offset2 = lookupOffsets[context_mode + 1];
    htree_command = hgroup[1].htrees[0];
    while (meta_block_remaining_len > 0) {
      var cmd_code;
      var range_idx;
      var insert_code;
      var copy_code;
      var insert_length;
      var copy_length;
      var distance_code;
      var distance;
      var context;
      var j;
      var copy_dst;
      br.readMoreInput();
      if (block_length[1] === 0) {
        DecodeBlockType(
          num_block_types[1],
          block_type_trees,
          1,
          block_type,
          block_type_rb,
          block_type_rb_index,
          br
        );
        block_length[1] = ReadBlockLength(block_len_trees, HUFFMAN_MAX_TABLE_SIZE, br);
        htree_command = hgroup[1].htrees[block_type[1]];
      }
      --block_length[1];
      cmd_code = ReadSymbol(hgroup[1].codes, htree_command, br);
      range_idx = cmd_code >> 6;
      if (range_idx >= 2) {
        range_idx -= 2;
        distance_code = -1;
      } else {
        distance_code = 0;
      }
      insert_code = kInsertRangeLut[range_idx] + (cmd_code >> 3 & 7);
      copy_code = kCopyRangeLut[range_idx] + (cmd_code & 7);
      insert_length = kInsertLengthPrefixCode[insert_code].offset + br.readBits(kInsertLengthPrefixCode[insert_code].nbits);
      copy_length = kCopyLengthPrefixCode[copy_code].offset + br.readBits(kCopyLengthPrefixCode[copy_code].nbits);
      prev_byte1 = ringbuffer[pos - 1 & ringbuffer_mask];
      prev_byte2 = ringbuffer[pos - 2 & ringbuffer_mask];
      for (j = 0; j < insert_length; ++j) {
        br.readMoreInput();
        if (block_length[0] === 0) {
          DecodeBlockType(
            num_block_types[0],
            block_type_trees,
            0,
            block_type,
            block_type_rb,
            block_type_rb_index,
            br
          );
          block_length[0] = ReadBlockLength(block_len_trees, 0, br);
          context_offset = block_type[0] << kLiteralContextBits;
          context_map_slice = context_offset;
          context_mode = context_modes[block_type[0]];
          context_lookup_offset1 = lookupOffsets[context_mode];
          context_lookup_offset2 = lookupOffsets[context_mode + 1];
        }
        context = lookup[context_lookup_offset1 + prev_byte1] | lookup[context_lookup_offset2 + prev_byte2];
        literal_htree_index = context_map[context_map_slice + context];
        --block_length[0];
        prev_byte2 = prev_byte1;
        prev_byte1 = ReadSymbol(hgroup[0].codes, hgroup[0].htrees[literal_htree_index], br);
        ringbuffer[pos & ringbuffer_mask] = prev_byte1;
        if ((pos & ringbuffer_mask) === ringbuffer_mask) {
          output.write(ringbuffer, ringbuffer_size);
        }
        ++pos;
      }
      meta_block_remaining_len -= insert_length;
      if (meta_block_remaining_len <= 0) break;
      if (distance_code < 0) {
        var context;
        br.readMoreInput();
        if (block_length[2] === 0) {
          DecodeBlockType(
            num_block_types[2],
            block_type_trees,
            2,
            block_type,
            block_type_rb,
            block_type_rb_index,
            br
          );
          block_length[2] = ReadBlockLength(block_len_trees, 2 * HUFFMAN_MAX_TABLE_SIZE, br);
          dist_context_offset = block_type[2] << kDistanceContextBits;
          dist_context_map_slice = dist_context_offset;
        }
        --block_length[2];
        context = (copy_length > 4 ? 3 : copy_length - 2) & 255;
        dist_htree_index = dist_context_map[dist_context_map_slice + context];
        distance_code = ReadSymbol(hgroup[2].codes, hgroup[2].htrees[dist_htree_index], br);
        if (distance_code >= num_direct_distance_codes) {
          var nbits;
          var postfix;
          var offset;
          distance_code -= num_direct_distance_codes;
          postfix = distance_code & distance_postfix_mask;
          distance_code >>= distance_postfix_bits;
          nbits = (distance_code >> 1) + 1;
          offset = (2 + (distance_code & 1) << nbits) - 4;
          distance_code = num_direct_distance_codes + (offset + br.readBits(nbits) << distance_postfix_bits) + postfix;
        }
      }
      distance = TranslateShortCodes(distance_code, dist_rb, dist_rb_idx);
      if (distance < 0) {
        throw new Error("[BrotliDecompress] invalid distance");
      }
      if (pos < max_backward_distance && max_distance !== max_backward_distance) {
        max_distance = pos;
      } else {
        max_distance = max_backward_distance;
      }
      copy_dst = pos & ringbuffer_mask;
      if (distance > max_distance) {
        if (copy_length >= minDictionaryWordLength && copy_length <= maxDictionaryWordLength) {
          var offset = offsetsByLength[copy_length];
          var word_id = distance - max_distance - 1;
          var shift = sizeBitsByLength[copy_length];
          var mask = (1 << shift) - 1;
          var word_idx = word_id & mask;
          var transform_idx = word_id >> shift;
          offset += word_idx * copy_length;
          if (transform_idx < kNumTransforms) {
            var len = transformDictionaryWord(ringbuffer, copy_dst, offset, copy_length, transform_idx);
            copy_dst += len;
            pos += len;
            meta_block_remaining_len -= len;
            if (copy_dst >= ringbuffer_end) {
              output.write(ringbuffer, ringbuffer_size);
              for (var _x = 0; _x < copy_dst - ringbuffer_end; _x++)
                ringbuffer[_x] = ringbuffer[ringbuffer_end + _x];
            }
          } else {
            throw new Error("Invalid backward reference. pos: " + pos + " distance: " + distance + " len: " + copy_length + " bytes left: " + meta_block_remaining_len);
          }
        } else {
          throw new Error("Invalid backward reference. pos: " + pos + " distance: " + distance + " len: " + copy_length + " bytes left: " + meta_block_remaining_len);
        }
      } else {
        if (distance_code > 0) {
          dist_rb[dist_rb_idx & 3] = distance;
          ++dist_rb_idx;
        }
        if (copy_length > meta_block_remaining_len) {
          throw new Error("Invalid backward reference. pos: " + pos + " distance: " + distance + " len: " + copy_length + " bytes left: " + meta_block_remaining_len);
        }
        for (j = 0; j < copy_length; ++j) {
          ringbuffer[pos & ringbuffer_mask] = ringbuffer[pos - distance & ringbuffer_mask];
          if ((pos & ringbuffer_mask) === ringbuffer_mask) {
            output.write(ringbuffer, ringbuffer_size);
          }
          ++pos;
          --meta_block_remaining_len;
        }
      }
      prev_byte1 = ringbuffer[pos - 1 & ringbuffer_mask];
      prev_byte2 = ringbuffer[pos - 2 & ringbuffer_mask];
    }
    pos &= 1073741823;
  }
  output.write(ringbuffer, pos & ringbuffer_mask);
}
export {
  decompress,
  hasDictionary,
  setDictionary
};
