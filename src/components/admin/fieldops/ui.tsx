"use client";

/** 현장 운영 탭 소형 표시 컴포넌트 */

export function Metric({
  label,
  value,
  sub,
  strong,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div className={`border p-2 text-center bg-white ${strong ? "border-sage-600" : "border-wedding-gold/15"}`}>
      <p className="text-[10px] text-neutral-400">{label}</p>
      <p className={`text-sm font-bold ${warn ? "text-amber-600" : "text-sage-700"}`}>{value}</p>
      {sub && <p className="text-[10px] text-neutral-400">{sub}</p>}
    </div>
  );
}

export function ActionBtn({
  children,
  onClick,
  primary,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1.5 text-[11px] border rounded-md disabled:opacity-40 ${
        primary
          ? "bg-sage-700 text-white border-sage-700"
          : danger
            ? "text-red-500 border-red-200"
            : "text-neutral-500 border-wedding-gold/25"
      }`}
    >
      {children}
    </button>
  );
}
