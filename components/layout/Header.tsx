import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { LocaleSwitcher } from './LocaleSwitcher';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { TOOLS } from '@/lib/tools';

export async function Header() {
  const t = await getTranslations();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-base font-semibold tracking-tight text-slate-900"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand text-xs font-bold text-white">
            P
          </span>
          {t('site.name')}
        </Link>

        <nav
          aria-label={t('nav.tools')}
          className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1"
        >
          {TOOLS.map((tool) => (
            <Link
              key={tool.id}
              href={tool.href}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <ToolIcon id={tool.id} className="h-4 w-4" />
              <span className="hidden sm:inline">{t(`tools.${tool.id}.short`)}</span>
            </Link>
          ))}
        </nav>

        <LocaleSwitcher />
      </div>
    </header>
  );
}
