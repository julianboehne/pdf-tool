'use client';

export function ProgressBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className="h-full rounded-full bg-gradient-brand transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      {label ? (
        <p className="text-xs text-slate-500">
          {label} — {percent}%
        </p>
      ) : null}
    </div>
  );
}
