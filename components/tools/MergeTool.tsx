'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { FileList } from './FileList';
import { ResultPanel } from './ResultPanel';
import { ToolCard } from './ToolLayout';
import { useToolRun } from './useToolRun';
import { mergePdfs } from '@/lib/pdf/merge';
import { toPdfSource } from '@/lib/pdf/load';
import type { PdfResult, PdfSource } from '@/lib/pdf/types';

export function MergeTool() {
  const t = useTranslations('tools.merge');
  const tc = useTranslations('common');
  const te = useTranslations('errors');

  const [files, setFiles] = useState<PdfSource[]>([]);
  const { state, progress, run, reset, isBusy } = useToolRun<PdfResult[]>();

  const addFiles = async (incoming: File[]) => {
    const sources = await Promise.all(incoming.map(toPdfSource));
    setFiles((current) => [...current, ...sources]);
    reset();
  };

  const startOver = () => {
    setFiles([]);
    reset();
  };

  if (state.status === 'done') {
    return (
      <ResultPanel
        results={state.result}
        zipName="merged.zip"
        onReset={startOver}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Dropzone multiple onFiles={addFiles} disabled={isBusy} />

      {files.length > 0 ? (
        <ToolCard>
          <h2 className="mb-3 text-sm font-semibold text-slate-800">
            {t('orderHeading', { count: files.length })}
          </h2>
          <p className="mb-4 text-xs text-slate-500">{t('orderHint')}</p>

          <FileList
            files={files}
            onReorder={setFiles}
            onRemove={(id) =>
              setFiles((current) => current.filter((f) => f.id !== id))
            }
          />
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
          disabled={files.length < 2 || isBusy}
          onClick={() =>
            run(async (onProgress) => [
              {
                name: 'merged.pdf',
                bytes: await mergePdfs(files, onProgress),
              },
            ])
          }
        >
          {t('action')}
        </Button>
        {files.length === 1 ? (
          <p className="mt-2 text-xs text-slate-500">{t('needTwo')}</p>
        ) : null}
      </div>
    </div>
  );
}
