import {
  sendToMe,
  isKakaoConfigured,
  kakaoTokenStatusThrottled,
  type KakaoTokenStatus,
} from "@/lib/kakao";
import {
  sendToAdmin,
  isTelegramConfigured,
  telegramStatus,
  type TelegramStatus,
} from "@/lib/telegram";

/**
 * 관리자 알림 채널 — 아웃박스 드레인(`notifyOutbox.ts`)이 쓰는 발송 어댑터.
 *
 * 아웃박스 파이프라인(트리거 → 원자 클레임 → 스테일 락 회수 → 지수 백오프 →
 * 5분 pg_cron 안전망)은 두 번의 장애를 거쳐 다듬은 부분이라 그대로 두고,
 * **발송하는 쪽만** 여기서 갈아끼운다.
 *
 * 채널 선택은 환경변수만 보고 결정한다 — 설정 화면을 새로 만들지 않는다:
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID 있으면  → 텔레그램
 *   없고 KAKAO_* 가 있으면                        → 카카오 (기존 동작)
 *   둘 다 없으면                                  → 미설정
 *
 * 이 순서 덕분에 전환이 안전하다. 텔레그램 환경변수를 넣는 순간 그쪽으로 넘어가고,
 * 문제가 있으면 그 변수만 지우면 카카오로 되돌아온다. 배포 롤백이 필요 없다.
 *
 * 두 채널로 **동시에** 보내지는 않는다. 한쪽이 계속 실패해도 다른 쪽이 성공하면
 * 아웃박스 행이 'sent' 가 되어 고장이 가려지기 때문이다 (docs/PROMPT_TELEGRAM_NOTIFY.md B안).
 */
export type ChannelStatus = TelegramStatus | KakaoTokenStatus;

export interface NotifyChannel {
  /** 로그·상태 표시용 이름 */
  readonly name: "telegram" | "kakao" | "none";
  /** 보낼 수 있는 상태인가 — false 면 드레인은 클레임조차 하지 않는다 */
  readonly configured: boolean;
  send(text: string): Promise<{ ok: boolean; skipped?: boolean; error?: string }>;
  /**
   * 보낼 게 없을 때의 연결 점검. 확인을 건너뛰었으면 null.
   * (카카오는 토큰을 살려두는 의미가 있어 3시간 간격 제한이 걸려 있다)
   */
  health(): Promise<ChannelStatus | null>;
}

const telegram: NotifyChannel = {
  name: "telegram",
  configured: isTelegramConfigured,
  send: sendToAdmin,
  health: telegramStatus,
};

const kakao: NotifyChannel = {
  name: "kakao",
  configured: isKakaoConfigured,
  send: sendToMe,
  health: kakaoTokenStatusThrottled,
};

const none: NotifyChannel = {
  name: "none",
  configured: false,
  send: async () => ({ ok: true, skipped: true }),
  health: async () => "unconfigured",
};

/** 지금 쓰이는 채널 (모듈 로드 시 환경변수로 확정) */
export const notifyChannel: NotifyChannel = isTelegramConfigured
  ? telegram
  : isKakaoConfigured
    ? kakao
    : none;
