const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

export function formatBytes(bytes: number, locale = 'en'): string {
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);

  return `${formatted} ${UNITS[unit]}`;
}

/** Percentage saved, clamped at 0 — some documents get larger, not smaller. */
export function savingsPercent(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.max(0, Math.round(((before - after) / before) * 100));
}
