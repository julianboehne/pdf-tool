'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { PageBoard, type BoardPage } from './PageBoard';
import { ResultPanel } from './ResultPanel';
import { SingleFilePicker } from './SingleFilePicker';
import { usePageThumbnails } from './usePageThumbnails';
import { useSingleFile } from './useSingleFile';
import { useToolRun } from './useToolRun';
import { applyPageOps } from '@/lib/pdf/organize';
import { suffixFilename } from '@/lib/download';
import type { PdfResult } from '@/lib/pdf/types';

export function OrganizeTool() {
  const t = useTranslations('tools.organize');
  const tb = useTranslations('board');
  const tc = useTranslations('common');
  const te = useTranslations('errors');

  const { file, pageCount, loadError, select, clear } = useSingleFile();
  const { state, progress, run, reset, isBusy } = useToolRun<PdfResult[]>();
  const [pages, setPages] = useState<BoardPage[]>([]);

  // usePageThumbnails takes a list; a single file is just a list of one. The
  // memo keeps that list referentially stable so the hook does not re-render
  // the document on every keystroke elsewhere in the tool.
  const sources = useMemo(() => (file ? [file] : []), [file]);

  const { thumbnails, progress: renderProgress, isRendering, error: renderError } =
    usePageThumbnails(sources);

  useEffect(() => {
    if (!file) {
      setPages([]);
      return;
    }

    const rendered = thumbnails[file.id];
    if (!rendered) return;

    setPages(
      rendered.map((thumb) => ({
        key: `${file.id}:${thumb.pageIndex}`,
        sourceId: file.id,
        sourceIndex: thumb.pageIndex,
        rotation: 0,
        selected: false,
        dataUrl: thumb.dataUrl,
      })),
    );
  }, [file, thumbnails]);

  const startOver = () => {
    clear();
    reset();
    setPages([]);
  };

  const selectedCount = pages.filter((page) => page.selected).length;

  const isModified =
    pages.length !== (pageCount ?? 0) ||
    pages.some((page, i) => page.sourceIndex !== i || page.rotation !== 0);

  const save = (subset: BoardPage[], suffix: string) =>
    run(async () => [
      {
        name: suffixFilename(file!.name, suffix),
        bytes: await applyPageOps(
          file!.bytes,
          subset.map((page) => ({
            sourceIndex: page.sourceIndex,
            rotation: page.rotation,
          })),
        ),
      },
    ]);

  if (state.status === 'done') {
    return (
      <ResultPanel
        results={state.result}
        zipName="pages.zip"
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

      {isRendering ? (
        <ProgressBar
          value={renderProgress.done}
          max={renderProgress.total}
          label={tb('rendering')}
        />
      ) : null}

      {pages.length > 0 ? (
        <>
          <p className="text-xs text-slate-500">{t('gridHint')}</p>
          <PageBoard
            pages={pages}
            onChange={setPages}
            showSelect
            disabled={isBusy}
          />
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

      {pages.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={isBusy || !isModified}
            onClick={() => save(pages, 'organized')}
          >
            {t('applyAction')}
          </Button>
          <Button
            variant="secondary"
            disabled={isBusy || selectedCount === 0}
            onClick={() => save(pages.filter((page) => page.selected), 'extract')}
          >
            {t('extractAction', { count: selectedCount })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
