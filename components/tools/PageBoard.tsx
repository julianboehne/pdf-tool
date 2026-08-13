'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { normaliseAngle } from '@/lib/pdf/organize';

/** One tile on the board. `key` stays stable across reordering. */
export interface BoardPage {
  key: string;
  sourceId: string;
  sourceIndex: number;
  rotation: number;
  selected: boolean;
  dataUrl: string;
}

export interface SourceBadge {
  label: string;
  /** Tailwind classes for the badge chip. */
  className: string;
}

interface PageBoardProps {
  pages: BoardPage[];
  onChange: (pages: BoardPage[]) => void;
  /** Per-source chip, used by merge to show which file a page came from. */
  badges?: Record<string, SourceBadge>;
  /** Selection drives "extract"; merge has no use for it. */
  showSelect?: boolean;
  disabled?: boolean;
}

/**
 * Visual page grid shared by merge and organize: drag to reorder, rotate,
 * delete, optionally select.
 *
 * Every pointer action has a button equivalent — drag-and-drop alone is not
 * keyboard operable and would fail the WCAG baseline from spec section 6.
 */
export function PageBoard({
  pages,
  onChange,
  badges,
  showSelect = false,
  disabled = false,
}: PageBoardProps) {
  const t = useTranslations('board');
  const [draggedKey, setDraggedKey] = useState<string | null>(null);

  const move = (from: number, to: number) => {
    if (disabled || to < 0 || to >= pages.length || from === to) return;
    const next = [...pages];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const update = (index: number, patch: Partial<BoardPage>) =>
    onChange(pages.map((page, i) => (i === index ? { ...page, ...patch } : page)));

  const remove = (index: number) =>
    onChange(pages.filter((_, i) => i !== index));

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {pages.map((page, index) => {
        const badge = badges?.[page.sourceId];

        return (
          <li
            key={page.key}
            draggable={!disabled}
            onDragStart={() => setDraggedKey(page.key)}
            onDragEnd={() => setDraggedKey(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!draggedKey) return;
              move(
                pages.findIndex((candidate) => candidate.key === draggedKey),
                index,
              );
              setDraggedKey(null);
            }}
            className={[
              'group relative rounded-lg border bg-white p-2 transition',
              disabled ? 'opacity-60' : 'cursor-grab active:cursor-grabbing',
              draggedKey === page.key
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

              <span className="absolute left-1 top-1 flex items-center gap-1">
                {badge ? (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${badge.className}`}
                    title={t('fromFile', { name: badge.label })}
                  >
                    {badge.label}
                  </span>
                ) : null}
                <span className="rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-white">
                  {index + 1}
                </span>
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between gap-1">
              {showSelect ? (
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={page.selected}
                    disabled={disabled}
                    onChange={(event) =>
                      update(index, { selected: event.target.checked })
                    }
                    aria-label={t('selectPage', { number: page.sourceIndex + 1 })}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-brand-purple"
                  />
                  <span className="tabular-nums">{page.sourceIndex + 1}</span>
                </label>
              ) : (
                <span className="text-xs tabular-nums text-slate-500">
                  {t('sourcePage', { number: page.sourceIndex + 1 })}
                </span>
              )}

              <span className="flex items-center">
                <TileButton
                  label={t('rotateLeft')}
                  disabled={disabled}
                  onClick={() =>
                    update(index, { rotation: normaliseAngle(page.rotation - 90) })
                  }
                >
                  ↺
                </TileButton>
                <TileButton
                  label={t('rotateRight')}
                  disabled={disabled}
                  onClick={() =>
                    update(index, { rotation: normaliseAngle(page.rotation + 90) })
                  }
                >
                  ↻
                </TileButton>
                <TileButton
                  label={t('deletePage')}
                  disabled={disabled}
                  onClick={() => remove(index)}
                >
                  ✕
                </TileButton>
              </span>
            </div>

            <span className="mt-1 flex justify-center gap-1">
              <TileButton
                label={t('moveLeft')}
                disabled={disabled || index === 0}
                onClick={() => move(index, index - 1)}
              >
                ◀
              </TileButton>
              <TileButton
                label={t('moveRight')}
                disabled={disabled || index === pages.length - 1}
                onClick={() => move(index, index + 1)}
              >
                ▶
              </TileButton>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TileButton({
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

/** Distinct chip colours so merge sources stay tellable apart at a glance. */
export const SOURCE_BADGE_CLASSES = [
  'bg-violet-600 text-white',
  'bg-sky-600 text-white',
  'bg-emerald-600 text-white',
  'bg-amber-600 text-white',
  'bg-rose-600 text-white',
  'bg-cyan-700 text-white',
  'bg-fuchsia-600 text-white',
  'bg-slate-700 text-white',
];
