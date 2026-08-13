'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ActiveGuide, Rect } from '@/lib/pdf/guides';

interface StageProps {
  /** Rendered page image as a data URL. */
  dataUrl: string;
  widthPt: number;
  heightPt: number;
  /**
   * Rendered with the current points-to-pixels factor, so children can place
   * themselves without measuring the stage again.
   */
  children: (scale: number) => ReactNode;
  /** Fires with PDF-space coordinates when the page itself is clicked. */
  onBackgroundClick?: (x: number, y: number) => void;
  /**
   * When set, dragging on the page draws a rectangle instead of clicking — how
   * the marker and the shape tools are used.
   *
   * `fromCorner` records which diagonal the drag ran along, which is what tells
   * an arrow which end to put its head on.
   */
  onDrawRect?: (rect: Rect, fromCorner: 'bottom-left' | 'top-left') => void;
  /** Minimum height for drawn rectangles; the marker uses it as its stroke. */
  drawMinHeightPt?: number;
  /** Turns the pointer into a crosshair while a placement tool is armed. */
  isPlacing?: boolean;
  /** Alignment guides to overlay while an element is being dragged. */
  guides?: ActiveGuide[];
  label: string;
}

const GUIDE_COLORS: Record<ActiveGuide['kind'], string> = {
  'page-center': 'bg-fuchsia-500',
  'page-edge': 'bg-sky-500',
  element: 'bg-fuchsia-500',
};

/**
 * The page as a fixed-aspect surface with an overlay coordinate system.
 *
 * Scale is measured from the rendered width rather than assumed, so the same
 * annotation model lines up at any viewport size — the editor is usable on a
 * phone and on a wide monitor without separate layouts.
 */
export function Stage({
  dataUrl,
  widthPt,
  heightPt,
  children,
  onBackgroundClick,
  onDrawRect,
  drawMinHeightPt = 0,
  isPlacing = false,
  guides = [],
  label,
}: StageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [draft, setDraft] = useState<Rect | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const drawCorner = useRef<'bottom-left' | 'top-left'>('bottom-left');

  useEffect(() => {
    const element = containerRef.current;
    if (!element || widthPt <= 0) return;

    const measure = () => setScale(element.clientWidth / widthPt);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [widthPt]);

  /** Pointer position in PDF space (origin bottom-left). */
  const toPdfPoint = (event: React.PointerEvent | React.MouseEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / scale,
      y: heightPt - (event.clientY - rect.top) / scale,
    };
  };

  return (
    <div
      ref={containerRef}
      className={`relative mx-auto w-full max-w-3xl select-none overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm ${
        isPlacing ? 'cursor-crosshair' : ''
      }`}
      style={{ aspectRatio: `${widthPt} / ${heightPt}` }}
      onPointerDown={(event) => {
        if (!onDrawRect || scale <= 0) return;
        if (event.target !== event.currentTarget) return;

        event.currentTarget.setPointerCapture(event.pointerId);
        drawStart.current = toPdfPoint(event);
        setDraft({ ...drawStart.current, width: 0, height: 0 });
      }}
      onPointerMove={(event) => {
        const start = drawStart.current;
        if (!start) return;

        const current = toPdfPoint(event);

        // Matching signs mean the drag ran along the ↗ diagonal.
        drawCorner.current =
          current.x - start.x >= 0 === (current.y - start.y >= 0)
            ? 'bottom-left'
            : 'top-left';

        setDraft({
          x: Math.min(start.x, current.x),
          y: Math.min(start.y, current.y),
          width: Math.abs(current.x - start.x),
          height: Math.max(drawMinHeightPt, Math.abs(current.y - start.y)),
        });
      }}
      onPointerUp={() => {
        const rect = draft;
        drawStart.current = null;
        setDraft(null);

        // Ignore accidental micro-drags. Measured on the longer side so a
        // vertical line, which has no width at all, still counts.
        if (rect && Math.max(rect.width, rect.height) > 4) {
          onDrawRect?.(rect, drawCorner.current);
        }
      }}
      onClick={(event) => {
        if (!onBackgroundClick || scale <= 0) return;
        if (event.target !== event.currentTarget) return;

        const point = toPdfPoint(event);
        onBackgroundClick(point.x, point.y);
      }}
    >
      {/* The page raster is decorative here; the accessible name lives on the
          container, and every annotation is separately labelled. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt={label}
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
      />

      {scale > 0 ? children(scale) : null}

      {draft ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute border border-brand-purple bg-brand-purple/20"
          style={{
            left: draft.x * scale,
            top: (heightPt - draft.y - draft.height) * scale,
            width: draft.width * scale,
            height: draft.height * scale,
          }}
        />
      ) : null}

      {guides.map((guide, index) => (
        <span
          key={`${guide.axis}-${guide.position}-${index}`}
          aria-hidden="true"
          className={`pointer-events-none absolute ${GUIDE_COLORS[guide.kind]}`}
          style={
            guide.axis === 'x'
              ? {
                  left: guide.position * scale,
                  top: 0,
                  width: 1,
                  height: '100%',
                }
              : {
                  left: 0,
                  top: (heightPt - guide.position) * scale,
                  width: '100%',
                  height: 1,
                }
          }
        />
      ))}
    </div>
  );
}
