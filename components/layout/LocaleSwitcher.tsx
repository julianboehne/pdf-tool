'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter, routing, type Locale } from '@/i18n/routing';

/**
 * Spec 2.1: a manual choice must beat auto-detection. next-intl's navigation
 * router writes the `NEXT_LOCALE` cookie on locale change, which the middleware
 * then prefers over `Accept-Language` on every later request.
 */
export function LocaleSwitcher() {
  const t = useTranslations('locale');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5"
      role="group"
      aria-label={t('label')}
    >
      {routing.locales.map((value) => (
        <button
          key={value}
          type="button"
          disabled={isPending}
          aria-current={value === locale ? 'true' : undefined}
          onClick={() =>
            startTransition(() => router.replace(pathname, { locale: value }))
          }
          className={[
            'rounded-md px-2.5 py-1 text-xs font-semibold uppercase transition',
            value === locale
              ? 'bg-slate-900 text-white'
              : 'text-slate-500 hover:text-slate-900',
          ].join(' ')}
        >
          {value}
        </button>
      ))}
    </div>
  );
}
