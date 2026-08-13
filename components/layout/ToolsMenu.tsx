'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { TOOLS } from '@/lib/tools';

/**
 * The tool list outgrew a row of inline links — the German labels
 * ("Zusammenfügen", "Wasserzeichen", "Seitenzahlen") crowd the header, and
 * Phase 2 adds more tools still. A disclosure panel keeps the header the same
 * width in every language and scales to the full catalogue.
 */
export function ToolsMenu() {
  const t = useTranslations();
  const panelId = useId();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on route change, so following a link never leaves the panel hanging.
  useEffect(() => setIsOpen(false), [pathname]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
      >
        {t('nav.tools')}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen ? (
        <div
          id={panelId}
          className="absolute left-0 top-full z-50 mt-2 w-[min(30rem,calc(100vw-2rem))] animate-fade-up rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
        >
          <ul className="grid gap-0.5 sm:grid-cols-2">
            {TOOLS.map((tool) => {
              const isCurrent = pathname === tool.href;

              return (
                <li key={tool.id}>
                  <Link
                    href={tool.href}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={`flex items-start gap-3 rounded-lg p-2.5 transition ${
                      isCurrent ? 'bg-slate-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${tool.accent} text-white`}
                    >
                      <ToolIcon id={tool.id} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">
                        {t(`tools.${tool.id}.title`)}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                        {t(`tools.${tool.id}.short`)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
