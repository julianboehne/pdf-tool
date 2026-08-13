import type { ReactNode } from 'react';

// html/body are provided by app/[locale]/layout.tsx so the `lang` attribute can
// depend on the resolved locale.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
