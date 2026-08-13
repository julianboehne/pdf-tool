import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { ACCENTS, type ToolId } from '@/lib/tools';

export async function ToolLayout({
  id,
  children,
}: {
  id: ToolId;
  children: ReactNode;
}) {
  const t = await getTranslations(`tools.${id}`);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8 flex items-start gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${ACCENTS[id]} text-white`}
        >
          <ToolIcon id={id} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">{t('description')}</p>
        </div>
      </header>

      {children}
    </div>
  );
}

/** Bordered surface used for the option blocks inside every tool. */
export function ToolCard({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {children}
    </section>
  );
}
