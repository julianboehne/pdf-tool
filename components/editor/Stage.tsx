'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

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
  /** Turns the pointer into a crosshair while a placement tool is armed. */
  isPlacing?: boolean;
  label: string;
}

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
  isPlacing = false,
  label,
}: StageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || widthPt <= 0) return;

    const measure = () => setScale(element.clientWidth / widthPt);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [widthPt]);

  return (
    <div
      ref={containerRef}
      className={`relative mx-auto w-full max-w-3xl select-none overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm ${
        isPlacing ? 'cursor-crosshair' : ''
      }`}
      style={{ aspectRatio: `${widthPt} / ${heightPt}` }}
      onClick={(event) => {
        if (!onBackgroundClick || scale <= 0) return;
        // Ignore clicks that bubbled up from an annotation.
        if (event.target !== event.currentTarget) return;

        const rect = event.currentTarget.getBoundingClientRect();
        const xPt = (event.clientX - rect.left) / scale;
        // Screen y grows downwards, PDF y grows upwards.
        const yPt = heightPt - (event.clientY - rect.top) / scale;

        onBackgroundClick(xPt, yPt);
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
    </div>
  );
}
