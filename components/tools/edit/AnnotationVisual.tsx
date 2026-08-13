'use client';

import { useEffect, useRef } from 'react';
import { CSS_FONT_STACKS } from '@/lib/pdf/fonts';
import { lineEndpoints, type Annotation } from '@/lib/pdf/annotate';

/**
 * On-screen stand-in for an annotation.
 *
 * The PDF itself is drawn by pdf-lib; this only has to be close enough to
 * position by. Text uses the CSS equivalent of the chosen PDF font, so line
 * breaks land in roughly the same places.
 */
export function AnnotationVisual({
  annotation,
  scale,
  isEditing = false,
  onTextChange,
  onFinishEditing,
}: {
  annotation: Annotation;
  scale: number;
  /** Text boxes swap to a real textarea while being edited in place. */
  isEditing?: boolean;
  onTextChange?: (text: string) => void;
  onFinishEditing?: () => void;
}) {
  switch (annotation.type) {
    case 'text': {
      const typography = {
        fontSize: annotation.fontSize * scale,
        color: annotation.color,
        fontWeight: annotation.bold ? 700 : 400,
        fontStyle: annotation.italic ? 'italic' : 'normal',
        fontFamily: CSS_FONT_STACKS[annotation.fontFamily],
        textAlign: annotation.align,
        lineHeight: 1.2,
      } as const;

      if (isEditing) {
        return (
          <InlineTextEditor
            value={annotation.text}
            background={annotation.background}
            typography={typography}
            onChange={(text) => onTextChange?.(text)}
            onFinish={() => onFinishEditing?.()}
          />
        );
      }

      return (
        <span
          className="pointer-events-none block h-full w-full overflow-hidden"
          style={{
            ...typography,
            backgroundColor: annotation.background ?? 'transparent',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {annotation.text}
        </span>
      );
    }

    case 'highlight':
      return (
        <span
          className="pointer-events-none block h-full w-full"
          style={{
            backgroundColor: annotation.color,
            // Multiply is how it will print; the browser has the same mode.
            mixBlendMode: 'multiply',
          }}
        />
      );

    case 'image':
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={annotation.dataUrl}
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full object-fill"
        />
      );

    case 'line':
    case 'arrow': {
      // Drawn in the box's own coordinate space, then scaled — the same
      // endpoints pdf-lib will use, so preview and export cannot drift.
      const { start, end } = lineEndpoints(annotation);
      const x1 = (start.x - annotation.x) * scale;
      const x2 = (end.x - annotation.x) * scale;
      // SVG y grows downwards; the annotation's does not.
      const y1 = (annotation.y + annotation.height - start.y) * scale;
      const y2 = (annotation.y + annotation.height - end.y) * scale;

      const head = Math.min(
        annotation.strokeWidth * 4 + 4,
        Math.hypot(end.x - start.x, end.y - start.y) * 0.4,
      );
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const spread = Math.PI / 7;

      return (
        <svg
          className="pointer-events-none h-full w-full overflow-visible"
          style={{ opacity: annotation.opacity }}
        >
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={annotation.stroke}
            strokeWidth={annotation.strokeWidth * scale}
            strokeLinecap="round"
          />
          {annotation.type === 'arrow'
            ? [angle + Math.PI - spread, angle + Math.PI + spread].map(
                (direction, index) => (
                  <line
                    key={index}
                    x1={x2}
                    y1={y2}
                    x2={x2 + Math.cos(direction) * head * scale}
                    y2={y2 + Math.sin(direction) * head * scale}
                    stroke={annotation.stroke}
                    strokeWidth={annotation.strokeWidth * scale}
                    strokeLinecap="round"
                  />
                ),
              )
            : null}
        </svg>
      );
    }

    default:
      return (
        <span
          className="pointer-events-none block h-full w-full"
          style={{
            backgroundColor: annotation.fill ?? 'transparent',
            opacity: annotation.opacity,
            border: annotation.stroke
              ? `${Math.max(1, annotation.strokeWidth * scale)}px solid ${annotation.stroke}`
              : undefined,
            borderRadius: annotation.type === 'ellipse' ? '50%' : undefined,
          }}
        />
      );
  }
}

/**
 * A textarea sitting exactly where the text will print, styled to match.
 *
 * Editing used to happen in a panel below the page — which on an A4 page put it
 * several hundred pixels below the fold, so it read as "the text cannot be
 * changed at all". Editing belongs on the element.
 */
function InlineTextEditor({
  value,
  background,
  typography,
  onChange,
  onFinish,
}: {
  value: string;
  background: string | null;
  typography: React.CSSProperties;
  onChange: (value: string) => void;
  onFinish: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.focus();
    // Put the caret at the end rather than selecting everything, so typing
    // appends instead of wiping what is there.
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onFinish}
      onKeyDown={(event) => {
        // Escape commits and leaves; Enter stays available for line breaks.
        if (event.key === 'Escape') {
          event.preventDefault();
          onFinish();
        }
        // Arrow keys and Delete belong to the caret here, not to the frame.
        event.stopPropagation();
      }}
      // The frame would otherwise start a drag before the caret is placed.
      onPointerDown={(event) => event.stopPropagation()}
      className="h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
      style={{
        ...typography,
        backgroundColor: background ?? 'transparent',
      }}
    />
  );
}
