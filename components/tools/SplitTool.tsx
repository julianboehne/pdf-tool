'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultPanel } from './ResultPanel';
import { SingleFilePicker } from './SingleFilePicker';
import { SplitPreview } from './SplitPreview';
import { ToolCard } from './ToolLayout';
import { usePageThumbnails } from './usePageThumbnails';
import { useSingleFile } from './useSingleFile';
import { useToolRun } from './useToolRun';
import { buildGroups, splitPdf, type SplitMode } from '@/lib/pdf/split';
import { PdfToolError } from '@/lib/pdf/errors';
import type { PdfResult } from '@/lib/pdf/types';

export function SplitTool() {
  const t = useTranslations('tools.split');
  const tb = useTranslations('board');
  const tc = useTranslations('common');
  const te = useTranslations('errors');

  const { file, pageCount, loadError, select, clear } = useSingleFile();
  const { state, progress, run, reset, isBusy } = useToolRun<PdfResult[]>();

  const [mode, setMode] = useState<SplitMode>('visual');
  const [cuts, setCuts] = useState<number[]>([]);
  const [ranges, setRanges] = useState('1-1');
  const [chunkSize, setChunkSize] = useState(1);

  const sources = useMemo(() => (file ? [file] : []), [file]);
  const {
    thumbnails,
    progress: renderProgress,
    isRendering,
    error: renderError,
  } = usePageThumbnails(sources, 180);

  const pageThumbnails = file ? (thumbnails[file.id] ?? []) : [];
  const options = { mode, cuts, ranges, chunkSize };

  /**
   * The preview and the export read the same `buildGroups`, so the bands on
   * screen are the files that will be produced. An unparseable range makes the
   * preview fall back to "no groups" and disables the action button.
   */
  const groups = useMemo(() => {
    if (!pageCount) return null;
    try {
      return buildGroups(pageCount, options);
    } catch (error) {
      if (error instanceof PdfToolError) return null;
      throw error;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCount, mode, cuts, ranges, chunkSize]);

  const startOver = () => {
    clear();
    reset();
    setCuts([]);
  };

  const toggleCut = (afterPageIndex: number) =>
    setCuts((current) =>
      current.includes(afterPageIndex)
        ? current.filter((index) => index !== afterPageIndex)
        : [...current, afterPageIndex].sort((a, b) => a - b),
    );

  if (state.status === 'done') {
    return (
      <ResultPanel
        results={state.result}
        zipName={`${(file?.name ?? 'document').replace(/\.pdf$/i, '')}_split.zip`}
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
        <ToolCard>
          <div className="flex flex-col gap-4">
            <Field label={t('modeLabel')} htmlFor="split-mode">
              <Select
                id="split-mode"
                value={mode}
                onChange={(event) => setMode(event.target.value as SplitMode)}
                disabled={isBusy}
              >
                <option value="visual">{t('mode.visual')}</option>
                <option value="ranges">{t('mode.ranges')}</option>
                <option value="everyN">{t('mode.everyN')}</option>
                <option value="single">{t('mode.single')}</option>
              </Select>
            </Field>

            {mode === 'visual' ? (
              <p className="text-sm text-slate-600">{t('visualHint')}</p>
            ) : null}

            {mode === 'ranges' ? (
              <Field
                label={t('rangesLabel')}
                hint={t('rangesHint', { pages: pageCount })}
                htmlFor="split-ranges"
              >
                <TextInput
                  id="split-ranges"
                  value={ranges}
                  onChange={(event) => setRanges(event.target.value)}
                  placeholder="1-3, 4, 8-"
                  disabled={isBusy}
                  aria-invalid={groups === null}
                />
                {groups === null ? (
                  <p className="text-xs text-rose-600">{te('invalidRange')}</p>
                ) : null}
              </Field>
            ) : null}

            {mode === 'everyN' ? (
              <Field label={t('chunkLabel')} htmlFor="split-chunk">
                <TextInput
                  id="split-chunk"
                  type="number"
                  min={1}
                  max={pageCount}
                  value={chunkSize}
                  onChange={(event) =>
                    setChunkSize(Math.max(1, Number(event.target.value) || 1))
                  }
                  disabled={isBusy}
                />
              </Field>
            ) : null}

            {groups ? (
              <p className="text-sm font-medium text-slate-700">
                {t('resultCount', { count: groups.length })}
              </p>
            ) : null}
          </div>
        </ToolCard>
      ) : null}

      {isRendering ? (
        <ProgressBar
          value={renderProgress.done}
          max={renderProgress.total}
          label={tb('rendering')}
        />
      ) : null}

      {pageThumbnails.length > 0 && groups ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-800">
            {t('previewHeading')}
          </h2>

          <SplitPreview
            thumbnails={pageThumbnails}
            groups={groups}
            cuts={mode === 'visual' ? cuts : undefined}
            onToggleCut={mode === 'visual' ? toggleCut : undefined}
            disabled={isBusy}
          />
        </section>
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

      <div>
        <Button
          disabled={!file || !pageCount || !groups || isBusy}
          onClick={() =>
            run((onProgress) =>
              splitPdf(file!.bytes, file!.name, options, onProgress),
            )
          }
        >
          {t('action')}
        </Button>
      </div>
    </div>
  );
}
