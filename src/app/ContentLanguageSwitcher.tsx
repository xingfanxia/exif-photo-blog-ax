'use client';

import { Fragment } from 'react';
import { clsx } from 'clsx/lite';
import { useAppState } from './AppState';
import { ContentLanguage } from './content-language';

// FORK: language switcher for the whole site (UI chrome + photo content).
// Styled as quiet plain text to match the site's existing "PREV / NEXT"
// navigation vernacular — active language at full strength, the other dimmed,
// a hairline slash between. No bordered box.
const LANGUAGES: [ContentLanguage, string][] = [
  ['en', 'EN'],
  ['zh', '中'],
];

export default function ContentLanguageSwitcher() {
  const { contentLanguage, setContentLanguage } = useAppState();
  return (
    <div className="flex items-center gap-1.5 select-none leading-none">
      {LANGUAGES.map(([language, label], index) =>
        <Fragment key={language}>
          {index > 0 &&
            <span aria-hidden className="text-dim opacity-50">/</span>}
          <button
            type="button"
            aria-label={language === 'zh' ? '中文' : 'English'}
            aria-pressed={contentLanguage === language}
            onClick={() => setContentLanguage?.(language)}
            className={clsx(
              'cursor-pointer transition-colors duration-150',
              contentLanguage === language
                ? 'text-main'
                : 'text-dim hover:text-medium',
            )}
          >
            {label}
          </button>
        </Fragment>)}
    </div>
  );
}
