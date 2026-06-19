import {
  BASE_URL,
  IMAGE_QUALITY,
  VERCEL_BYPASS_KEY,
  VERCEL_BYPASS_SECRET,
} from '@/app/config';
import { ImageVariantSize } from '@/photo/imageLoader';

// Custom `imageSizes` — sourced from the shared PLOG-6 variant module so this
// type can't silently desync from next.config / the loader (was a bare `200`).
type NextCustomSize = ImageVariantSize;

type NextImageDeviceSize = 640 | 750 | 828 | 1080 | 1200 | 1920 | 2048 | 3840;

export type NextImageSize = NextCustomSize | NextImageDeviceSize;

export const MAX_IMAGE_SIZE: NextImageSize = 3840;

export const getNextImageUrlForRequest = ({
  imageUrl,
  size,
  quality = IMAGE_QUALITY,
  baseUrl = BASE_URL,
  addBypassSecret,
}: {
  imageUrl: string
  size: NextImageSize
  quality?: number
  baseUrl?: string
  addBypassSecret?: boolean
}) => {
  const url = new URL(`${baseUrl}/_next/image`);

  url.searchParams.append('url', imageUrl);
  url.searchParams.append('w', size.toString());
  url.searchParams.append('q', quality.toString());

  if (addBypassSecret && VERCEL_BYPASS_SECRET) {
    url.searchParams.append(VERCEL_BYPASS_KEY, VERCEL_BYPASS_SECRET);
  }

  return url.toString();
};
