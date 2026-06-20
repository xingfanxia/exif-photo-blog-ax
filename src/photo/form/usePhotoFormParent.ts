import { useCallback, useState } from 'react';
import { PhotoFormData, formHasExistingAiTextContent } from '.';
import useAiImageQueries from '../ai/useAiImageQueries';

export default function usePhotoFormParent({
  photoForm,
  imageThumbnailBase64,
  getImageThumbnailBase64,
}: {
  photoForm?: Partial<PhotoFormData>
  // Upload: direct base64. Edit: lazy resolver (fetched on AI click). PLOG-5.
  imageThumbnailBase64?: string,
  getImageThumbnailBase64?: () => Promise<string | undefined>,
}) {
  const [pending, setIsPending] = useState(false);
  const [updatedTitle, setUpdatedTitle] = useState('');
  const [shouldConfirmAiTextGeneration, _setShouldConfirmAiTextGeneration] =
    useState(formHasExistingAiTextContent(photoForm));

  const setShouldConfirmAiTextGeneration = useCallback(
    (updatedFormData: Partial<PhotoFormData>) => {
      _setShouldConfirmAiTextGeneration(
        formHasExistingAiTextContent(updatedFormData),
      );
    }, []);

  const aiContent = useAiImageQueries(
    imageThumbnailBase64,
    getImageThumbnailBase64,
  );

  return {
    pending,
    setIsPending,
    updatedTitle,
    setUpdatedTitle,
    shouldConfirmAiTextGeneration,
    setShouldConfirmAiTextGeneration,
    aiContent,
  };
}
