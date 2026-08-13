'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { downloadPdf, downloadZip } from '@/lib/download';
import { formatBytes } from '@/lib/format';
import type { PdfResult } from '@/lib/pdf/types';

interface ResultPanelProps {
  results: PdfResult[];
  /** Filename for the bundle when there is more than one result. */
  zipName: string;
  onReset: () => void;
  /** Optional extra line, e.g. the compression ratio. */
  note?: string;
}

export function ResultPanel({
  results,
  zipName,
  onReset,
  note,
}: ResultPanelProps) {
  const t = useTranslations('result');
  const locale = useLocale();

  const totalSize = results.reduce((sum, r) => sum + r.bytes.byteLength, 0);

  return (
    <section className="animate-fade-up rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <h2 className="text-base font-semibold text-emerald-900">
        {t('heading', { count: results.length })}
      </h2>
      <p className="mt-1 text-sm text-emerald-800">
        {note ?? t('summary', { size: formatBytes(totalSize, locale) })}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {results.length === 1 ? (
          <Button
            onClick={() => downloadPdf(results[0].bytes, results[0].name)}
          >
            {t('download')}
          </Button>
        ) : (
          <Button onClick={() => downloadZip(results, zipName)}>
            {t('downloadZip', { count: results.length })}
          </Button>
        )}

        <Button variant="secondary" onClick={onReset}>
          {t('startOver')}
        </Button>
      </div>

      {results.length > 1 ? (
        <ul className="mt-4 flex flex-col gap-1 border-t border-emerald-200 pt-3">
          {results.map((result) => (
            <li
              key={result.name}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="min-w-0 truncate text-emerald-900">
                {result.name}
              </span>
              <button
                type="button"
                onClick={() => downloadPdf(result.bytes, result.name)}
                className="shrink-0 text-xs font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
              >
                {t('download')}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
