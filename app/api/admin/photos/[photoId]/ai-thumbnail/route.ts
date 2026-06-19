import { auth } from '@/auth/server';
import { getPhoto } from '@/photo/query';
import { getOptimizedPhotoUrlForManipulation } from '@/photo/storage';
import { resizeImageFromUrl } from '@/photo/server';
import { IS_PREVIEW } from '@/app/config';
import { NextResponse } from 'next/server';

// Lazy AI-thumbnail endpoint (PLOG-5): the edit page no longer does a blocking
// full-image fetch + sharp resize on every open. The thumbnail (only needed
// when the admin clicks "Generate AI text") is produced here on demand.
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { photoId } = await params;
  const photo = await getPhoto(photoId, true);
  if (!photo) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
  }

  const thumbnailBase64 = await resizeImageFromUrl(
    getOptimizedPhotoUrlForManipulation(photo.url, IS_PREVIEW),
  );

  // resizeImageFromUrl swallows fetch/sharp errors and returns '' — surface
  // that as a 5xx so the client can distinguish failure from success and retry
  // (an empty body would otherwise be cached as a dead no-op result).
  if (!thumbnailBase64) {
    return NextResponse.json(
      { error: 'Could not generate thumbnail' },
      { status: 502 },
    );
  }

  return NextResponse.json({ thumbnailBase64 });
}
