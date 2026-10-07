/** WebP 헤더에서 캔버스 크기를 읽는다 (VP8X / VP8L / VP8 ) — 디코더 없이 시트 규격만 확인하려는 용도 */
export function webpSize(buf: Buffer): { width: number; height: number } {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") throw new Error("not webp");
  const fourcc = buf.toString("ascii", 12, 16);
  if (fourcc === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (fourcc === "VP8L") { const b = buf.readUInt32LE(21); return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) }; }
  if (fourcc === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  throw new Error("unknown webp chunk " + fourcc);
}
