import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { notifyChannel } from "@/lib/notifyChannel";

/**
 * 관리자 알림 채널 연결 상태 (AD-4).
 *
 * 경로 이름은 `kakao-status` 그대로 둔다 — 채널이 바뀌었다고 주소를 바꾸면
 * 배포 중 잠깐 어드민이 상태를 못 읽는다. 응답에 `channel` 을 담아 구분한다.
 * (예식 후 정리할 때 이름을 `notify-status` 로 바꾸는 게 맞다)
 *
 * `status` 는 채널별 의미가 다르다:
 *   카카오   ok | expired | unconfigured   (expired = refresh token 재발급 필요)
 *   텔레그램 ok | error | unconfigured     (error = 봇 토큰이 잘못됐거나 봇이 없음)
 * 간격 제한으로 확인을 건너뛴 경우 null (= "이번엔 모름").
 */
export async function GET(req: Request) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = await notifyChannel.health();
  return NextResponse.json({ status, channel: notifyChannel.name });
}
