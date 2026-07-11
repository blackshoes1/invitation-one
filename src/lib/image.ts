/**
 * 업로드 전 브라우저 리사이즈/압축.
 * - Vercel 요청 본문 한도(4.5MB) 대응 + 페이지 로딩 최적화
 * - canvas 재인코딩 과정에서 EXIF(위치정보 등) 메타데이터가 제거됨 → 프라이버시 보호
 * 실패(HEIC 미지원 등) 시 원본 그대로 반환.
 */
export async function compressImage(
  file: File,
  maxDim = 2000,
  quality = 0.85
): Promise<File> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}
