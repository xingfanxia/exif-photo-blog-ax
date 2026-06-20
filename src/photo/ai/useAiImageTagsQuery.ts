import { useCallback, useState } from 'react';
import { generateAiImageTagsAction } from '../actions';

// PLOG-15: tags are a CONTROLLED facet classification (structured output), so —
// unlike title/caption/semantic — they can't stream as free text. This hook
// runs the NON-streaming object-path action and returns the collapsed
// `tags`/`tagsZh` CSV, keeping the interactive form's tag generation identical
// to the batch/backfill path.
export default function useAiImageTagsQuery(
  getImageBase64: () => Promise<string | undefined>,
) {
  const [tags, setTags] = useState('');
  const [tagsZh, setTagsZh] = useState('');
  const [error, setError] = useState<any>();
  const [isLoading, setIsLoading] = useState(false);

  const request = useCallback(async () => {
    setIsLoading(true);
    setTags('');
    setTagsZh('');
    setError(undefined);
    try {
      const imageBase64 = await getImageBase64();
      if (!imageBase64) {
        setError(new Error('Could not load image for AI generation'));
        setIsLoading(false);
        return;
      }
      const result = await generateAiImageTagsAction(imageBase64);
      setTags(result.tags);
      setTagsZh(result.tagsZh);
      setIsLoading(false);
    } catch (e) {
      setError(e);
      setIsLoading(false);
    }
  }, [getImageBase64]);

  const reset = useCallback(() => {
    setTags('');
    setTagsZh('');
    setError(undefined);
    setIsLoading(false);
  }, []);

  return [request, tags, tagsZh, isLoading, reset, error] as const;
}
