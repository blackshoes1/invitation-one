/**
 * 배민 느낌의 라인 스쿠터 아이콘 (currentColor)
 * 이모지(🛵) 대신 UI 톤에 맞춰 색을 입힐 수 있는 SVG.
 */
export default function BikeIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* 바퀴 */}
      <circle cx="15" cy="38" r="6" />
      <circle cx="49" cy="38" r="6" />
      {/* 발판 */}
      <path d="M21 38h16" />
      {/* 앞 기둥 + 핸들 */}
      <path d="M37 38l8-22" />
      <path d="M41 16h12" />
      {/* 시트 + 뒷몸체 */}
      <path d="M9 24h14" />
      <path d="M21 24l-2 14" />
      {/* 배달 박스 */}
      <path d="M9 24v-8h10v8" />
    </svg>
  );
}
