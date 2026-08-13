'use client';

import { useTranslations } from 'next-intl';
import { FONT_FAMILIES, type FontFamily } from '@/lib/pdf/fonts';
import type { TextAlign } from '@/lib/pdf/annotate';

/** Text attributes shared by the selection and by the next inserted box. */
export interface TextStyle {
  fontFamily: FontFamily;
  fontSize: number;
  color: string;
  background: string | null;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'helvetica',
  fontSize: 14,
  color: '#111827',
  background: null,
  bold: false,
  italic: false,
  align: 'left',
};

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

/**
 * Alignment icons drawn as stacked rules, the way every office suite shows
 * them — arrow glyphs read as "move", not as "align".
 */
const ALIGNMENT_RULES: Record<TextAlign, Array<[number, number]>> = {
  //            [x-start, x-end] per rule, on a 16-wide grid
  left: [
    [1, 15],
    [1, 10],
    [1, 15],
    [1, 8],
  ],
  center: [
    [1, 15],
    [4, 12],
    [1, 15],
    [5, 11],
  ],
  right: [
    [1, 15],
    [6, 15],
    [1, 15],
    [8, 15],
  ],
};

function AlignIcon({ align }: { align: TextAlign }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 12"
      className="h-3.5 w-3.5"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
    >
      {ALIGNMENT_RULES[align].map(([from, to], index) => (
        <line key={index} x1={from} x2={to} y1={1.5 + index * 3} y2={1.5 + index * 3} />
      ))}
    </svg>
  );
}

