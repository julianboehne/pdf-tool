'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { DraggableBox, type BoxGeometry } from '@/components/editor/DraggableBox';
import { PageStepper } from '@/components/editor/PageStepper';
import { Stage } from '@/components/editor/Stage';
import { useStagePage } from '@/components/editor/useStagePage';
import { ResultPanel } from './ResultPanel';
import { SignaturePad, type SignatureImage } from './SignaturePad';
import { SingleFilePicker } from './SingleFilePicker';
import { ToolCard } from './ToolLayout';
import { useSingleFile } from './useSingleFile';
import { useToolRun } from './useToolRun';
import { applyAnnotations, type ImageAnnotation } from '@/lib/pdf/annotate';
import { suffixFilename } from '@/lib/download';
import type { PdfResult } from '@/lib/pdf/types';

/** Width a freshly placed signature gets, in PDF points (~6 cm). */
const PLACED_WIDTH_PT = 170;

export function SignTool() {
  const t = useTranslations('tools.sign');
  const ts = useTranslations('sign');
  const teditor = useTranslations('editor');
  const tc = useTranslations('common');
  const te = useTranslations('errors');

  const { file, pageCount, loadError, select, clear } = useSingleFile();
  const { state, progress, run, reset, isBusy } = useToolRun<PdfResult[]>();

  const [signature, setSignature] = useState<SignatureImage | null>(null);
  const [placements, setPlacements] = useState<ImageAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  const { page, isRendering, error: renderError } = useStagePage(
    file?.bytes ?? null,
    pageIndex,
  );

  const onPage = placements.filter((item) => item.page === pageIndex);

  const markedPages = useMemo(
    () => [...new Set(placements.map((item) => item.page))],
    [placements],
  );

  const startOver = () => {
    clear();
    reset();
    setSignature(null);
    setPlacements([]);
    setSelectedId(null);
    setPageIndex(0);
  };

  /** Drops the signature where the page was clicked, keeping its proportions. */
  const place = (xPt: number, yPt: number) => {
    if (!signature) return;

    const width = PLACED_WIDTH_PT;
    const height = (signature.height / signature.width) * width;
    const id = `sig-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    setPlacements((current) => [
      ...current,
      {
        id,
        type: 'image',
        page: pageIndex,
        // Centre the signature on the click, which is where the eye expects it.
        x: xPt - width / 2,
        y: yPt - height / 2,
        width,
        height,
        dataUrl: signature.dataUrl,
      },
    ]);

    setSelectedId(id);
  };

  if (state.status === 'done') {
    return (
      <ResultPanel
        results={state.result}
        zipName="signed.zip"
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
      {renderError ? <Alert tone="error">{te(renderError)}</Alert> : null}

      {file && pageCount ? (
        <>
          <ToolCard>
            <h2 className="mb-3 text-sm font-semibold text-slate-800">
              {signature ? t('signatureReady') : t('createHeading')}
            </h2>

            {signature ? (
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex h-20 items-center rounded-lg border border-slate-200 bg-white px-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signature.dataUrl}
                    alt={ts('preview')}
                    className="max-h-14 w-auto"
                  />
                </span>

                <Button
                  variant="secondary"
                  onClick={() => setSignature(null)}
                  disabled={isBusy}
                >
                  {ts('redraw')}
                </Button>
              </div>
            ) : (
              <SignaturePad onCreate={setSignature} disabled={isBusy} />
            )}
          </ToolCard>

          {signature ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <PageStepper
                  pageIndex={pageIndex}
                  pageCount={pageCount}
                  onChange={(next) => {
                    setPageIndex(next);
                    setSelectedId(null);
                  }}
                  disabled={isBusy}
                  markedPages={markedPages}
                />

                <span className="text-xs text-slate-500">
                  {t('placedCount', { count: placements.length })}
                </span>
              </div>

              <p className="text-xs text-slate-500">{t('placeHint')}</p>

              {page ? (
                <Stage
                  dataUrl={page.dataUrl}
                  widthPt={page.widthPt}
                  heightPt={page.heightPt}
                  label={teditor('pageAlt', { number: pageIndex + 1 })}
                  isPlacing
                  onBackgroundClick={place}
                >
                  {(scale) =>
                    onPage.map((item) => (
                      <DraggableBox
                        key={item.id}
                        x={item.x}
                        y={item.y}
                        width={item.width}
                        height={item.height}
                        pageWidthPt={page.widthPt}
                        pageHeightPt={page.heightPt}
                        scale={scale}
                        selected={item.id === selectedId}
                        lockAspect
                        label={ts('placedLabel')}
                        onSelect={() => setSelectedId(item.id)}
                        onChange={(geometry: BoxGeometry) =>
                          setPlacements((current) =>
                            current.map((candidate) =>
                              candidate.id === item.id
                                ? { ...candidate, ...geometry }
                                : candidate,
                            ),
                          )
                        }
                        onDelete={() =>
                          setPlacements((current) =>
                            current.filter((candidate) => candidate.id !== item.id),
                          )
                        }
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.dataUrl}
                          alt=""
                          draggable={false}
                          className="pointer-events-none h-full w-full object-fill"
                        />
                      </DraggableBox>
                    ))
                  }
                </Stage>
              ) : (
                <div className="flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
                  {isRendering ? teditor('loading') : null}
                </div>
              )}
            </>
          ) : null}
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

      {file && signature ? (
        <div>
          <Button
            disabled={placements.length === 0 || isBusy}
            onClick={() =>
              run(async () => [
                {
                  name: suffixFilename(file.name, 'signed'),
                  bytes: await applyAnnotations(file.bytes, placements),
                },
              ])
            }
          >
            {t('action')}
          </Button>

          <p className="mt-2 text-xs text-slate-500">{t('legalNote')}</p>
        </div>
      ) : null}
    </div>
  );
}
