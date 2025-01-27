import { useCallback, useState } from 'react';
import { streamAiImageQueryAction } from '../actions';
import { readStreamableValue, StreamableValue } from 'ai/rsc';
import { AiImageQuery } from '.';

export default function useAiImageQuery(
  imageBase64: string | undefined,
  query: AiImageQuery,
) {
  const [text, setText] = useState('');
  const [error, setError] = useState<any>();
  const [isLoading, setIsLoading] = useState(false);

  const request = useCallback(async () => {
    if (imageBase64) {
      setIsLoading(true);
      setText('');
      try {
        const textStream = await streamAiImageQueryAction(
          imageBase64,
          query,
        ) as StreamableValue<string>;
        if (textStream) {
          for await (const chunk of readStreamableValue(textStream)) {
            setText(current => `${current}${chunk ?? ''}`);
          }
        }
        setIsLoading(false);
      } catch (e) {
        setError(e);
        setIsLoading(false);
      }
    }
  }, [imageBase64, query]);

  const reset = useCallback(() => {
    setText('');
    setError(undefined);
    setIsLoading(false);
  }, []);

  // Withhold streaming text if it's a null response
  const isTextError = text.toLocaleLowerCase().startsWith('sorry');

  return [
    request,
    isTextError ? '' : text,
    isLoading,
    reset,
    error,
  ] as const;
};
