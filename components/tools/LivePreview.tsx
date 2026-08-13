'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { renderSinglePage } from '@/lib/pdf/render';
import { toPdfToolError, type PdfToolErrorKey } from '@/lib/pdf/errors';

interface LivePreviewProps {
  bytes: Uint8Array;
  pageCount: number;
  pageIndex: number;
  onPageIndexChange: (pageIndex: number) => void;
  /**
   * Produces the *result* bytes for the single page being previewed. Called
   * with the original document; implementations extract the page first so the
   * preview stays cheap on long documents.
   */
  apply: (bytes: Uint8Array) => Promise<Uint8Array>;
  /**
   * Changes to this string trigger a re-render. Serialise every option that
   * affects the output — `apply` itself is a fresh closure on every render and
   * cannot be a dependency.
   */
  signature: string;
  disabled?: boolean;
}

const DEBOUNCE_MS = 350;

/**
 * True WYSIWYG preview: it runs the real operation and rasterises the result
 * with pdf.js, rather than approximating the output in CSS. What is on screen
 * is what lands in the file.
 */
export function LivePreview({
  bytes,
  pageCount,
  pageIndex,
  onPageIndexChange,
  apply,
  signature,
  disabled = false,
}: LivePreviewProps) {
  const t = useTranslations('preview');

  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<PdfToolErrorKey | null>(null);

  // Always call the newest closure without making it an effect dependency.
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const runId = useRef(0);

  useEffect(() => {
    const currentRun = ++runId.current;
    setIsRendering(true);

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await applyRef.current(bytes);
          const rendered = await renderSinglePage(result, 0, 560);

          if (runId.current !== currentRun) return;
          setDataUrl(rendered.dataUrl);
          setError(null);
        } catch (caught) {
          if (runId.current !== currentRun) return;
          setError(toPdfToolError(caught).key);
        } finally {
          if (runId.current === currentRun) setIsRendering(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      runId.current += 1;
    };
  }, [bytes, pageIndex, signature]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">{t('heading')}</h2>

        {pageCount > 1 ? (
          <div className="flex items-center gap-1">
            <StepButton
              label={t('previousPage')}
              disabled={disabled || pageIndex === 0}
              onClick={() => onPageIndexChange(pageIndex - 1)}
            >
              ◀
            </StepButton>
            <span className="min-w-[5.5rem] text-center text-xs tabular-nums text-slate-600">
              {t('pageOf', { current: pageIndex + 1, total: pageCount })}
            </span>
            <StepButton
              label={t('nextPage')}
              disabled={disabled || pageIndex === pageCount - 1}
              onClick={() => onPageIndexChange(pageIndex + 1)}
            >
              ▶
            </StepButton>
          </div>
        ) : null}
      </div>

      <div className="relative flex justify-center rounded-xl border border-slate-200 bg-slate-100 p-4">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt={t('pageAlt', { number: pageIndex + 1 })}
            className={`max-h-[520px] w-auto rounded shadow-sm transition-opacity ${
              isRendering ? 'opacity-40' : 'opacity-100'
            }`}
          />
        ) : (
          <div className="flex h-64 items-center text-sm text-slate-500">
            {error ? null : t('loading')}
          </div>
        )}

        {isRendering && dataUrl ? (
          <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs text-slate-600 shadow-sm">
            {t('updating')}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="text-xs text-rose-600" role="alert">
          {t('failed')}
        </p>
      ) : null}
    </section>
  );
}

function StepButton({
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
      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
