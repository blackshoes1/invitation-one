// 도트 마당 배경 그림을 만들어 public/pic/ 에 쓴다(캐릭터 시트는 ingest.mjs 가 만든다).  사용: npm run village:art
// 의존성 없이 Node 만으로 돈다. 시드가 같아 같은 그림이 나오며, 출력되는 픽셀 해시로 확인할 수 있다.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drawGarden } from "./garden.mjs";
import { encodePng } from "./png.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "public", "pic");
mkdirSync(outDir, { recursive: true });

function write(name, { width, height, rgba }) {
  const png = encodePng(width, height, rgba);
  writeFileSync(path.join(outDir, name), png);
  const hash = createHash("sha256").update(rgba).digest("hex");
  console.log(`${name}  ${width}x${height}  ${png.length} bytes  pixel-sha256 ${hash}`);
}

write("village-bg.png", drawGarden());
