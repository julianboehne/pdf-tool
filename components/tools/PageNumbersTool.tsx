'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Select, Slider, TextInput } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { LivePreview } from './LivePreview';
import { ResultPanel } from './ResultPanel';
import { SingleFilePicker } from './SingleFilePicker';
import { ToolCard } from './ToolLayout';
import { useSingleFile } from './useSingleFile';
import { useToolRun } from './useToolRun';
import {
  addPageNumbers,
  type NumberFormat,
  type NumberPosition,
} from '@/lib/pdf/pageNumbers';
import { extractPages } from '@/lib/pdf/organize';
import { suffixFilename } from '@/lib/download';
import type { PdfResult } from '@/lib/pdf/types';

const POSITIONS: NumberPosition[] = [
  'bottom-center',
  'bottom-right',
  'bottom-left',
  'top-center',
  'top-right',
  'top-left',
];

export function PageNumbersTool() {
  const t = useTranslations('tools.page-numbers');
  const tc = useTranslations('common');
  const te = useTranslations('errors');

  const { file, pageCount, loadError, select, clear } = useSingleFile();
  const { state, progress, run, reset, isBusy } = useToolRun<PdfResult[]>();

  const [position, setPosition] = useState<NumberPosition>('bottom-center');
  const [format, setFormat] = useState<NumberFormat>('plain');
  const [fontSize, setFontSize] = useState(10);
  const [margin, setMargin] = useState(28);
  const [color, setColor] = useState('#334155');
  const [startAt, setStartAt] = useState(1);
  const [skipFirstPage, setSkipFirstPage] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);

  const words = { page: t('word.page'), of: t('word.of') };

  // Mirrors the numbering maths in lib/pdf/pageNumbers.ts so the preview of a
  // single extracted page shows the number that page will really carry.
  const firstNumbered = skipFirstPage ? 1 : 0;
  const lastNumber = (pageCount ?? 1) - firstNumbered + startAt - 1;
  const numberOnPreviewPage = startAt + (previewPage - firstNumbered);

  const startOver = () => {
    clear();
    reset();
    setPreviewPage(0);
  };

  if (state.status === 'done') {
    return (
      <ResultPanel
        results={state.result}
        zipName="numbered.zip"
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('positionLabel')} htmlFor="pn-position">
                <Select
                  id="pn-position"
                  value={position}
                  onChange={(event) =>
                    setPosition(event.target.value as NumberPosition)
                  }
                  disabled={isBusy}
                >
                  {POSITIONS.map((value) => (
                    <option key={value} value={value}>
                      {t(`position.${value}`)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label={t('formatLabel')} htmlFor="pn-format">
                <Select
                  id="pn-format"
                  value={format}
                  onChange={(event) =>
                    setFormat(event.target.value as NumberFormat)
                  }
                  disabled={isBusy}
                >
                  <option value="plain">{t('format.plain')}</option>
                  <option value="ofTotal">{t('format.ofTotal')}</option>
                  <option value="pageOfTotal">{t('format.pageOfTotal')}</option>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('sizeLabel')} htmlFor="pn-size">
                <Slider
                  id="pn-size"
                  min={6}
                  max={24}
                  step={1}
                  value={fontSize}
                  valueLabel={`${fontSize} pt`}
                  onChange={(event) => setFontSize(Number(event.target.value))}
                  disabled={isBusy}
                />
              </Field>

              <Field
                label={t('marginLabel')}
                hint={t('marginHint')}
                htmlFor="pn-margin"
              >
                <Slider
                  id="pn-margin"
                  min={8}
                  max={72}
                  step={2}
                  value={margin}
                  valueLabel={`${margin} pt`}
                  onChange={(event) => setMargin(Number(event.target.value))}
                  disabled={isBusy}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('startLabel')} htmlFor="pn-start">
                <TextInput
                  id="pn-start"
                  type="number"
                  min={0}
                  value={startAt}
                  onChange={(event) =>
                    setStartAt(Math.max(0, Number(event.target.value) || 0))
                  }
                  disabled={isBusy}
                />
              </Field>

              <Field label={t('colorLabel')} htmlFor="pn-color">
                <input
                  id="pn-color"
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  disabled={isBusy}
                  className="h-10 w-20 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
                />
              </Field>
            </div>

            <Checkbox
              label={t('skipFirstLabel')}
              checked={skipFirstPage}
              onChange={(event) => setSkipFirstPage(event.target.checked)}
              disabled={isBusy}
            />
          </div>
        </ToolCard>
      ) : null}

      {file && pageCount ? (
        <LivePreview
          bytes={file.bytes}
          pageCount={pageCount}
          pageIndex={previewPage}
          onPageIndexChange={setPreviewPage}
          disabled={isBusy}
          signature={JSON.stringify({
            position,
            format,
            fontSize,
            margin,
            color,
            startAt,
            skipFirstPage,
          })}
          apply={async (bytes) => {
            const single = await extractPages(bytes, [previewPage]);

            // Pages before the first numbered one stay blank.
            if (previewPage < firstNumbered) return single;

            return addPageNumbers(single, {
              position,
              format,
              fontSize,
              margin,
              color,
              startAt: numberOnPreviewPage,
              skipFirstPage: false,
              words,
              totalOverride: lastNumber,
            });
          }}
        />
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
            run(async () => [
              {
                name: suffixFilename(file!.name, 'numbered'),
                bytes: await addPageNumbers(file!.bytes, {
                  position,
                  format,
                  fontSize,
                  margin,
                  color,
                  startAt,
                  skipFirstPage,
                  words,
                }),
              },
            ])
          }
        >
          {t('action')}
        </Button>
      </div>
    </div>
  );
}
