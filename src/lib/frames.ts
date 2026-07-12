/**
 * 하객 스냅 웨딩 프레임 (GS-7).
 * 업로드 전에 사진 위에 프레임/서명을 canvas 로 합성한다.
 * 외부 이미지 에셋 없이 canvas 프리미티브만 사용 → CSP·용량 부담 없음.
 * canvas 재인코딩으로 EXIF(위치정보 등)도 함께 제거된다.
 */
export type FrameId = "none" | "polaroid" | "film" | "gold";

export interface FrameOption {
  id: FrameId;
  label: string;
}

export const FRAMES: FrameOption[] = [
  { id: "none", label: "원본" },
  { id: "polaroid", label: "폴라로이드" },
  { id: "film", label: "필름" },
  { id: "gold", label: "골드 프레임" },
];

const CREAM = "#f7f2ea";
const INK = "#5b5347";
const GOLD = "#c8a96a";

/** 서명 문구용 폰트 스택 (한글 안전) */
const SERIF = '"Nanum Myeongjo", "Apple SD Gothic Neo", "Malgun Gothic", serif';

/**
 * 사진에 프레임을 입혀 새 JPEG File 로 반환.
 * @param signature 하단 서명 (예: "성근영 ♥ 김아영 · 26.10.18")
 */
export async function applyFrame(
  file: File,
  frame: FrameId,
  signature: string,
  maxDim = 1600,
  quality = 0.85
): Promise<File> {
  if (frame === "none") return file;
  try {
    const bmp = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const pw = Math.round(bmp.width * scale);
    const ph = Math.round(bmp.height * scale);
    const unit = Math.max(pw, ph);

    const canvas = document.createElement("canvas");
    let cw = pw;
    let ch = ph;
    let ox = 0;
    let oy = 0;

    if (frame === "polaroid") {
      const border = Math.round(unit * 0.045);
      const bottom = Math.round(unit * 0.17);
      cw = pw + border * 2;
      ch = ph + border * 2 + bottom;
      ox = border;
      oy = border;
    }
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    if (frame === "polaroid") {
      ctx.fillStyle = CREAM;
      ctx.fillRect(0, 0, cw, ch);
    }
    ctx.drawImage(bmp, ox, oy, pw, ph);

    if (frame === "polaroid") {
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${Math.round(unit * 0.042)}px ${SERIF}`;
      const cy = oy + ph + (ch - (oy + ph)) / 2;
      ctx.fillText(signature, cw / 2, cy);
    } else if (frame === "gold") {
      const inset = Math.round(unit * 0.03);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = Math.max(2, Math.round(unit * 0.006));
      ctx.strokeRect(inset, inset, pw - inset * 2, ph - inset * 2);
      ctx.lineWidth = Math.max(1, Math.round(unit * 0.002));
      const inset2 = inset + Math.round(unit * 0.018);
      ctx.strokeRect(inset2, inset2, pw - inset2 * 2, ph - inset2 * 2);
      // 하단 서명 (반투명 바)
      const barH = Math.round(unit * 0.09);
      ctx.fillStyle = "rgba(20,18,14,0.42)";
      ctx.fillRect(0, ph - barH, pw, barH);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${Math.round(unit * 0.038)}px ${SERIF}`;
      ctx.fillText(signature, pw / 2, ph - barH / 2);
    } else if (frame === "film") {
      // 상하 검정 바 + 스프로킷 홀
      const barH = Math.round(ph * 0.11);
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, pw, barH);
      ctx.fillRect(0, ph - barH, pw, barH);
      const hole = Math.round(barH * 0.38);
      const gap = hole * 1.8;
      ctx.fillStyle = "#f4f4f4";
      for (let x = gap / 2; x + hole < pw; x += gap) {
        const r = Math.round(hole * 0.18);
        roundRect(ctx, x, (barH - hole) / 2, hole, hole, r);
        roundRect(ctx, x, ph - barH + (barH - hole) / 2, hole, hole, r);
      }
      // 하단 바 위 서명
      ctx.fillStyle = "#fff";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.font = `${Math.round(ph * 0.045)}px ${SERIF}`;
      ctx.fillText(signature, pw - Math.round(pw * 0.04), ph - barH - Math.round(ph * 0.05));
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-frame.jpg", {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
