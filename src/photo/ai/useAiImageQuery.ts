import { useCallback, useState } from 'react';
import { streamAiImageQueryAction } from '../actions';
import { readStreamableValue } from '@ai-sdk/rsc';
import { AiImageQuery } from '.';

export default function useAiImageQuery(
  // Lazy resolver (PLOG-5): the thumbnail base64 is fetched on demand when the
  // AI request fires, not threaded as an eager RSC prop on every edit-open.
  getImageBase64: () => Promise<string | undefined>,
  query: AiImageQuery,
  existingTitle?: string,
) {
  const [text, setText] = useState('');
  const [error, setError] = useState<any>();
  const [isLoading, setIsLoading] = useState(false);

  const request = useCallback(async () => {
    setIsLoading(true);
    setText('');
    setError(undefined);
    try {
      const imageBase64 = await getImageBase64();
      if (!imageBase64) {
        // Surface a loud error instead of a silent no-op so the UI can reflect
        // that the image couldn't be loaded for AI generation (PLOG-5 review).
        setError(new Error('Could not load image for AI generation'));
        setIsLoading(false);
        return;
      }
      const textStream = await streamAiImageQueryAction(
        imageBase64,
        query,
        existingTitle,
      );
      for await (const text of readStreamableValue(textStream)) {
        setText(current => `${current}${text ?? ''}`);
      }
      setIsLoading(false);
    } catch (e) {
      setError(e);
      setIsLoading(false);
    }
  }, [getImageBase64, query, existingTitle]);

  const reset = useCallback(() => {
    setText('');
    setError(undefined);
    setIsLoading(false);
  }, []);

  // Withhold streaming text if it's a null response
  const isTextError = /^(I'*m )*sorry/i.test(text);

  return [
    request,
    isTextError ? '' : text,
    isLoading,
    reset,
    error,
  ] as const;
};
