"use client";

export default function Q({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-xl font-extrabold text-neutral-800 leading-snug">
          {title}
        </h2>
        {sub && <p className="text-sm text-neutral-500">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
