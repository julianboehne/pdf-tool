'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface DropzoneProps {
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export function Dropzone({ multiple = false, onFiles, disabled }: DropzoneProps) {
  const t = useTranslations('dropzone');
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);

  const accept = useCallback(
    (list: FileList | null) => {
      if (!list) return;

      const pdfs = Array.from(list).filter(
        (file) =>
          file.type === 'application/pdf' || /\.pdf$/i.test(file.name),
      );

      if (pdfs.length > 0) onFiles(multiple ? pdfs : pdfs.slice(0, 1));
    },
    [multiple, onFiles],
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsOver(false);
        if (!disabled) accept(event.dataTransfer.files);
      }}
      className={[
        'rounded-xl border-2 border-dashed p-8 text-center transition',
        disabled
          ? 'border-slate-200 bg-slate-50 opacity-60'
          : isOver
            ? 'border-brand-purple bg-brand-purple/5'
            : 'border-slate-300 bg-white hover:border-brand-purple/60 hover:bg-slate-50',
      ].join(' ')}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="application/pdf,.pdf"
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          accept(event.target.files);
          // Allows re-selecting the same file after it was removed.
          event.target.value = '';
        }}
      />

      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="mx-auto h-10 w-10 text-slate-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 16.5V4.5m0 0L8.25 8.25M12 4.5l3.75 3.75M3 15.75v2.25A2.25 2.25 0 0 0 5.25 20.25h13.5A2.25 2.25 0 0 0 21 18v-2.25"
        />
      </svg>

      <label
        htmlFor={inputId}
        className="mt-4 inline-block cursor-pointer rounded-lg bg-gradient-brand px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
      >
        {multiple ? t('chooseFiles') : t('chooseFile')}
      </label>

      <p className="mt-3 text-sm text-slate-500">{t('or')}</p>
      <p className="mt-1 text-xs text-slate-400">{t('privacy')}</p>
    </div>
  );
}
