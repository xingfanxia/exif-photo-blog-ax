'use client';

import { ReactNode, useMemo } from 'react';
import { AppTextContext } from './client';
import { I18N } from '..';
import { generateAppTextState } from '.';
import { useAppState } from '@/app/AppState';

// FORK: pick the UI text matching the content-language toggle (en ↔ zh). SSR and
// the first client render both use the AppState default, so there's no hydration
// mismatch; the cookie sync then flips it (same model as photo content).
export default function AppTextProviderClient({
  children,
  en,
  zh,
}: {
  children: ReactNode
  en: I18N
  zh: I18N
}) {
  const { contentLanguage } = useAppState();
  const value = useMemo(
    () => generateAppTextState(contentLanguage === 'zh' ? zh : en),
    [contentLanguage, en, zh],
  );
  return (
    <AppTextContext.Provider value={value}>
      {children}
    </AppTextContext.Provider>
  );
}
