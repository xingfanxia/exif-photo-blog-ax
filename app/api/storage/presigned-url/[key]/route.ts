import { auth } from '@/auth/server';
import { getSignedUrlForKey } from '@/platforms/storage';
import { StorageKeySchema } from '@/platforms/storage/key';

// PLOG-12: validate the storage key before signing a PUT URL. Even though the
// route is admin-gated, an unconstrained key lets a signed PUT target any
// object (path traversal / overwrite).
export async function GET(
  _: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized request', { status: 401 });
  }

  const parsedKey = StorageKeySchema.safeParse(key);
  if (!parsedKey.success) {
    return new Response('Invalid storage key', { status: 400 });
  }

  const url = await getSignedUrlForKey(parsedKey.data, 'PUT');
  return new Response(
    url,
    { headers: { 'content-type': 'text/plain' } },
  );
}
