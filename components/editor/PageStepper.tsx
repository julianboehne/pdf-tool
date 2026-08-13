'use client';

import { useTranslations } from 'next-intl';

/** Page navigation shared by the editor and the signing tool. */
export function PageStepper({
  pageIndex,
  pageCount,
  onChange,
  disabled = false,
  /** Pages carrying at least one annotation, marked in the readout. */
  markedPages = [],
}: {
  pageIndex: number;
  pageCount: number;
  onChange: (pageIndex: number) => void;
  disabled?: boolean;
  markedPages?: number[];
}) {
  const t = useTranslations('editor');
  const isMarked = markedPages.includes(pageIndex);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={t('previousPage')}
        disabled={disabled || pageIndex === 0}
        onClick={() => onChange(pageIndex - 1)}
        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
      >
        ◀
      </button>

      <span className="min-w-[6rem] text-center text-xs tabular-nums text-slate-600">
        {t('pageOf', { current: pageIndex + 1, total: pageCount })}
        {isMarked ? (
          <span
            aria-hidden="true"
            className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-purple align-middle"
          />
        ) : null}
      </span>

      <button
        type="button"
        aria-label={t('nextPage')}
        disabled={disabled || pageIndex === pageCount - 1}
        onClick={() => onChange(pageIndex + 1)}
        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
      >
        ▶
      </button>
    </div>
  );
}
