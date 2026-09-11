export type PaymentProvider = "kakao" | "toss";

const configuredLinks: Record<PaymentProvider, string | undefined> = {
  kakao: process.env.NEXT_PUBLIC_KAKAO_PAY_URL,
  toss: process.env.NEXT_PUBLIC_TOSS_PAY_URL,
};

/**
 * 환경변수 또는 계좌별 설정에서 안전한 HTTPS 송금 링크만 반환한다.
 * NEXT_PUBLIC 환경변수는 Next.js 빌드 시 브라우저 번들에 포함된다.
 */
export function paymentUrl(
  provider: PaymentProvider,
  accountUrl?: string,
): string | undefined {
  const value = accountUrl || configuredLinks[provider];
  if (!value) return undefined;

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
