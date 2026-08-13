'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { EditorIcon, type EditorIconName } from './EditorIcons';

/** Shapes offered inside the shapes popup. */
export const SHAPE_TOOLS = ['rect', 'ellipse', 'line', 'arrow'] as const;
export type ShapeTool = (typeof SHAPE_TOOLS)[number];

export type EditorTool = 'select' | 'text' | 'highlight' | ShapeTool;

const PRIMARY: Array<{ id: 'select' | 'text' | 'highlight'; icon: EditorIconName }> = [
  { id: 'select', icon: 'select' },
  { id: 'text', icon: 'text' },
  { id: 'highlight', icon: 'marker' },
];

/**
 * The toolbar sits above the page and stays put while scrolling, the way an
 * office application keeps its ribbon in reach. Row one picks what to insert,
 * row two formats whatever is currently selected.
 */
export function Ribbon({
  tool,
  onToolChange,
  onPickImage,
  onRecognize,
  isRecognizing,
  disabled,
  children,
}: {
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  onPickImage: (file: File) => void;
  onRecognize: () => void;
  isRecognizing: boolean;
  disabled?: boolean;
  /** The contextual format row. */
  children?: ReactNode;
}) {
  const t = useTranslations('tools.edit');
  const [shapesOpen, setShapesOpen] = useState(false);
  const shapesRef = useRef<HTMLDivElement>(null);

  const activeShape = SHAPE_TOOLS.includes(tool as ShapeTool)
    ? (tool as ShapeTool)
    : null;

  useEffect(() => {
    if (!shapesOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!shapesRef.current?.contains(event.target as Node)) setShapesOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShapesOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [shapesOpen]);

  return (
    <div className="sticky top-[57px] z-30 rounded-xl border border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 p-2">
        {PRIMARY.map((entry) => (
          <ToolButton
            key={entry.id}
            icon={entry.icon}
            label={t(`tool.${entry.id}`)}
            active={tool === entry.id}
            disabled={disabled}
            onClick={() => onToolChange(entry.id)}
          />
        ))}

        <div ref={shapesRef} className="relative">
          <ToolButton
            icon="shapes"
            label={t('tool.shapes')}
            active={activeShape !== null}
            disabled={disabled}
            hasMenu
            expanded={shapesOpen}
            onClick={() => setShapesOpen((open) => !open)}
          />

          {shapesOpen ? (
            <div className="absolute left-0 top-full z-40 mt-1 w-max animate-fade-up rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
              <div className="grid grid-cols-2 gap-1">
                {SHAPE_TOOLS.map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    aria-pressed={tool === shape}
                    onClick={() => {
                      onToolChange(shape);
                      setShapesOpen(false);
                    }}
                    className={[
                      'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition',
                      tool === shape
                        ? 'bg-brand-purple text-white'
                        : 'text-slate-700 hover:bg-slate-100',
                    ].join(' ')}
                  >
                    <EditorIcon name={shape} />
                    {t(`tool.${shape}`)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <label
          className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 ${
            disabled ? 'pointer-events-none opacity-40' : ''
          }`}
        >
          <EditorIcon name="image" />
          <span className="hidden sm:inline">{t('tool.image')}</span>
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) onPickImage(chosen);
              event.target.value = '';
            }}
          />
        </label>

        <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />

        <button
          type="button"
          disabled={disabled || isRecognizing}
          onClick={onRecognize}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
        >
          <EditorIcon name="recognize" />
          {isRecognizing ? t('recognizing') : t('recognizeAction')}
        </button>
      </div>

      {children ? <div className="p-2">{children}</div> : null}
    </div>
  );
}

function ToolButton({
  icon,
  label,
  active,
  hasMenu,
  expanded,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: EditorIconName;
  label: string;
  active: boolean;
  hasMenu?: boolean;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-pressed={hasMenu ? undefined : active}
      aria-expanded={hasMenu ? expanded : undefined}
      aria-label={label}
      {...props}
      className={[
        'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition',
        active ? 'bg-brand-purple text-white' : 'text-slate-700 hover:bg-slate-100',
        'disabled:opacity-40',
      ].join(' ')}
    >
      <EditorIcon name={icon} />
      <span className="hidden sm:inline">{label}</span>
      {hasMenu ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      ) : null}
    </button>
  );
}
