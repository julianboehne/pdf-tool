'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultPanel } from './ResultPanel';
import { SingleFilePicker } from './SingleFilePicker';
import { useSingleFile } from './useSingleFile';
import { useToolRun } from './useToolRun';
import { applyPageOps, normaliseAngle } from '@/lib/pdf/organize';
import { renderThumbnails } from '@/lib/pdf/render';
import { toPdfToolError, type PdfToolErrorKey } from '@/lib/pdf/errors';
import { suffixFilename } from '@/lib/download';
import type { PdfResult } from '@/lib/pdf/types';

interface PageItem {
  /** Stable across reordering — the original page position. */
  sourceIndex: number;
  dataUrl: string;
  rotation: number;
  selected: boolean;
}

export function OrganizeTool() {
  const t = useTranslations('tools.organize');
  const tc = useTranslations('common');
  const te = useTranslations('errors');

  const { file, pageCount, loadError, select, clear } = useSingleFile();
  const { state, progress, run, reset, isBusy } = useToolRun<PdfResult[]>();

  const [pages, setPages] = useState<PageItem[]>([]);
  const [thumbProgress, setThumbProgress] = useState({ done: 0, total: 0 });
  const [thumbError, setThumbError] = useState<PdfToolErrorKey | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!file) {
      setPages([]);
      return;
    }

    let cancelled = false;
    setIsRendering(true);
    setThumbError(null);

    renderThumbnails(file.bytes, 240, (done, total) => {
      if (!cancelled) setThumbProgress({ done, total });
    })
      .then((thumbnails) => {
        if (cancelled) return;
        setPages(
          thumbnails.map((thumb) => ({
            sourceIndex: thumb.pageIndex,
            dataUrl: thumb.dataUrl,
            rotation: 0,
            selected: false,
          })),
        );
      })
      .catch((error) => {
        if (!cancelled) setThumbError(toPdfToolError(error).key);
      })
      .finally(() => {
        if (!cancelled) setIsRendering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const update = useCallback(
    (index: number, patch: Partial<PageItem>) =>
      setPages((current) =>
        current.map((page, i) => (i === index ? { ...page, ...patch } : page)),
      ),
    [],
  );

  const move = useCallback(
    (from: number, to: number) =>
      setPages((current) => {
        if (to < 0 || to >= current.length || from === to) return current;
        const next = [...current];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
      }),
    [],
  );

  const startOver = () => {
    clear();
    reset();
    setPages([]);
  };

  const selectedCount = pages.filter((page) => page.selected).length;
  const isModified =
    pages.length !== (pageCount ?? 0) ||
    pages.some((page, i) => page.sourceIndex !== i || page.rotation !== 0);

  const save = (subset: PageItem[], suffix: string) =>
    run(async () => [
      {
        name: suffixFilename(file!.name, suffix),
        bytes: await applyPageOps(
          file!.bytes,
          subset.map((page) => ({
            sourceIndex: page.sourceIndex,
            rotation: page.rotation,
          })),
        ),
      },
    ]);

  if (state.status === 'done') {
    return (
      <ResultPanel
        results={state.result}
        zipName="pages.zip"
        onReset={startOver}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SingleFilePicker
        file={file}
        pageCount={pageCount}
        onSelect={select}
        onClear={startOver}
        disabled={isBusy}
      />

      {loadError ? <Alert tone="error">{te(loadError)}</Alert> : null}
      {thumbError ? <Alert tone="error">{te(thumbError)}</Alert> : null}

      {isRendering ? (
        <ProgressBar
          value={thumbProgress.done}
          max={thumbProgress.total}
          label={t('rendering')}
        />
      ) : null}

      {pages.length > 0 ? (
        <>
          <p className="text-xs text-slate-500">{t('gridHint')}</p>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {pages.map((page, index) => (
              <li
                key={page.sourceIndex}
                draggable
                onDragStart={() => setDraggedIndex(index)}
                onDragEnd={() => setDraggedIndex(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggedIndex !== null) move(draggedIndex, index);
                  setDraggedIndex(null);
                }}
                className={[
                  'group relative rounded-lg border bg-white p-2 transition',
                  draggedIndex === index
                    ? 'border-brand-purple opacity-50'
                    : page.selected
                      ? 'border-brand-purple ring-2 ring-brand-purple/20'
                      : 'border-slate-200',
                ].join(' ')}
              >
                <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded bg-slate-100">
                  {/* Thumbnails are client-generated data URLs, so the Next.js
                      image optimiser is bypassed deliberately. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={page.dataUrl}
                    alt={t('pageAlt', { number: page.sourceIndex + 1 })}
                    className="max-h-full max-w-full object-contain transition-transform duration-200"
                    style={{ transform: `rotate(${page.rotation}deg)` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between gap-1">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={page.selected}
                      onChange={(event) =>
                        update(index, { selected: event.target.checked })
                      }
                      aria-label={t('selectPage', {
                        number: page.sourceIndex + 1,
                      })}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-brand-purple"
                    />
                    <span className="tabular-nums">{page.sourceIndex + 1}</span>
                  </label>

                  <span className="flex items-center">
                    <IconButton
                      label={t('rotateLeft')}
                      onClick={() =>
                        update(index, {
                          rotation: normaliseAngle(page.rotation - 90),
                        })
                      }
                    >
                      ↺
                    </IconButton>
                    <IconButton
                      label={t('rotateRight')}
                      onClick={() =>
                        update(index, {
                          rotation: normaliseAngle(page.rotation + 90),
                        })
                      }
                    >
                      ↻
                    </IconButton>
                    <IconButton
                      label={t('deletePage')}
                      onClick={() =>
                        setPages((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    >
                      ✕
                    </IconButton>
                  </span>
                </div>

                <span className="mt-1 flex justify-center gap-1">
                  <IconButton
                    label={t('moveLeft')}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    ◀
                  </IconButton>
                  <IconButton
                    label={t('moveRight')}
                    disabled={index === pages.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    ▶
                  </IconButton>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {state.status === 'error' ? (
        <Alert tone="error">{te(state.error)}</Alert>
      ) : null}

      {isBusy ? (
        <ProgressBar
          value={progress.done}
          max={progress.total}
          label={tc('processing')}
        />
      ) : null}

      {pages.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={isBusy || !isModified} onClick={() => save(pages, 'organized')}>
            {t('applyAction')}
          </Button>
          <Button
            variant="secondary"
            disabled={isBusy || selectedCount === 0}
            onClick={() =>
              save(
                pages.filter((page) => page.selected),
                'extract',
              )
            }
          >
            {t('extractAction', { count: selectedCount })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className="rounded p-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
