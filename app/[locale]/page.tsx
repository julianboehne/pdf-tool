import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { TOOLS } from '@/lib/tools';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:py-20">
      <section className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          {t('home.headline')}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
          {t('home.subline')}
        </p>

        <p className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm text-emerald-800">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m4.5 12.75 6 6 9-13.5"
            />
          </svg>
          {t('home.privacyBadge')}
        </p>
      </section>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <li key={tool.id}>
            <Link
              href={tool.href}
              className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <span
                className={`mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br ${tool.accent} text-white`}
              >
                <ToolIcon id={tool.id} />
              </span>
              <span className="text-base font-semibold text-slate-900">
                {t(`tools.${tool.id}.title`)}
              </span>
              <span className="mt-1.5 text-sm text-slate-600">
                {t(`tools.${tool.id}.description`)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-16 grid gap-6 sm:grid-cols-3">
        {(['local', 'noUpload', 'free'] as const).map((key) => (
          <div key={key} className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">
              {t(`home.usp.${key}.title`)}
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              {t(`home.usp.${key}.text`)}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
