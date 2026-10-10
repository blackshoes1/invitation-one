// ChatGPT 가 그린 정원 예식장 배경(village-src/background.png)을 @2x 배경(public/pic/village-bg.webp)으로 바꾼다.  사용: npm run village:bg
// 원본은 저장소에 넣지 않는다(village-src/ 는 .gitignore). sharp 는 Next 가 깔아 둔 것을 쓴다.
// 원본 비율이 바뀌면 출력 높이도 바뀌므로 src/lib/villageSim.ts 의 WORLD_H(= 출력 높이 / 2)와 AREA·신랑신부 자리를 다시 맞춘다
// (안 맞추면 tests/unit/villageBg.test.ts 가 깨진다).
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** 출력 가로 — 논리 세계 가로(384)의 2배 */
export const BG_W = 768;
/** 용량 예산 — 모바일 첫 화면에서 함께 받는 그림이라 400KB 를 넘기지 않는다 */
const LIMIT = 400 * 1024;

/** 원본 비율대로 줄인 출력 높이 — 홀수면 짝수로 올려 논리 높이(÷2)가 정수가 되게 한다 */
export function bgHeightFor(srcW, srcH) {
  const h = Math.round((BG_W * srcH) / srcW);
  return h % 2 === 0 ? h : h + 1;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const src = path.join(root, "village-src", "background.png");
  if (!existsSync(src)) throw new Error(`원본이 없다: ${src}`);
  const { default: sharp } = await import("sharp");
  const { width, height } = await sharp(src).metadata();
  const h = bgHeightFor(width, height);
  // 짝수로 올린 1px 때문에 비율이 아주 조금 달라지므로 fill 로 정확히 맞춘다(왜곡 0.1% 미만)
  const resized = () => sharp(src).resize(BG_W, h, { fit: "fill", kernel: "lanczos3" });
  // 품질을 내려 가며 예산에 맞춘다 — 출력의 q 값을 보고 눈으로 화질을 확인한다
  let out, q;
  for (q of [85, 80, 75, 70]) {
    out = await resized().webp({ quality: q, effort: 6, smartSubsample: true }).toBuffer();
    console.log(`  webp q${q}: ${out.length} bytes`);
    if (out.length <= LIMIT) break;
  }
  if (out.length > LIMIT) throw new Error(`용량 초과: ${out.length} bytes`);
  writeFileSync(path.join(root, "public", "pic", "village-bg.webp"), out);
  console.log(`source ${width}x${height} → village-bg.webp ${BG_W}x${h} (논리 ${BG_W / 2}x${h / 2})  ${out.length} bytes  q${q}`);
}

// import 만으로는 파일을 쓰지 않는다(테스트가 bgHeightFor 를 가져다 쓴다)
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
