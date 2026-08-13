'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultPanel } from './ResultPanel';
import { SingleFilePicker } from './SingleFilePicker';
import { ToolCard } from './ToolLayout';
import { useSingleFile } from './useSingleFile';
import { useToolRun } from './useToolRun';
import { splitPdf, type SplitMode } from '@/lib/pdf/split';
import type { PdfResult } from '@/lib/pdf/types';

export function SplitTool() {
  const t = useTranslations('tools.split');
  const tc = useTranslations('common');
  const te = useTranslations('errors');

  const { file, pageCount, loadError, select, clear } = useSingleFile();
  const { state, progress, run, reset, isBusy } = useToolRun<PdfResult[]>();

  const [mode, setMode] = useState<SplitMode>('ranges');
  const [ranges, setRanges] = useState('1-1');
  const [chunkSize, setChunkSize] = useState(1);

  const startOver = () => {
    clear();
    reset();
  };

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
                <option value="ranges">{t('mode.ranges')}</option>
                <option value="everyN">{t('mode.everyN')}</option>
                <option value="single">{t('mode.single')}</option>
              </Select>
            </Field>

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
                />
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

            {mode === 'single' ? (
              <p className="text-sm text-slate-600">
                {t('singleHint', { count: pageCount })}
              </p>
            ) : null}
          </div>
        </ToolCard>
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
          disabled={!file || !pageCount || isBusy}
          onClick={() =>
            run((onProgress) =>
              splitPdf(
                file!.bytes,
                file!.name,
                { mode, ranges, chunkSize },
                onProgress,
              ),
            )
          }
        >
          {t('action')}
        </Button>
      </div>
    </div>
  );
}
