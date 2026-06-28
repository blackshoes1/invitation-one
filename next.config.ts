import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 같은 와이파이의 휴대폰 등에서 dev 서버 접속 허용 (LAN 대역)
  allowedDevOrigins: ["192.168.0.148", "192.168.0.0/24"],
};

export default nextConfig;
