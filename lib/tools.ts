/**
 * Single source of truth for the Phase-1 tool set (spec 4.1). Drives the
 * landing-page grid, the header navigation and each tool page's heading.
 * `id` doubles as the message namespace under `tools.<id>` and as the route.
 */
export const TOOL_IDS = [
  'merge',
  'split',
  'organize',
  'compress',
  'watermark',
  'page-numbers',
  'protect',
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

/** Tailwind gradient stops used for each tool's icon tile. */
export const ACCENTS: Record<ToolId, string> = {
  merge: 'from-violet-500 to-indigo-500',
  split: 'from-sky-500 to-blue-600',
  organize: 'from-emerald-500 to-teal-600',
  compress: 'from-amber-500 to-orange-600',
  watermark: 'from-fuchsia-500 to-purple-600',
  'page-numbers': 'from-cyan-500 to-sky-600',
  protect: 'from-rose-500 to-red-600',
};

export interface ToolMeta {
  id: ToolId;
  href: string;
  accent: string;
}

export const TOOLS: ToolMeta[] = TOOL_IDS.map((id) => ({
  id,
  href: `/${id}`,
  accent: ACCENTS[id],
}));
