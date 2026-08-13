'use client';

import type { ReactNode } from 'react';

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

const CONTROL =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'shadow-sm outline-none transition focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20 ' +
  'disabled:bg-slate-100 disabled:text-slate-500';

export const controlClass = CONTROL;

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ''}`} />;
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ''}`} />;
}

export function Checkbox({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
      <input
        type="checkbox"
        {...props}
        className="h-4 w-4 rounded border-slate-300 text-brand-purple focus:ring-brand-purple/30"
      />
      {label}
    </label>
  );
}

export function Slider({
  valueLabel,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { valueLabel: string }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        {...props}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-brand-purple"
      />
      <span className="w-16 shrink-0 text-right text-sm tabular-nums text-slate-600">
        {valueLabel}
      </span>
    </div>
  );
}
