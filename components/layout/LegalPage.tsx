import { getTranslations } from 'next-intl/server';

/**
 * Renders a numbered list of `<namespace>.sections.<n>.{heading,body}` messages.
 *
 * The technical statements (client-side processing, no upload) are accurate as
 * written. Operator-specific entries — company details, contact, ad network —
 * are marked `[TODO …]` in messages/*.json and must be filled in before launch;
 * see README, "Vor dem Launch".
 */
export async function LegalPage({
  namespace,
  sectionCount,
}: {
  namespace: 'privacy' | 'imprint';
  sectionCount: number;
}) {
  const t = await getTranslations(namespace);

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {t('title')}
      </h1>
      <p className="mt-3 text-sm text-slate-600">{t('intro')}</p>

      <div className="mt-8 flex flex-col gap-6">
        {Array.from({ length: sectionCount }, (_, i) => (
          <section key={i}>
            <h2 className="text-base font-semibold text-slate-900">
              {t(`sections.${i}.heading`)}
            </h2>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">
              {t(`sections.${i}.body`)}
            </p>
          </section>
        ))}
      </div>
    </article>
  );
}
