/**
 * 이미지 파일 시그니처(magic bytes) 판별 — 선언된 MIME 만 믿지 않는다 (P0-3).
 * 허용: JPEG · PNG · WebP · HEIC/HEIF(ftyp 브랜드)
 */
export type SniffedImage = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

export const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"]);

export function sniffImage(buf: Uint8Array): SniffedImage | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  )
    return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...buf.subarray(from, to));
  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 12 && ascii(4, 8) === "ftyp" && HEIC_BRANDS.has(ascii(8, 12))) return "image/heic";
  return null;
}

export const EXT_BY_MIME: Record<SniffedImage, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};
