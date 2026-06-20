'use client';

import Switcher from '@/components/switcher/Switcher';
import SwitcherItem from '@/components/switcher/SwitcherItem';
import { useAppState } from './AppState';

// FORK: user-facing toggle for the language of PHOTO CONTENT (title/caption/
// tags/semantic). Distinct from the theme + UI-locale switchers. Writes the
// content-language cookie via AppState so server surfaces stay in sync.
export default function ContentLanguageSwitcher() {
  const {
    contentLanguage,
    setContentLanguage,
    hasLoadedWithAnimations,
  } = useAppState();

  return (
    <Switcher className="translate-x-[-1px]">
      <SwitcherItem
        icon={<span className="text-[11px] font-medium tracking-wide">EN</span>}
        onClick={() => setContentLanguage?.('en')}
        active={hasLoadedWithAnimations && contentLanguage === 'en'}
        tooltip={{ content: 'English' }}
      />
      <SwitcherItem
        icon={<span className="text-[14px] leading-none">中</span>}
        onClick={() => setContentLanguage?.('zh')}
        active={hasLoadedWithAnimations && contentLanguage === 'zh'}
        tooltip={{ content: '中文' }}
      />
    </Switcher>
  );
}
