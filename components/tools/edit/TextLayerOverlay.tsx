'use client';

import { useTranslations } from 'next-intl';
import type { TextLine } from '@/lib/pdf/textLayer';

/**
 * Clickable outlines over the text found in the page's text layer.
 *
 * These are not editable in place — PDF content streams cannot be rewritten.
 * Clicking a line covers it and hands back an editable text box, which is why
 * each outline behaves like a button rather than a caret.
 */
export function TextLayerOverlay({
  lines,
  usedIds,
  pageHeightPt,
  scale,
  onPick,
}: {
  lines: TextLine[];
  usedIds: string[];
  pageHeightPt: number;
  scale: number;
  onPick: (line: TextLine) => void;
}) {
  const t = useTranslations('tools.edit');

  return (
    <>
      {lines.map((line) => {
        const used = usedIds.includes(line.id);
        // Ascender-to-descender box around the baseline.
        const top = pageHeightPt - line.baseline - line.fontSize * 1.05;

        return (
          <button
            key={line.id}
            type="button"
            disabled={used}
            title={line.text}
            aria-label={t('replaceLine', { text: line.text })}
            onClick={(event) => {
              event.stopPropagation();
              onPick(line);
            }}
            className={[
              'absolute rounded-sm border transition',
              used
                ? 'cursor-default border-emerald-400 bg-emerald-300/20'
                : 'border-sky-400/70 bg-sky-300/15 hover:border-sky-500 hover:bg-sky-300/35',
            ].join(' ')}
            style={{
              left: line.x * scale,
              top: top * scale,
              width: line.width * scale,
              height: line.fontSize * 1.3 * scale,
            }}
          />
        );
      })}
    </>
  );
}
