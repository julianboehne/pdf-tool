'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Field, Slider, TextInput } from '@/components/ui/Field';

export interface SignatureImage {
  dataUrl: string;
  /** Intrinsic pixel size, used to keep the placed signature proportional. */
  width: number;
  height: number;
}

type Method = 'draw' | 'type' | 'upload';

// The pad is rasterised at this size; placement scales it down, so drawing at
// well above the final size keeps the stroke crisp in the exported PDF.
const PAD_WIDTH = 900;
const PAD_HEIGHT = 300;

export function SignaturePad({
  onCreate,
  disabled = false,
}: {
  onCreate: (signature: SignatureImage) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('sign');

  const [method, setMethod] = useState<Method>('draw');
  const [color, setColor] = useState('#1e293b');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [typed, setTyped] = useState('');
  const [hasInk, setHasInk] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = PAD_WIDTH;
    canvas.height = PAD_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);

    setHasInk(false);
  }, [method]);

  /** Canvas pixel coordinates for a pointer event, independent of CSS size. */
  const toCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const strokeTo = (point: { x: number; y: number }) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !last.current) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    last.current = point;
    setHasInk(true);
  };

  const clearPad = () => {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const commitDrawn = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const trimmed = trimToInk(canvas);
    if (trimmed) onCreate(trimmed);
  };

  const commitTyped = () => {
    if (!typed.trim()) return;

    const canvas = document.createElement('canvas');
    canvas.width = PAD_WIDTH;
    canvas.height = PAD_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // A handwriting face if the system has one, falling back to generic cursive.
    ctx.font = `120px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(typed, PAD_WIDTH / 2, PAD_HEIGHT / 2, PAD_WIDTH - 40);

    const trimmed = trimToInk(canvas);
    if (trimmed) onCreate(trimmed);
  };

  const commitUpload = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const image = new Image();
    image.src = dataUrl;
    await image.decode();

    onCreate({ dataUrl, width: image.naturalWidth, height: image.naturalHeight });
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={t('methodLabel')}
        className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1"
      >
        {(['draw', 'type', 'upload'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={method === value}
            disabled={disabled}
            onClick={() => setMethod(value)}
            className={[
              'rounded-md px-3.5 py-2 text-sm font-medium transition',
              method === value
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            ].join(' ')}
          >
            {t(`method.${value}`)}
          </button>
        ))}
      </div>

      {method === 'draw' ? (
        <>
          <canvas
            ref={canvasRef}
            aria-label={t('padLabel')}
            onPointerDown={(event) => {
              if (disabled) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drawing.current = true;
              last.current = toCanvasPoint(event);
              // A single tap should leave a dot, not nothing.
              strokeTo(toCanvasPoint(event));
            }}
            onPointerMove={(event) => {
              if (!drawing.current) return;
              strokeTo(toCanvasPoint(event));
            }}
            onPointerUp={() => {
              drawing.current = false;
              last.current = null;
            }}
            onPointerCancel={() => {
              drawing.current = false;
              last.current = null;
            }}
            className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
          />

          <p className="text-xs text-slate-500">{t('padHint')}</p>
        </>
      ) : null}

      {method === 'type' ? (
        <>
          <Field label={t('typedLabel')} htmlFor="sig-typed">
            <TextInput
              id="sig-typed"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              maxLength={60}
              disabled={disabled}
            />
          </Field>

          <div
            aria-hidden="true"
            className="flex h-24 items-center justify-center rounded-lg border border-slate-200 bg-white"
            style={{
              color,
              fontSize: 44,
              fontFamily:
                '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive',
            }}
          >
            {typed || t('typedPlaceholder')}
          </div>
        </>
      ) : null}

      {method === 'upload' ? (
        <label className="cursor-pointer rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600 transition hover:border-brand-purple/60">
          {t('uploadLabel')}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) void commitUpload(chosen);
              event.target.value = '';
            }}
          />
          <span className="mt-2 block text-xs text-slate-400">
            {t('uploadHint')}
          </span>
        </label>
      ) : null}

      {method !== 'upload' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('colorLabel')} htmlFor="sig-color">
            <input
              id="sig-color"
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              disabled={disabled}
              className="h-10 w-20 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
            />
          </Field>

          {method === 'draw' ? (
            <Field label={t('strokeLabel')} htmlFor="sig-stroke">
              <Slider
                id="sig-stroke"
                min={1}
                max={12}
                step={1}
                value={strokeWidth}
                valueLabel={`${strokeWidth} px`}
                onChange={(event) => setStrokeWidth(Number(event.target.value))}
                disabled={disabled}
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      {method !== 'upload' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={method === 'draw' ? commitDrawn : commitTyped}
            disabled={disabled || (method === 'draw' ? !hasInk : !typed.trim())}
          >
            {t('useSignature')}
          </Button>

          {method === 'draw' ? (
            <Button variant="secondary" onClick={clearPad} disabled={disabled}>
              {t('clear')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Crops the canvas to its non-transparent pixels.
 *
 * Without this the signature would carry the pad's whole empty margin, and
 * placing it on the page would mean dragging a mostly invisible box around.
 */
function trimToInk(canvas: HTMLCanvasElement): SignatureImage | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;

  const padding = 8;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);

  const cropped = document.createElement('canvas');
  cropped.width = maxX - minX + 1;
  cropped.height = maxY - minY + 1;

  cropped
    .getContext('2d')
    ?.drawImage(
      canvas,
      minX,
      minY,
      cropped.width,
      cropped.height,
      0,
      0,
      cropped.width,
      cropped.height,
    );

  return {
    // PNG keeps the transparent background, so the signature sits on the page
    // rather than in a white box.
    dataUrl: cropped.toDataURL('image/png'),
    width: cropped.width,
    height: cropped.height,
  };
}
