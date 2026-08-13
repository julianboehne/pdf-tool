'use client';

import { useCallback, useState } from 'react';
import { toPdfToolError, type PdfToolErrorKey } from '@/lib/pdf/errors';
import type { ProgressCallback } from '@/lib/pdf/types';

type RunState<T> =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'done'; result: T }
  | { status: 'error'; error: PdfToolErrorKey };

/**
 * Shared plumbing for every tool: run an async PDF operation, surface progress,
 * and turn thrown errors into a translatable key. All work happens on the main
 * thread inside the browser — there is no request to cancel or retry.
 */
export function useToolRun<T>() {
  const [state, setState] = useState<RunState<T>>({ status: 'idle' });
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const run = useCallback(
    async (operation: (onProgress: ProgressCallback) => Promise<T>) => {
      setState({ status: 'busy' });
      setProgress({ done: 0, total: 0 });

      try {
        const result = await operation((done, total) =>
          setProgress({ done, total }),
        );
        setState({ status: 'done', result });
      } catch (error) {
        setState({ status: 'error', error: toPdfToolError(error).key });
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setState({ status: 'idle' });
    setProgress({ done: 0, total: 0 });
  }, []);

  return {
    state,
    progress,
    run,
    reset,
    isBusy: state.status === 'busy',
  };
}
