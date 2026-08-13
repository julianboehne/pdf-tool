/**
 * Toolbar icons, drawn as inline SVG on a 24×24 grid.
 *
 * Replaces the Unicode glyphs the toolbar started with: characters like ▭ and ▣
 * vary wildly between fonts and platforms, and none of them read as the tool
 * they stood for.
 */

export type EditorIconName =
  | 'select'
  | 'text'
  | 'marker'
  | 'shapes'
  | 'image'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'recognize';

const STROKE: Record<EditorIconName, React.ReactNode> = {
  // Classic arrow pointer.
  select: <path d="M5.5 3.5 18 12.2l-5.1.8 2.6 5.6-2.3 1-2.6-5.6-3.6 3.7z" />,

  // Serif capital A on a baseline — reads as "text" at any size.
  text: (
    <>
      <path d="M5 19 12 5l7 14" />
      <path d="M8.2 14.2h7.6" />
    </>
  ),

  // Highlighter: angled nib with a broad stroke under it.
  marker: (
    <>
      <path d="M9 14.5 4.8 18.7l3.6 1.1L11 16.6" />
      <path d="m11.4 12.1 5.9-5.9a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8l-5.9 5.9z" />
      <path d="M4 21.6h16" />
    </>
  ),

  // Square and circle overlapping.
  shapes: (
    <>
      <rect x="3.5" y="3.5" width="10" height="10" rx="1.2" />
      <circle cx="15.5" cy="15.5" r="5" />
    </>
  ),

  // Picture frame with a horizon and a sun.
  image: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m3.6 17.2 4.9-4.6a1.6 1.6 0 0 1 2.2 0l4.2 4M14 14.4l1.8-1.7a1.6 1.6 0 0 1 2.2 0l2.4 2.2" />
    </>
  ),

  rect: <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />,
  line: <path d="M4 19 20 5" />,
  arrow: (
    <>
      <path d="M4 19 19 6" />
      <path d="M20 5.2 13.6 6.4M20 5.2l-1.2 6.4" />
    </>
  ),

  // Magnifier over a text line.
  recognize: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
      <path d="M8 9.2h5M8 12h3.4" />
    </>
  ),
};

export function EditorIcon({
  name,
  className = 'h-4 w-4',
}: {
  name: EditorIconName;
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
      {STROKE[name]}
    </svg>
  );
}
