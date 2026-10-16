import Link from "next/link";
import { PRIVACY_POLICY_VERSION, PRIVACY_RETENTION_LABEL } from "@/lib/privacy";

export default function PrivacyPage() {
  return <main className="mx-auto max-w-xl space-y-7 px-6 py-12 font-sans text-sage-800">
    <h1 className="font-serif text-2xl">개인정보 처리 안내</h1>
    <p className="text-sm leading-relaxed">성근영·김아영의 청첩장 전달, 참석·체크인과 본인 확인을 위해 필요한 정보를 처리합니다.</p>
    <section className="space-y-2"><h2 className="font-semibold">수집하는 정보와 목적</h2>
      <p className="text-sm leading-relaxed">성함·전화번호는 초대장 전달, 신청 확인·변경, 문자 인증에 사용합니다. 신청하신 경우 배송지·전달 일정, 참석 인원·식사 정보와 체크인 기록도 처리합니다. 사전 안내 링크를 열면 최초 열람 시각을, 확인 버튼을 누르면 안내 확인 여부와 최초 확인 시각을 각각 기록합니다. 본인 확인 정보와 관리자 접근 이력은 안전한 운영에 사용합니다.</p></section>
    <section className="space-y-2"><h2 className="font-semibold">보관 기간과 파기</h2>
      <p className="text-sm leading-relaxed">연락처·배송지·신청 명단은 예식 후 30일인 {PRIVACY_RETENTION_LABEL}까지 보관합니다. 이후 신규 수집을 막고, 관리자가 대상과 건수를 확인한 뒤 파기합니다. 기한 이후에도 파기 확인이 완료될 때까지 접근 제한 아래 남을 수 있습니다.</p>
      <p className="text-sm leading-relaxed">사진·축하 글은 기념용으로 보존합니다. 운영 정보를 파기할 때 작성자 표시와 연락처·배송지 연결은 제거합니다. 사진과 글 본문 자체에 담긴 정보는 보존되므로, 해당 내용의 삭제 요청은 별도로 처리합니다.</p>
      <p className="text-sm leading-relaxed">인증번호는 5분, 인증 확인 권한은 10분 동안 유효합니다. 만료된 인증 정보는 정리하며 접근 이력은 최근 30일까지만 보관합니다.</p></section>
    <section className="space-y-2"><h2 className="font-semibold">서비스 제공업체로 전달되는 정보</h2>
      <p className="text-sm leading-relaxed">Vercel은 웹사이트와 서버 요청을, Supabase는 데이터 저장을 처리합니다. 문자 발송 시 솔라피에 수신번호와 문자 내용을 전달합니다. 카카오톡 공유 시 이름과 개인 안내 주소가 공유 메시지에 포함됩니다. 관리자 알림 채널에는 이름·신청 내용·배송 장소 등이 전달될 수 있습니다. DB 파기와 별도로 서비스 업체의 보관 정책 및 관리자에게 내려받은 파일도 확인해 처리합니다.</p></section>
    <section className="space-y-2"><h2 className="font-semibold">조회·정정·삭제 요청</h2>
      <p className="text-sm leading-relaxed">초대장을 보내드린 신랑·신부에게 연락해주세요. 관리자가 본인 확인 후 명단과 관련 신청 정보를 확인해 처리합니다. 문자 인증 안내 확인을 거부할 수 있지만 해당 본인 확인 기능은 이용하기 어렵습니다.</p></section>
    <p className="text-xs text-neutral-500">안내 버전: {PRIVACY_POLICY_VERSION}</p>
    <Link href="/" className="inline-flex min-h-11 items-center text-sm underline">청첩장으로 돌아가기</Link>
  </main>;
}
