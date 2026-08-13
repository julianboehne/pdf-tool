'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { formatBytes } from '@/lib/format';
import type { PdfSource } from '@/lib/pdf/types';

interface FileListProps {
  files: PdfSource[];
  onReorder?: (files: PdfSource[]) => void;
  onRemove: (id: string) => void;
}

/**
 * Ordered file list with drag-and-drop *and* keyboard-operable move buttons —
 * pointer-only reordering would fail the WCAG baseline the spec asks for (6).
 */
export function FileList({ files, onReorder, onRemove }: FileListProps) {
  const t = useTranslations('fileList');
  const locale = useLocale();
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const move = (from: number, to: number) => {
    if (!onReorder || to < 0 || to >= files.length || from === to) return;
    const next = [...files];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onReorder(next);
  };

  return (
    <ul className="flex flex-col gap-2">
      {files.map((file, index) => (
        <li
          key={file.id}
          draggable={Boolean(onReorder)}
          onDragStart={() => setDraggedId(file.id)}
          onDragEnd={() => setDraggedId(null)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (!draggedId) return;
            move(files.findIndex((f) => f.id === draggedId), index);
            setDraggedId(null);
          }}
          className={[
            'flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 transition',
            draggedId === file.id
              ? 'border-brand-purple opacity-50'
              : 'border-slate-200',
            onReorder ? 'cursor-grab active:cursor-grabbing' : '',
          ].join(' ')}
        >
          {onReorder ? (
            <span
              aria-hidden="true"
              className="select-none text-slate-400"
              title={t('dragHint')}
            >
              ⠿
            </span>
          ) : null}

          <span className="w-6 shrink-0 text-center text-xs font-medium tabular-nums text-slate-400">
            {index + 1}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-800">
              {file.name}
            </span>
            <span className="block text-xs text-slate-500">
              {formatBytes(file.size, locale)}
            </span>
          </span>

          {onReorder ? (
            <span className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
                aria-label={t('moveUp', { name: file.name })}
                className="rounded p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(index, index + 1)}
                disabled={index === files.length - 1}
                aria-label={t('moveDown', { name: file.name })}
                className="rounded p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                ▼
              </button>
            </span>
          ) : null}

          <button
            type="button"
            onClick={() => onRemove(file.id)}
            aria-label={t('remove', { name: file.name })}
            className="shrink-0 rounded p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
