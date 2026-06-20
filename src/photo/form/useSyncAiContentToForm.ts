import { Dispatch, SetStateAction, useEffect } from 'react';
import { PhotoFormData } from '.';
import { AiContent } from '@/photo/ai/useAiImageQueries';

// PLOG-14: extracted from PhotoForm — sync streamed AI fields into the form as
// they arrive. Each field has its own effect keyed on that field so a slow
// field doesn't hold up the others. setFormData (useState setter) is stable.
export default function useSyncAiContentToForm(
  aiContent: AiContent | undefined,
  setFormData: Dispatch<SetStateAction<Partial<PhotoFormData>>>,
) {
  useEffect(() =>
    setFormData(data => aiContent?.title
      ? { ...data, title: aiContent.title }
      : data),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [aiContent?.title]);

  useEffect(() =>
    setFormData(data => aiContent?.caption
      ? { ...data, caption: aiContent.caption }
      : data),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [aiContent?.caption]);

  useEffect(() =>
    setFormData(data => aiContent?.tags
      ? { ...data, tags: aiContent.tags }
      : data),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [aiContent?.tags]);

  // PLOG-15: tags now generate bilingually (faceted object path) — sync the
  // zh siblings into the form alongside the canonical en tags.
  useEffect(() =>
    setFormData(data => aiContent?.tagsZh
      ? { ...data, tagsZh: aiContent.tagsZh }
      : data),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [aiContent?.tagsZh]);

  useEffect(() =>
    setFormData(data => aiContent?.semanticDescription
      ? { ...data, semanticDescription: aiContent.semanticDescription }
      : data),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [aiContent?.semanticDescription]);
}
