'use client';

import { useEffect, useRef, useState } from 'react';
import { renderThumbnails, type PageThumbnail } from '@/lib/pdf/render';
import { toPdfToolError, type PdfToolErrorKey } from '@/lib/pdf/errors';
import type { PdfSource } from '@/lib/pdf/types';

export type ThumbnailMap = Record<string, PageThumbnail[]>;

/**
 * Renders page thumbnails for a set of documents and keeps them cached by
 * source id, so adding a fifth file to a merge does not re-render the first
 * four. Rendering is sequential on purpose — pdf.js already uses a worker, and
 * running several documents at once only makes the progress bar lie.
 */
export function usePageThumbnails(sources: PdfSource[], maxEdge = 220) {
  const [thumbnails, setThumbnails] = useState<ThumbnailMap>({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<PdfToolErrorKey | null>(null);

  // Mirrors `thumbnails` for the effect, which must not re-run when the cache
  // it just filled changes.
  const cache = useRef<ThumbnailMap>({});
  const runId = useRef(0);

  useEffect(() => {
    const ids = new Set(sources.map((source) => source.id));

    // Drop entries for files the user removed.
    for (const id of Object.keys(cache.current)) {
      if (!ids.has(id)) delete cache.current[id];
    }

    const pending = sources.filter((source) => !cache.current[source.id]);

    if (pending.length === 0) {
      setThumbnails({ ...cache.current });
      setIsRendering(false);
      return;
    }

    const currentRun = ++runId.current;
    setIsRendering(true);
    setError(null);

    void (async () => {
      let filesDone = 0;

      for (const source of pending) {
        try {
          const rendered = await renderThumbnails(
            source.bytes,
            maxEdge,
            (done, total) => {
              if (runId.current !== currentRun) return;
              // Progress is tracked in per-file percent so files of very
              // different lengths still advance the bar evenly.
              setProgress({
                done: filesDone * 100 + Math.round((done / total) * 100),
                total: pending.length * 100,
              });
            },
          );

          if (runId.current !== currentRun) return;

          cache.current[source.id] = rendered;
          setThumbnails({ ...cache.current });
        } catch (caught) {
          if (runId.current !== currentRun) return;
          setError(toPdfToolError(caught).key);
        }

        filesDone += 1;
      }

      if (runId.current === currentRun) setIsRendering(false);
    })();

    return () => {
      // Abandon this run; a newer one owns the state from here on.
      runId.current += 1;
    };
  }, [sources, maxEdge]);

  return { thumbnails, progress, isRendering, error };
}
