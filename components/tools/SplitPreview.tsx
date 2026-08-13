'use client';

import { useTranslations } from 'next-intl';
import type { PageThumbnail } from '@/lib/pdf/render';

/** Band colours cycle so neighbouring output files never share one. */
const GROUP_STYLES = [
  'border-violet-400 bg-violet-50',
  'border-sky-400 bg-sky-50',
  'border-emerald-400 bg-emerald-50',
  'border-amber-400 bg-amber-50',
  'border-rose-400 bg-rose-50',
  'border-cyan-500 bg-cyan-50',
];

interface SplitPreviewProps {
  thumbnails: PageThumbnail[];
  /** Groups as returned by `buildGroups` — one per resulting file. */
  groups: number[][];
  /** Zero-based indices after which a cut sits. Only set in visual mode. */
  cuts?: number[];
  /** Omitted in the non-visual modes, where the grid is read-only. */
  onToggleCut?: (afterPageIndex: number) => void;
  disabled?: boolean;
}

/**
 * Shows every page with its output file colour-banded, and — in visual mode —
 * a clickable scissors marker in each gap. What the user sees is exactly what
 * `splitPdf` will produce, because both read the same groups.
 */
export function SplitPreview({
  thumbnails,
  groups,
  cuts = [],
  onToggleCut,
  disabled = false,
}: SplitPreviewProps) {
  const t = useTranslations('split-preview');

  // Page index → position of its group, for banding and labels.
  const groupOfPage = new Map<number, number>();
  groups.forEach((group, groupIndex) =>
    group.forEach((pageIndex) => groupOfPage.set(pageIndex, groupIndex)),
  );

  const cutSet = new Set(cuts);
  const isInteractive = Boolean(onToggleCut) && !disabled;

  return (
    <div className="flex flex-wrap items-stretch gap-y-4">
      {thumbnails.map((thumb, position) => {
        const groupIndex = groupOfPage.get(thumb.pageIndex);
        const style =
          groupIndex === undefined
            ? 'border-slate-200 bg-slate-50'
            : GROUP_STYLES[groupIndex % GROUP_STYLES.length];

        const isLast = position === thumbnails.length - 1;
        const hasCut = cutSet.has(thumb.pageIndex);

        return (
          <div key={thumb.pageIndex} className="flex items-stretch">
            <figure
              className={`w-28 rounded-lg border-2 p-1.5 transition ${style} ${
                groupIndex === undefined ? 'opacity-40' : ''
              }`}
            >
              <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumb.dataUrl}
                  alt={t('pageAlt', { number: thumb.pageIndex + 1 })}
                  className="max-h-full max-w-full object-contain"
                />
              </div>

              <figcaption className="mt-1 flex items-center justify-between px-0.5 text-[10px] text-slate-600">
                <span className="tabular-nums">{thumb.pageIndex + 1}</span>
                {groupIndex === undefined ? (
                  <span>{t('excluded')}</span>
                ) : (
                  <span className="font-semibold">
                    {t('fileNumber', { number: groupIndex + 1 })}
                  </span>
                )}
              </figcaption>
            </figure>

            {!isLast ? (
              <div className="flex w-8 items-center justify-center">
                {isInteractive ? (
                  <button
                    type="button"
                    onClick={() => onToggleCut!(thumb.pageIndex)}
                    aria-pressed={hasCut}
                    aria-label={
                      hasCut
                        ? t('removeCut', { number: thumb.pageIndex + 1 })
                        : t('addCut', { number: thumb.pageIndex + 1 })
                    }
                    title={
                      hasCut
                        ? t('removeCut', { number: thumb.pageIndex + 1 })
                        : t('addCut', { number: thumb.pageIndex + 1 })
                    }
                    className={[
                      'flex h-16 w-6 items-center justify-center rounded transition',
                      hasCut
                        ? 'bg-brand-purple text-white'
                        : 'text-slate-300 hover:bg-slate-100 hover:text-slate-600',
                    ].join(' ')}
                  >
                    <span className="text-sm leading-none">✂</span>
                  </button>
                ) : (
                  <span
                    aria-hidden="true"
                    className={`h-16 w-px ${
                      hasCut || groupOfPage.get(thumb.pageIndex) !==
                        groupOfPage.get(thumbnails[position + 1].pageIndex)
                        ? 'bg-slate-400'
                        : 'bg-transparent'
                    }`}
                  />
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
