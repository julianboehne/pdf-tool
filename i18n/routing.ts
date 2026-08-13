import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

/**
 * Spec 2.1: English is the default. Any `de*` browser locale resolves to
 * German, everything else falls back to English. next-intl negotiates this
 * from `Accept-Language` in the middleware and honours a `NEXT_LOCALE` cookie
 * written by the language switcher, so a manual choice always wins.
 */
export const routing = defineRouting({
  locales: ['en', 'de'] as const,
  defaultLocale: 'en',
  localePrefix: 'always',
  localeDetection: true,
});

export type Locale = (typeof routing.locales)[number];

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