export function FormatBar({
  style,
  onChange,
  disabled,
}: {
  style: TextStyle;
  onChange: (patch: Partial<TextStyle>) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('tools.edit');

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        aria-label={t('fontFamilyLabel')}
        value={style.fontFamily}
        disabled={disabled}
        onChange={(event) =>
          onChange({ fontFamily: event.target.value as FontFamily })
        }
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
      >
        {FONT_FAMILIES.map((family) => (
          <option key={family} value={family}>
            {t(`font.${family}`)}
          </option>
        ))}
      </select>

      <select
        aria-label={t('fontSizeLabel')}
        value={style.fontSize}
        disabled={disabled}
        onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
        className="w-[4.5rem] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm tabular-nums text-slate-800"
      >
        {SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>

      <Toggle
        label={t('boldLabel')}
        pressed={style.bold}
        disabled={disabled}
        onClick={() => onChange({ bold: !style.bold })}
      >
        <span className="font-bold">F</span>
      </Toggle>

      <Toggle
        label={t('italicLabel')}
        pressed={style.italic}
        disabled={disabled}
        onClick={() => onChange({ italic: !style.italic })}
      >
        <span className="italic">K</span>
      </Toggle>

      <span className="mx-0.5 h-6 w-px bg-slate-200" />

      {(['left', 'center', 'right'] as const).map((align) => (
        <Toggle
          key={align}
          label={t(`align.${align}`)}
          pressed={style.align === align}
          disabled={disabled}
          onClick={() => onChange({ align })}
        >
          <AlignIcon align={align} />
        </Toggle>
      ))}

      <span className="mx-0.5 h-6 w-px bg-slate-200" />

      <ColorField
        label={t('textColorLabel')}
        value={style.color}
        disabled={disabled}
        onChange={(color) => onChange({ color })}
      />

      <ColorField
        label={t('backgroundLabel')}
        value={style.background ?? '#ffffff'}
        disabled={disabled || style.background === null}
        onChange={(background) => onChange({ background })}
        // A text box with no fill lets the page show through; that is the
        // default, and the checkbox is how you turn a real fill on.
        toggle={{
          checked: style.background !== null,
          onToggle: (on) => onChange({ background: on ? '#ffffff' : null }),
        }}
      />
    </div>
  );
}

function Toggle({
  label,
  pressed,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  pressed: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      {...props}
      className={[
        'flex h-8 w-8 items-center justify-center rounded-lg text-sm transition',
        pressed
          ? 'bg-slate-900 text-white'
          : 'text-slate-700 hover:bg-slate-100',
        'disabled:opacity-40',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function ColorField({
  label,
  value,
  onChange,
  disabled,
  toggle,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  toggle?: { checked: boolean; onToggle: (on: boolean) => void };
}) {
  return (
    <span className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-1.5 py-1">
      {toggle ? (
        <input
          type="checkbox"
          aria-label={label}
          checked={toggle.checked}
          onChange={(event) => toggle.onToggle(event.target.checked)}
          className="h-3.5 w-3.5 rounded border-slate-300 text-brand-purple"
        />
      ) : null}

      <input
        type="color"
        aria-label={label}
        title={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0 disabled:opacity-30"
      />
    </span>
  );
}

/** Stroke, fill and weight for shapes, lines and arrows. */
export interface ShapeStyle {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  opacity: number;
}

export const DEFAULT_SHAPE_STYLE: ShapeStyle = {
  fill: null,
  stroke: '#dc2626',
  strokeWidth: 2,
  opacity: 1,
};

export function ShapeBar({
  style,
  onChange,
  /** Lines have no interior, so the fill control is hidden for them. */
  showFill = true,
  disabled,
}: {
  style: ShapeStyle;
  onChange: (patch: Partial<ShapeStyle>) => void;
  showFill?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations('tools.edit');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ColorField
        label={t('strokeLabel')}
        value={style.stroke ?? '#dc2626'}
        disabled={disabled || style.stroke === null}
        onChange={(stroke) => onChange({ stroke })}
        toggle={{
          checked: style.stroke !== null,
          onToggle: (on) => onChange({ stroke: on ? '#dc2626' : null }),
        }}
      />

      {showFill ? (
        <ColorField
          label={t('fillLabel')}
          value={style.fill ?? '#ffffff'}
          disabled={disabled || style.fill === null}
          onChange={(fill) => onChange({ fill })}
          toggle={{
            checked: style.fill !== null,
            onToggle: (on) => onChange({ fill: on ? '#ffffff' : null }),
          }}
        />
      ) : null}

      <label className="flex items-center gap-2 text-sm text-slate-600">
        {t('strokeWidthLabel')}
        <select
          value={style.strokeWidth}
          disabled={disabled}
          onChange={(event) =>
            onChange({ strokeWidth: Number(event.target.value) })
          }
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm tabular-nums text-slate-800"
        >
          {[1, 2, 3, 4, 6, 8, 12].map((width) => (
            <option key={width} value={width}>
              {width} pt
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        {t('opacityLabel')}
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={Math.round(style.opacity * 100)}
          disabled={disabled}
          onChange={(event) =>
            onChange({ opacity: Number(event.target.value) / 100 })
          }
          className="h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-slate-200 accent-brand-purple"
        />
        <span className="w-10 text-right tabular-nums">
          {Math.round(style.opacity * 100)} %
        </span>
      </label>
    </div>
  );
}

/** Marker colours, kept few and saturated so they read as highlighter ink. */
export const HIGHLIGHT_COLORS = [
  '#fde047',
  '#86efac',
  '#7dd3fc',
  '#f9a8d4',
  '#fdba74',
];

export function HighlightBar({
  color,
  onChange,
  disabled,
}: {
  color: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('tools.edit');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-600">{t('markerColorLabel')}</span>

      {HIGHLIGHT_COLORS.map((entry) => (
        <button
          key={entry}
          type="button"
          disabled={disabled}
          aria-label={t(`markerColor.${entry.replace('#', '')}`)}
          aria-pressed={color === entry}
          onClick={() => onChange(entry)}
          style={{ backgroundColor: entry }}
          className={[
            'h-7 w-7 rounded-full border-2 transition',
            color === entry
              ? 'border-slate-900 scale-110'
              : 'border-transparent hover:border-slate-300',
          ].join(' ')}
        />
      ))}

      <span className="text-xs text-slate-500">{t('markerHint')}</span>
    </div>
  );
}
