/** admin 공용 소형 표시 컴포넌트 */

export function Metric({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div className="bg-white border border-wedding-gold/15 rounded-md px-2 py-3 text-center">
      <p
        className={`text-2xl font-bold ${
          muted ? "text-neutral-400" : "text-sage-700"
        }`}
      >
        {value}
      </p>
      <p className="text-[10px] text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}

export function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`w-3 h-3 rounded-sm ${color}`} /> {label}
    </span>
  );
}
