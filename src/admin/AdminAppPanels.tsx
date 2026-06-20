'use client';

import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { useAppState } from '@/app/AppState';
import { getBatchEditDataAction } from '@/admin/actions';

// PLOG-14: gate the admin upload + batch-edit panels out of the anonymous tree.
// The gate reads `isUserSignedInEager` (a client-readable cookie) — NOT a server
// cookie — so the root layout stays statically renderable AND the anonymous SSR
// output contains no admin components/JS. The panels are dynamically imported
// (ssr:false) so their chunks never ship to logged-out visitors, and the
// batch-edit data is fetched client-side via SWR only when signed in.
const AdminUploadPanel = dynamic(
  () => import('@/admin/upload/AdminUploadPanel'),
  { ssr: false },
);
const AdminBatchEditPanelClient = dynamic(
  () => import('@/admin/select/AdminBatchEditPanelClient'),
  { ssr: false },
);

export default function AdminAppPanels({
  shouldResize,
  onLastUpload,
}: {
  shouldResize: boolean
  onLastUpload: () => Promise<void>
}) {
  const { isUserSignedInEager } = useAppState();

  const { data } = useSWR(
    isUserSignedInEager ? 'admin-batch-edit-data' : null,
    () => getBatchEditDataAction(),
  );

  if (!isUserSignedInEager) { return null; }

  return (
    <>
      <AdminUploadPanel
        shouldResize={shouldResize}
        onLastUpload={onLastUpload}
      />
      {data &&
        <AdminBatchEditPanelClient
          uniqueAlbums={data.uniqueAlbums}
          uniqueTags={data.uniqueTags}
        />}
    </>
  );
}
