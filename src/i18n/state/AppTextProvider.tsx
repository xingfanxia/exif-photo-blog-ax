import { ReactNode } from 'react';
import { getTextForLocale } from '..';
import AppTextProviderClient from './AppTextProviderClient';

// FORK: load BOTH the English and Simplified-Chinese UI text server-side and
// hand both to the client provider, which selects one from the content-language
// toggle (AppState). Makes the EN/中 switch full-site (UI chrome + photo
// content) without a per-request cookie read that would de-opt ISR.
export default async function AppTextProvider({
  children,
}: {
  children: ReactNode
}) {
  const [en, zh] = await Promise.all([
    getTextForLocale('en-us'),
    getTextForLocale('zh-cn'),
  ]);
  return (
    <AppTextProviderClient {...{ en, zh }}>
      {children}
    </AppTextProviderClient>
  );
}
