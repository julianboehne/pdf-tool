'use client';

import { useCallback, useState } from 'react';
import { getPageCount, toPdfSource } from '@/lib/pdf/load';
import { toPdfToolError, type PdfToolErrorKey } from '@/lib/pdf/errors';
import type { PdfSource } from '@/lib/pdf/types';

/**
 * Loads one document and reads its page count up front, so tools can validate
 * page ranges before the user hits the action button.
 *
 * `inspect: false` skips the page-count probe — used by the protect tool, whose
 * input is expected to be encrypted and therefore not yet readable.
 */
export function useSingleFile({ inspect = true }: { inspect?: boolean } = {}) {
  const [file, setFile] = useState<PdfSource | null>(null);
  const [pageCount, setPageCount] = useState<number | undefined>(undefined);
  const [loadError, setLoadError] = useState<PdfToolErrorKey | null>(null);

  const select = useCallback(
    async (input: File) => {
      setLoadError(null);
      setPageCount(undefined);

      const source = await toPdfSource(input);
      setFile(source);

      if (!inspect) return;

      try {
        setPageCount(await getPageCount(source.bytes));
      } catch (error) {
        setLoadError(toPdfToolError(error).key);
      }
    },
    [inspect],
  );

  const clear = useCallback(() => {
    setFile(null);
    setPageCount(undefined);
    setLoadError(null);
  }, []);

  return { file, pageCount, loadError, select, clear };
}
