import type { ToolId } from '@/lib/tools';

/**
 * Inline stroke icons — no icon package, so nothing extra ships to the client.
 * Paths are drawn on a 24×24 grid with `currentColor`.
 */
const PATHS: Record<ToolId, string> = {
  merge:
    'M9 3H4.5A1.5 1.5 0 0 0 3 4.5v6A1.5 1.5 0 0 0 4.5 12H9M15 12h4.5A1.5 1.5 0 0 1 21 13.5v6a1.5 1.5 0 0 1-1.5 1.5H15M9 3v9m0 0v9m0-9h6m0-9v9m0 0v9',
  split: 'M12 3v18M7.5 7.5 3 12l4.5 4.5M16.5 7.5 21 12l-4.5 4.5',
  organize:
    'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  compress:
    'M9 9V4.5M9 9H4.5M9 9 3.75 3.75M15 9V4.5M15 9h4.5M15 9l5.25-5.25M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 15v4.5m0-4.5h4.5m-4.5 0 5.25 5.25',
  watermark:
    'M12 3.75c-2.5 3.25-4.5 5.75-4.5 8.25a4.5 4.5 0 1 0 9 0c0-2.5-2-5-4.5-8.25zM4.5 20.25h15',
  'page-numbers':
    'M5.25 3.75h13.5v16.5H5.25zM9 16.5h6M9 13.5h6',
  edit:
    'M16.86 3.49a1.88 1.88 0 0 1 2.65 2.65L8.4 17.25l-3.53.88.88-3.53zM14.25 6.1l3.65 3.65',
  sign:
    'M3 17.25c2.25 0 2.25-10.5 4.5-10.5s2.25 10.5 4.5 10.5S14.25 12 16.5 12s2.25 5.25 4.5 5.25M3.75 20.75h16.5',
  protect:
    'M12 15v2.25M6.75 21h10.5a1.5 1.5 0 0 0 1.5-1.5v-7.5a1.5 1.5 0 0 0-1.5-1.5H6.75a1.5 1.5 0 0 0-1.5 1.5v7.5a1.5 1.5 0 0 0 1.5 1.5zM8.25 10.5V6.75a3.75 3.75 0 1 1 7.5 0v3.75',
};

export function ToolIcon({
  id,
  className = 'h-6 w-6',
}: {
  id: ToolId;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={PATHS[id]} />
    </svg>
  );
}
