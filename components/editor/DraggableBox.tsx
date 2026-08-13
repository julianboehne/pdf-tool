'use client';

import { useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

export interface BoxGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DraggableBoxProps extends BoxGeometry {
  /** Page height in points — needed to flip between PDF and screen space. */
  pageHeightPt: number;
  pageWidthPt: number;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  /** `mode` lets the parent apply alignment snapping to moves but not resizes. */
  onChange: (geometry: BoxGeometry, mode: 'move' | 'resize') => void;
  /** Fires when a drag or resize finishes, so guides can be cleared. */
  onGestureEnd?: () => void;
  onDelete: () => void;
  /** Signature images keep their proportions while being resized. */
  lockAspect?: boolean;
  /** Double-click or Enter/F2 — used to start editing a text box in place. */
  onActivate?: () => void;
  /** While true the frame stops dragging so the content can take the pointer. */
  isEditing?: boolean;
  label: string;
  children: ReactNode;
}

const MIN_SIZE_PT = 8;
const NUDGE_PT = 1;
const NUDGE_FAST_PT = 10;

/**
 * A positionable, resizable annotation frame.
 *
 * Pointer dragging is the primary interaction, but the frame is also a focusable
 * element that the arrow keys move and Delete removes — otherwise the editor
 * would be unusable without a mouse.
 */
export function DraggableBox({
  x,
  y,
  width,
  height,
  pageHeightPt,
  pageWidthPt,
  scale,
  selected,
  onSelect,
  onChange,
  onGestureEnd,
  onDelete,
  lockAspect = false,
  onActivate,
  isEditing = false,
  label,
  children,
}: DraggableBoxProps) {
  const t = useTranslations('editor');
  const frameRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origin: BoxGeometry;
  } | null>(null);

  const clamp = (geometry: BoxGeometry): BoxGeometry => ({
    width: Math.max(MIN_SIZE_PT, geometry.width),
    height: Math.max(MIN_SIZE_PT, geometry.height),
    // Keep at least a sliver on the page so nothing can be lost off-canvas.
    x: Math.min(Math.max(geometry.x, -geometry.width + MIN_SIZE_PT), pageWidthPt - MIN_SIZE_PT),
    y: Math.min(Math.max(geometry.y, -geometry.height + MIN_SIZE_PT), pageHeightPt - MIN_SIZE_PT),
  });

  const startGesture = (
    event: React.PointerEvent,
    mode: 'move' | 'resize',
  ) => {
    if (isEditing) return;

    event.stopPropagation();
    event.preventDefault();
    onSelect();

    // preventDefault above suppresses the focus a pointerdown would normally
    // give this element — without restoring it by hand the frame never becomes
    // the keyboard target, and Delete silently does nothing.
    frameRef.current?.focus();

    (event.target as Element).setPointerCapture(event.pointerId);
    gesture.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x, y, width, height },
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const active = gesture.current;
    if (!active) return;

    const dxPt = (event.clientX - active.startX) / scale;
    const dyPt = (event.clientY - active.startY) / scale;

    if (active.mode === 'move') {
      onChange(
        clamp({
          ...active.origin,
          x: active.origin.x + dxPt,
          y: active.origin.y - dyPt,
        }),
        'move',
      );
      return;
    }

    // Resizing drags the screen's bottom-right corner: width grows with dx,
    // height grows with dy, and the box's top edge must stay put.
    const topPt = active.origin.y + active.origin.height;
    let nextWidth = active.origin.width + dxPt;
    let nextHeight = active.origin.height + dyPt;

    if (lockAspect) {
      const ratio = active.origin.height / active.origin.width;
      nextHeight = nextWidth * ratio;
    }

    nextWidth = Math.max(MIN_SIZE_PT, nextWidth);
    nextHeight = Math.max(MIN_SIZE_PT, nextHeight);

    onChange(
      clamp({
        x: active.origin.x,
        y: topPt - nextHeight,
        width: nextWidth,
        height: nextHeight,
      }),
      'resize',
    );
  };

  const endGesture = () => {
    if (gesture.current) onGestureEnd?.();
    gesture.current = null;
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? NUDGE_FAST_PT : NUDGE_PT;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onDelete();
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      onActivate?.();
      return;
    }

    const move = moves[event.key];
    if (!move) return;

    event.preventDefault();
    // Keyboard nudges bypass snapping on purpose: they are the tool you reach
    // for when snapping put something *almost* where you wanted it.
    onChange(clamp({ x: x + move[0], y: y + move[1], width, height }), 'resize');
  };

  return (
    <div
      ref={frameRef}
      role="group"
      aria-label={label}
      tabIndex={0}
      onFocus={onSelect}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onActivate?.();
      }}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => startGesture(event, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      className={[
        'absolute touch-none',
        selected
          ? 'outline outline-2 outline-offset-1 outline-brand-purple'
          : 'outline outline-1 outline-offset-1 outline-transparent hover:outline-brand-purple/40',
        isEditing
          ? 'cursor-text outline outline-2 outline-brand-purple'
          : 'cursor-move',
        'focus-visible:outline-2 focus-visible:outline-brand-purple',
      ].join(' ')}
      style={{
        left: x * scale,
        // PDF y is the bottom edge; CSS top is measured from the page top.
        top: (pageHeightPt - y - height) * scale,
        width: width * scale,
        height: height * scale,
      }}
    >
      {children}

      {selected ? (
        <>
          <button
            type="button"
            aria-label={t('delete')}
            title={t('delete')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow"
          >
            ✕
          </button>

          <span
            role="slider"
            aria-label={t('resize')}
            aria-valuenow={Math.round(width)}
            aria-valuemin={MIN_SIZE_PT}
            aria-valuemax={Math.round(pageWidthPt)}
            tabIndex={-1}
            onPointerDown={(event) => startGesture(event, 'resize')}
            onPointerMove={onPointerMove}
            onPointerUp={endGesture}
            className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-sm border border-white bg-brand-purple shadow"
          />
        </>
      ) : null}
    </div>
  );
}
