import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ToolLayout } from '@/components/tools/ToolLayout';
import { OrganizeTool } from '@/components/tools/OrganizeTool';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tools.organize' });

  return { title: t('title'), description: t('description') };
}

export default async function OrganizePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ToolLayout id="organize">
      <OrganizeTool />
    </ToolLayout>
  );
}
