import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ToolLayout } from '@/components/tools/ToolLayout';
import { EditTool } from '@/components/tools/EditTool';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tools.edit' });

  return { title: t('title'), description: t('description') };
}

export default async function EditPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ToolLayout id="edit">
      <EditTool />
    </ToolLayout>
  );
}
