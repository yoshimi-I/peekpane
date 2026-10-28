// Fast lossless PNGs for transient terminal frames. Use a fixed Up filter and
// low compression rather than spending time minimizing a short-lived file.
const zlib = require("node:zlib");
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(data) {
  if (zlib.crc32) return zlib.crc32(data);
  let crc = 0xffffffff;
  for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const result = Buffer.allocUnsafe(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
  return result;
}
function encode(
  bitmap,
  width,
  height,
  layout = { blue: 2, red: 0, premultiplied: false },
) {
  const stride = width * 4;
  if (bitmap.length !== stride * height)
    throw new Error("Invalid frame dimensions");
  const rows = Buffer.allocUnsafe((stride + 1) * height);
  let previous = Buffer.alloc(stride);
  let current = Buffer.allocUnsafe(stride);
  for (let y = 0; y < height; y++) {
    const input = y * stride;
    const output = y * (stride + 1);
    rows[output] = 2; // Up filter keeps repeated backgrounds cheap to compress.
    for (let x = 0; x < stride; x += 4) {
      const a = bitmap[input + x + 3];
      if (!layout.premultiplied || a === 0 || a === 255) {
        current[x] = bitmap[input + x + layout.red];
        current[x + 1] = bitmap[input + x + 1];
        current[x + 2] = bitmap[input + x + layout.blue];
      } else {
        const scale = 255 / a;
        current[x] = Math.min(
          255,
          Math.round(bitmap[input + x + layout.red] * scale),
        );
        current[x + 1] = Math.min(
          255,
          Math.round(bitmap[input + x + 1] * scale),
        );
        current[x + 2] = Math.min(
          255,
          Math.round(bitmap[input + x + layout.blue] * scale),
        );
      }
      current[x + 3] = a;
    }
    for (let x = 0; x < stride; x++)
      rows[output + 1 + x] = (current[x] - previous[x]) & 255;
    [previous, current] = [current, previous];
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6; // RGBA, lossless, including transparency.
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("sRGB", Buffer.from([0])),
    chunk("IDAT", zlib.deflateSync(rows, { level: 1 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function createEncoder(nativeImage) {
  // NativeImage bitmap channel order is platform-dependent. Probe it rather
  // than assuming BGRA, and fall back if the runtime uses an unknown layout.
  const sample = nativeImage
    .createFromBuffer(encode(Buffer.from([200, 100, 50, 128]), 1, 1))
    .toBitmap();
  let layout;
  for (const red of [0, 2]) {
    for (const premultiplied of [false, true]) {
      const scale = premultiplied ? 128 / 255 : 1;
      if (
        sample.length === 4 &&
        sample[3] === 128 &&
        Math.abs(sample[red] - 200 * scale) <= 1 &&
        Math.abs(sample[1] - 100 * scale) <= 1 &&
        Math.abs(sample[2 - red] - 50 * scale) <= 1
      )
        layout = { red, blue: 2 - red, premultiplied };
    }
  }
  return (image) => {
    if (!layout) return image.toPNG();
    const size = image.getSize();
    const bitmap = image.toBitmap();
    if (bitmap.length !== size.width * size.height * 4) return image.toPNG();
    return encode(bitmap, size.width, size.height, layout);
  };
}
module.exports = { encode, createEncoder };
