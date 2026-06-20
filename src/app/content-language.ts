// FORK: content-language toggle for bilingual photo fields.
//
// This is DISTINCT from the UI-chrome i18n locale (APP_LOCALE / AppText): that
// localizes interface strings; this switches PHOTO CONTENT (title, caption,
// tags, semantic description) between English and Simplified Chinese, backed by
// the `*_zh` DB columns. Lives in its own module so the photo helpers, AppState,
// the toggle button, and the server cookie reader can all share it without a
// circular import.

export type ContentLanguage = 'en' | 'zh';

export const CONTENT_LANGUAGE_COOKIE = 'content-language';

export const DEFAULT_CONTENT_LANGUAGE: ContentLanguage =
  process.env.NEXT_PUBLIC_DEFAULT_CONTENT_LANGUAGE === 'zh' ? 'zh' : 'en';

export const parseContentLanguage = (
  value?: string | null,
): ContentLanguage => (value === 'zh' ? 'zh' : 'en');

// Pick the zh value when the active language is zh AND a non-empty zh value
// exists; otherwise fall back to the canonical (English) value. Used for the
// scalar text fields (title / caption / semantic).
export const localizedText = (
  lang: ContentLanguage | undefined,
  en: string | undefined,
  zh: string | undefined | null,
): string | undefined =>
  lang === 'zh' && zh != null && zh !== '' ? zh : en;

// Tag display labels: in zh mode, show the aligned zh labels when present;
// otherwise the canonical tags. Routing/filtering always uses the canonical
// tags (the slugs), so this only affects what the user SEES.
export const localizedTags = (
  lang: ContentLanguage | undefined,
  tags: string[],
  tagsZh: string[] | undefined | null,
): string[] =>
  lang === 'zh' && tagsZh && tagsZh.length === tags.length ? tagsZh : tags;
