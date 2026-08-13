'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { FileList } from './FileList';
import {
  PageBoard,
  SOURCE_BADGE_CLASSES,
  type BoardPage,
  type SourceBadge,
} from './PageBoard';
import { ResultPanel } from './ResultPanel';
import { ToolCard } from './ToolLayout';
import { usePageThumbnails } from './usePageThumbnails';
import { useToolRun } from './useToolRun';
import { composePdf } from '@/lib/pdf/compose';
import { toPdfSource } from '@/lib/pdf/load';
import type { PdfResult, PdfSource } from '@/lib/pdf/types';

export function MergeTool() {
  const t = useTranslations('tools.merge');
  const tb = useTranslations('board');
  const tc = useTranslations('common');
  const te = useTranslations('errors');

  const [files, setFiles] = useState<PdfSource[]>([]);
  const [pages, setPages] = useState<BoardPage[]>([]);
  const { state, progress, run, reset, isBusy } = useToolRun<PdfResult[]>();

  const {
    thumbnails,
    progress: renderProgress,
    isRendering,
    error: renderError,
  } = usePageThumbnails(files);

  /**
   * Keeps the board in sync with the file list without discarding edits: pages
   * of files that are still present keep their position and rotation, pages of
   * newly added files are appended in document order.
   */
  useEffect(() => {
    setPages((current) => {
      const known = new Set(current.map((page) => page.key));
      const stillPresent = new Set(files.map((file) => file.id));

      const kept = current.filter(
        (page) => stillPresent.has(page.sourceId) && thumbnails[page.sourceId],
      );

      const added: BoardPage[] = [];

      for (const file of files) {
        for (const thumb of thumbnails[file.id] ?? []) {
          const key = `${file.id}:${thumb.pageIndex}`;
          if (known.has(key)) continue;

          added.push({
            key,
            sourceId: file.id,
            sourceIndex: thumb.pageIndex,
            rotation: 0,
            selected: false,
            dataUrl: thumb.dataUrl,
          });
        }
      }

      return added.length === 0 && kept.length === current.length
        ? current
        : [...kept, ...added];
    });
  }, [files, thumbnails]);

  const badges = useMemo(() => {
    const map: Record<string, SourceBadge> = {};

    files.forEach((file, index) => {
      map[file.id] = {
        label: String(index + 1),
        className: SOURCE_BADGE_CLASSES[index % SOURCE_BADGE_CLASSES.length],
      };
    });

    return map;
  }, [files]);

  const addFiles = async (incoming: File[]) => {
    const sources = await Promise.all(incoming.map(toPdfSource));
    setFiles((current) => [...current, ...sources]);
    reset();
  };

  const startOver = () => {
    setFiles([]);
    setPages([]);
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
          <p className="mb-4 text-xs text-slate-500">{t('fileOrderHint')}</p>

          <FileList
            files={files}
            onReorder={setFiles}
            onRemove={(id) =>
              setFiles((current) => current.filter((file) => file.id !== id))
            }
          />
        </ToolCard>
      ) : null}

      {renderError ? <Alert tone="error">{te(renderError)}</Alert> : null}

      {isRendering ? (
        <ProgressBar
          value={renderProgress.done}
          max={renderProgress.total}
          label={tb('rendering')}
        />
      ) : null}

      {pages.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              {t('pagesHeading', { count: pages.length })}
            </h2>
            <p className="mt-1 text-xs text-slate-500">{t('pageOrderHint')}</p>
          </div>

          <PageBoard
            pages={pages}
            onChange={setPages}
            badges={badges}
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
          disabled={pages.length === 0 || isBusy || isRendering}
          onClick={() =>
            run(async (onProgress) => [
              {
                name: 'merged.pdf',
                bytes: await composePdf(
                  files,
                  pages.map((page) => ({
                    sourceId: page.sourceId,
                    sourceIndex: page.sourceIndex,
                    rotation: page.rotation,
                  })),
                  onProgress,
                ),
              },
            ])
          }
        >
          {t('action')}
        </Button>

        {files.length === 1 ? (
          <p className="mt-2 text-xs text-slate-500">{t('singleFileNote')}</p>
        ) : null}
      </div>
    </div>
  );
}
