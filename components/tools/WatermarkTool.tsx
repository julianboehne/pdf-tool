'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Select, Slider, TextInput } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultPanel } from './ResultPanel';
import { SingleFilePicker } from './SingleFilePicker';
import { ToolCard } from './ToolLayout';
import { useSingleFile } from './useSingleFile';
import { useToolRun } from './useToolRun';
import { addWatermark, type WatermarkLayout } from '@/lib/pdf/watermark';
import { isWinAnsiEncodable } from '@/lib/pdf/text';
import { parsePageSelection } from '@/lib/pdf/ranges';
import { suffixFilename } from '@/lib/download';
import type { PdfResult } from '@/lib/pdf/types';

export function WatermarkTool() {
  const t = useTranslations('tools.watermark');
  const tc = useTranslations('common');
  const te = useTranslations('errors');

  const { file, pageCount, loadError, select, clear } = useSingleFile();
  const { state, progress, run, reset, isBusy } = useToolRun<PdfResult[]>();

  const [text, setText] = useState('CONFIDENTIAL');
  const [layout, setLayout] = useState<WatermarkLayout>('diagonal');
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.25);
  const [color, setColor] = useState('#7c3aed');
  const [allPages, setAllPages] = useState(true);
  const [ranges, setRanges] = useState('');

  // The standard font silently drops what it cannot encode, so flag it while
  // the user is still typing rather than after a failed run.
  const textIsDrawable = isWinAnsiEncodable(text);

  const startOver = () => {
    clear();
    reset();
  };

  if (state.status === 'done') {
    return (
      <ResultPanel
        results={state.result}
        zipName="watermarked.zip"
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
            <Field label={t('textLabel')} htmlFor="wm-text">
              <TextInput
                id="wm-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={120}
                disabled={isBusy}
                aria-invalid={!textIsDrawable}
              />
              {!textIsDrawable ? (
                <p className="text-xs text-rose-600">
                  {te('unsupportedCharacters')}
                </p>
              ) : null}
            </Field>

            <Field label={t('layoutLabel')} htmlFor="wm-layout">
              <Select
                id="wm-layout"
                value={layout}
                onChange={(event) =>
                  setLayout(event.target.value as WatermarkLayout)
                }
                disabled={isBusy}
              >
                <option value="diagonal">{t('layout.diagonal')}</option>
                <option value="horizontal">{t('layout.horizontal')}</option>
                <option value="tile">{t('layout.tile')}</option>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('sizeLabel')} htmlFor="wm-size">
                <Slider
                  id="wm-size"
                  min={8}
                  max={144}
                  step={4}
                  value={fontSize}
                  valueLabel={`${fontSize} pt`}
                  onChange={(event) => setFontSize(Number(event.target.value))}
                  disabled={isBusy}
                />
              </Field>

              <Field label={t('opacityLabel')} htmlFor="wm-opacity">
                <Slider
                  id="wm-opacity"
                  min={5}
                  max={100}
                  step={5}
                  value={Math.round(opacity * 100)}
                  valueLabel={`${Math.round(opacity * 100)} %`}
                  onChange={(event) =>
                    setOpacity(Number(event.target.value) / 100)
                  }
                  disabled={isBusy}
                />
              </Field>
            </div>

            <Field label={t('colorLabel')} htmlFor="wm-color">
              <input
                id="wm-color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                disabled={isBusy}
                className="h-10 w-20 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
              />
            </Field>

            <Field label={t('scopeLabel')} htmlFor="wm-scope">
              <Select
                id="wm-scope"
                value={allPages ? 'all' : 'range'}
                onChange={(event) => setAllPages(event.target.value === 'all')}
                disabled={isBusy}
              >
                <option value="all">{t('scope.all')}</option>
                <option value="range">{t('scope.range')}</option>
              </Select>
            </Field>

            {!allPages ? (
              <Field
                label={t('rangeLabel')}
                hint={t('rangeHint', { pages: pageCount })}
                htmlFor="wm-range"
              >
                <TextInput
                  id="wm-range"
                  value={ranges}
                  onChange={(event) => setRanges(event.target.value)}
                  placeholder="1-3, 7"
                  disabled={isBusy}
                />
              </Field>
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
          disabled={!file || !pageCount || !text.trim() || !textIsDrawable || isBusy}
          onClick={() =>
            run(async () => [
              {
                name: suffixFilename(file!.name, 'watermark'),
                bytes: await addWatermark(file!.bytes, {
                  text,
                  layout,
                  fontSize,
                  opacity,
                  color,
                  pageIndices: allPages
                    ? undefined
                    : parsePageSelection(ranges, pageCount!),
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
