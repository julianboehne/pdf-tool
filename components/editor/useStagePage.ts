'use client';

import { useEffect, useRef, useState } from 'react';
import { renderSinglePage, type PageThumbnail } from '@/lib/pdf/render';
import { toPdfToolError, type PdfToolErrorKey } from '@/lib/pdf/errors';

/**
 * Renders the page currently open in the editor, at a resolution high enough
 * to position elements against.
 *
 * Pages are cached per index, so flipping back and forth through a document is
 * instant and does not re-parse it. The cache is dropped whenever the document
 * itself changes.
 */
export function useStagePage(
  bytes: Uint8Array | null,
  pageIndex: number,
  maxEdge = 1100,
) {
  const [page, setPage] = useState<PageThumbnail | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<PdfToolErrorKey | null>(null);

  const cache = useRef(new Map<number, PageThumbnail>());
  const cachedFor = useRef<Uint8Array | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    if (!bytes) {
      setPage(null);
      return;
    }

    if (cachedFor.current !== bytes) {
      cache.current.clear();
      cachedFor.current = bytes;
    }

    const cached = cache.current.get(pageIndex);
    if (cached) {
      setPage(cached);
      setError(null);
      return;
    }

    const currentRun = ++runId.current;
    setIsRendering(true);

    void (async () => {
      try {
        const rendered = await renderSinglePage(bytes, pageIndex, maxEdge);
        if (runId.current !== currentRun) return;

        cache.current.set(pageIndex, rendered);
        setPage(rendered);
        setError(null);
      } catch (caught) {
        if (runId.current !== currentRun) return;
        setError(toPdfToolError(caught).key);
      } finally {
        if (runId.current === currentRun) setIsRendering(false);
      }
    })();

    return () => {
      runId.current += 1;
    };
  }, [bytes, pageIndex, maxEdge]);

  return { page, isRendering, error };
}
