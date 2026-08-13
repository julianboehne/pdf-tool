'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Select, Slider } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultPanel } from './ResultPanel';
import { SingleFilePicker } from './SingleFilePicker';
import { ToolCard } from './ToolLayout';
import { useSingleFile } from './useSingleFile';
import { useToolRun } from './useToolRun';
import { compressPdf, type CompressMode } from '@/lib/pdf/compress';
import { suffixFilename } from '@/lib/download';
import { formatBytes, savingsPercent } from '@/lib/format';
import type { PdfResult } from '@/lib/pdf/types';

interface CompressOutcome {
  results: PdfResult[];
  originalSize: number;
  compressedSize: number;
}

export function CompressTool() {
  const t = useTranslations('tools.compress');
  const tc = useTranslations('common');
  const te = useTranslations('errors');
  const locale = useLocale();

  const { file, pageCount, loadError, select, clear } = useSingleFile();
  const { state, progress, run, reset, isBusy } = useToolRun<CompressOutcome>();

  const [mode, setMode] = useState<CompressMode>('rasterize');
  const [dpi, setDpi] = useState(120);
  const [quality, setQuality] = useState(0.6);
  const [grayscale, setGrayscale] = useState(false);

  const startOver = () => {
    clear();
    reset();
  };

  if (state.status === 'done') {
    const { originalSize, compressedSize } = state.result;
    const percent = savingsPercent(originalSize, compressedSize);

    return (
      <ResultPanel
        results={state.result.results}
        zipName="compressed.zip"
        onReset={startOver}
        note={
          percent > 0
            ? t('savings', {
                percent,
                before: formatBytes(originalSize, locale),
                after: formatBytes(compressedSize, locale),
              })
            : t('noSavings', {
                before: formatBytes(originalSize, locale),
                after: formatBytes(compressedSize, locale),
              })
        }
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

      {file ? (
        <ToolCard>
          <div className="flex flex-col gap-4">
            <Field label={t('modeLabel')} htmlFor="compress-mode">
              <Select
                id="compress-mode"
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value as CompressMode)
                }
                disabled={isBusy}
              >
                <option value="rasterize">{t('mode.rasterize')}</option>
                <option value="lossless">{t('mode.lossless')}</option>
              </Select>
            </Field>

            {mode === 'rasterize' ? (
              <>
                <Alert tone="warning">{t('rasterWarning')}</Alert>

                <Field
                  label={t('qualityLabel')}
                  hint={t('qualityHint')}
                  htmlFor="compress-quality"
                >
                  <Slider
                    id="compress-quality"
                    min={20}
                    max={95}
                    step={5}
                    value={Math.round(quality * 100)}
                    valueLabel={`${Math.round(quality * 100)} %`}
                    onChange={(event) =>
                      setQuality(Number(event.target.value) / 100)
                    }
                    disabled={isBusy}
                  />
                </Field>

                <Field
                  label={t('dpiLabel')}
                  hint={t('dpiHint')}
                  htmlFor="compress-dpi"
                >
                  <Slider
                    id="compress-dpi"
                    min={72}
                    max={300}
                    step={12}
                    value={dpi}
                    valueLabel={`${dpi} dpi`}
                    onChange={(event) => setDpi(Number(event.target.value))}
                    disabled={isBusy}
                  />
                </Field>

                <Checkbox
                  label={t('grayscaleLabel')}
                  checked={grayscale}
                  onChange={(event) => setGrayscale(event.target.checked)}
                  disabled={isBusy}
                />
              </>
            ) : (
              <Alert tone="info">{t('losslessNote')}</Alert>
            )}
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
          disabled={!file || isBusy}
          onClick={() =>
            run(async (onProgress) => {
              const result = await compressPdf(
                file!.bytes,
                { mode, dpi, quality, grayscale },
                onProgress,
              );

              return {
                results: [
                  {
                    name: suffixFilename(file!.name, 'compressed'),
                    bytes: result.bytes,
                  },
                ],
                originalSize: result.originalSize,
                compressedSize: result.compressedSize,
              };
            })
          }
        >
          {t('action')}
        </Button>
      </div>
    </div>
  );
}
