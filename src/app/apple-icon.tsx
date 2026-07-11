import { ImageResponse } from "next/og";

// 홈화면 저장 시 아이콘 (FD-3) — 모노그램. 에셋 없이 생성.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f6f2ea",
          color: "#5f6b52",
          fontSize: 84,
          fontWeight: 600,
          letterSpacing: -2,
        }}
      >
        S<span style={{ color: "#c9a86a", fontSize: 52, margin: "0 2px" }}>♥</span>K
      </div>
    ),
    size
  );
}
