import {
  copyFile,
  deleteFile,
  getFileNamePartsFromStorageUrl,
  moveFile,
  putFile,
} from '@/platforms/storage';
import { removeGpsData, resizeImageToBytes } from '../server';
import {
  generateRandomFileNameForPhoto,
  getOptimizedPhotoFileMeta,
} from '.';

export const storeOptimizedPhotosForUrl = async (
  url: string,
  _fileBytes?: ArrayBuffer,
) => {
  const fileBytes = _fileBytes
    ? _fileBytes
    : await fetch(url).then(res => res.arrayBuffer());
  const { fileNameBase } = getFileNamePartsFromStorageUrl(url);
  const optimizedPhotoFileMeta = getOptimizedPhotoFileMeta(fileNameBase);
  // Generate + upload the sm/md/lg variants in parallel (PLOG-6) — they're
  // independent, so the serial await-in-for needlessly serialized 3 sharp
  // passes + uploads on every photo store.
  await Promise.all(
    optimizedPhotoFileMeta.map(async ({ fileName, size, quality }) =>
      putFile(await resizeImageToBytes(fileBytes, size, quality), fileName),
    ),
  );
  return url;
};

export const convertUploadToPhoto = async ({
  uploadUrl,
  fileBytes: _fileBytes,
  shouldStripGpsData,
  shouldDeleteOrigin = true,
} : {
  uploadUrl: string
  fileBytes?: ArrayBuffer
  shouldStripGpsData?: boolean
  shouldDeleteOrigin?: boolean
}) => {
  const fileNameBase = generateRandomFileNameForPhoto();
  const { fileExtension } = getFileNamePartsFromStorageUrl(uploadUrl);
  const fileName = `${fileNameBase}.${fileExtension}`;
  const fileBytes = _fileBytes
    ? _fileBytes
    : await fetch(uploadUrl).then(res => res.arrayBuffer());
  let promise: Promise<string>;
  if (shouldStripGpsData) {
    const fileWithoutGps = await removeGpsData(fileBytes);
    promise = putFile(fileWithoutGps, fileName)
      .then(async url => {
        if (url && shouldDeleteOrigin) { await deleteFile(uploadUrl); }
        return url;
      });
  } else {
    promise = shouldDeleteOrigin
      ? moveFile(uploadUrl, fileName)
      : copyFile(uploadUrl, fileName);
  }
  // Store optimized photos after original photo is copied/moved
  const updatedUrl = await promise
    .then(async url => storeOptimizedPhotosForUrl(url, fileBytes));

  return updatedUrl;
};
