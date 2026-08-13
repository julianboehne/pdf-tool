import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';

export async function Footer() {
  const t = await getTranslations('footer');

  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>{t('privacyClaim')}</p>

        <nav className="flex gap-4" aria-label={t('legal')}>
          <Link href="/privacy" className="hover:text-slate-900">
            {t('privacy')}
          </Link>
          <Link href="/imprint" className="hover:text-slate-900">
            {t('imprint')}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
