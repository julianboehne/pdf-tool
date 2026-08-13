'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Dropzone } from '@/components/ui/Dropzone';
import { formatBytes } from '@/lib/format';
import type { PdfSource } from '@/lib/pdf/types';

/**
 * Single-document picker used by every tool except merge: shows the dropzone
 * until a file is chosen, then a compact summary with a way back.
 */
export function SingleFilePicker({
  file,
  pageCount,
  onSelect,
  onClear,
  disabled,
}: {
  file: PdfSource | null;
  pageCount?: number;
  onSelect: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations('fileList');
  const locale = useLocale();

  if (!file) {
    return <Dropzone onFiles={(files) => onSelect(files[0])} disabled={disabled} />;
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800">
          {file.name}
        </span>
        <span className="block text-xs text-slate-500">
          {formatBytes(file.size, locale)}
          {pageCount !== undefined ? ` · ${t('pages', { count: pageCount })}` : ''}
        </span>
      </span>

      <button
        type="button"
        onClick={onClear}
        disabled={disabled}
        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
      >
        {t('change')}
      </button>
    </div>
  );
}
