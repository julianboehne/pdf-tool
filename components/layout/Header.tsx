import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { LocaleSwitcher } from './LocaleSwitcher';
import { ToolsMenu } from './ToolsMenu';

export async function Header() {
  const t = await getTranslations();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-base font-semibold tracking-tight text-slate-900"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand text-xs font-bold text-white">
            P
          </span>
          {t('site.name')}
        </Link>

        <nav aria-label={t('nav.tools')} className="ml-2">
          <ToolsMenu />
        </nav>

        <span className="flex-1" />

        <LocaleSwitcher />
      </div>
    </header>
  );
}
