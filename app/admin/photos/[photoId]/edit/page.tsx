import { redirect } from 'next/navigation';
import {
  getPhotoNoStore,
  getUniqueFilmsCached,
  getUniqueRecipesCached,
  getUniqueTagsCached,
} from '@/photo/cache';
import {
  getAlbumTitlesForPhotoCached,
  getAlbumsWithMetaCached,
} from '@/album/cache';
import { PATH_ADMIN } from '@/app/path';
import PhotoEditPageClient from '@/photo/PhotoEditPageClient';
import { AI_CONTENT_GENERATION_ENABLED } from '@/app/config';
import { getStorageUrlsForPhoto } from '@/photo/storage';

export default async function PhotoEditPage({
  params,
}: {
  params: Promise<{ photoId: string }>
}) {
  const { photoId } = await params;

  const [
    photo,
    photoAlbumTitles,
    albums,
    uniqueTags,
    uniqueRecipes,
    uniqueFilms,
  ] = await Promise.all([
    getPhotoNoStore(photoId, true),
    getAlbumTitlesForPhotoCached(photoId),
    getAlbumsWithMetaCached(),
    getUniqueTagsCached(),
    getUniqueRecipesCached(),
    getUniqueFilmsCached(),
  ]);

  if (!photo) { redirect(PATH_ADMIN); }

  const photoStorageUrls = await getStorageUrlsForPhoto(photo);

  const hasAiTextGeneration = AI_CONTENT_GENERATION_ENABLED;

  // PLOG-5: use the persisted blur_data instead of a blocking full-image
  // fetch + sharp blur on every edit-open. The AI thumbnail is likewise no
  // longer computed here — it's fetched lazily on AI-generate click via
  // /api/admin/photos/[photoId]/ai-thumbnail (see PhotoEditPageClient).
  const blurData = photo.blurData ?? '';

  return (
    <PhotoEditPageClient {...{
      photo,
      photoStorageUrls,
      photoAlbumTitles,
      albums,
      uniqueTags,
      uniqueRecipes,
      uniqueFilms,
      hasAiTextGeneration,
      blurData,
    }} />
  );
};
