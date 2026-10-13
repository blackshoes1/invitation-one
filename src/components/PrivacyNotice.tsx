import { PRIVACY_RETENTION_LABEL } from "@/lib/privacy";

export default function PrivacyNotice() {
  return <p className="text-xs leading-6 text-neutral-500">연락처·배송지·신청 명단은 {PRIVACY_RETENTION_LABEL}까지 보관합니다. 사진·축하 글은 기념용으로 보존합니다. <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">개인정보 처리 안내</a></p>;
}
