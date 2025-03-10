'use client';

import { clsx } from 'clsx/lite';
import SiteGrid from '@/components/SiteGrid';
import {
  AI_TEXT_GENERATION_ENABLED,
  PRESERVE_ORIGINAL_UPLOADS,
} from '@/app/config';
import AdminPhotosTable from '@/admin/AdminPhotosTable';
import AdminPhotosTableInfinite from '@/admin/AdminPhotosTableInfinite';
import PathLoaderButton from '@/components/primitives/PathLoaderButton';
import { PATH_ADMIN_OUTDATED } from '@/app/paths';
import { Photo } from '@/photo';
import { StorageListResponse } from '@/platforms/storage';
import { LiaBroomSolid } from 'react-icons/lia';
import AdminUploadsTable from './AdminUploadsTable';
import { Timezone } from '@/utility/timezone';
import { HiSparkles } from 'react-icons/hi';
import ProgressButton from '@/components/primitives/ProgressButton';
import { syncPhotosAction, getAllPhotoIdsAction } from '@/photo/actions';
import { toastSuccess } from '@/toast';
import { useState, useEffect } from 'react';
import { useAppState } from '@/state/AppState';
import { useRouter } from 'next/navigation';
import PhotoUploadWithStatus from '@/photo/PhotoUploadWithStatus';

export default function AdminPhotosClient({
  photos,
  photosCount,
  photosCountOutdated,
  blobPhotoUrls,
  shouldResize,
  onLastUpload,
  infiniteScrollInitial,
  infiniteScrollMultiple,
  timezone,
  hasAiTextGeneration,
}: {
  photos: Photo[]
  photosCount: number
  photosCountOutdated: number
  blobPhotoUrls: StorageListResponse
  shouldResize: boolean
  onLastUpload: () => Promise<void>
  infiniteScrollInitial: number
  infiniteScrollMultiple: number
  timezone: Timezone
  hasAiTextGeneration: boolean
}) {
  const { uploadState: { isUploading } } = useAppState();
  const [isRegeneratingAI, setIsRegeneratingAI] = useState(false);
  const [regenerationProgress, setRegenerationProgress] = useState<number>();
  const [showAiButton, setShowAiButton] = useState(false);
  const { registerAdminUpdate } = useAppState();
  const router = useRouter();

  useEffect(() => {
    setShowAiButton(hasAiTextGeneration);
  }, [hasAiTextGeneration]);

  const handleRegenerateAI = async () => {
    if (!confirm(`Are you sure you want to regenerate AI fields for all ${photosCount} photos? This may take a while.`)) {
      return;
    }

    setIsRegeneratingAI(true);
    setRegenerationProgress(0);

    try {
      // Process photos in batches of 4 to avoid overwhelming the server
      const BATCH_SIZE = 4;
      let processedCount = 0;

      // Fetch all photo IDs using server action
      const allPhotoIds = await getAllPhotoIdsAction();
      const photoBatches = [];
      for (let i = 0; i < allPhotoIds.length; i += BATCH_SIZE) {
        photoBatches.push(allPhotoIds.slice(i, i + BATCH_SIZE));
      }

      for (let i = 0; i < photoBatches.length; i++) {
        const batch = photoBatches[i];
        await syncPhotosAction(batch, true);
        
        processedCount += batch.length;
        // Update progress
        const progress = Math.min(processedCount / photosCount, 1);
        setRegenerationProgress(progress);
      }

      toastSuccess(`AI fields regenerated for all ${photosCount} photos`);
      // Register update and refresh the page
      registerAdminUpdate?.();
      router.refresh();
    } catch (error) {
      console.error('Error regenerating AI fields:', error);
      toastSuccess('Error regenerating AI fields. Please try again.');
    } finally {
      setIsRegeneratingAI(false);
      setRegenerationProgress(undefined);
    }
  };

  return (
    <SiteGrid
      contentMain={
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="grow min-w-0">
              <PhotoUploadWithStatus
                inputId="admin-photos"
                shouldResize={shouldResize}
                onLastUpload={onLastUpload}
              />
            </div>
            {showAiButton && (
              <ProgressButton
                icon={<HiSparkles size={16} />}
                isLoading={isRegeneratingAI}
                progress={regenerationProgress}
                onClick={handleRegenerateAI}
                hideTextOnMobile={false}
              >
                {isRegeneratingAI 
                  ? `Regenerating ${Math.round((regenerationProgress || 0) * 100)}%`
                  : 'Regen AI Fields'}
              </ProgressButton>
            )}
            {photosCountOutdated > 0 && <PathLoaderButton
              path={PATH_ADMIN_OUTDATED}
              icon={<LiaBroomSolid size={18} className="translate-y-[-1px]" />}
              title={`${photosCountOutdated} Outdated Photos`}
              className={clsx(
                'text-blue-600 dark:text-blue-400',
                'border border-blue-200 dark:border-blue-800/60',
                'active:bg-blue-50 dark:active:bg-blue-950/50',
                'disabled:bg-blue-50 dark:disabled:bg-blue-950/50',
                isUploading && 'hidden md:inline-flex',
              )}
              spinnerColor="text"
              spinnerClassName="text-blue-200 dark:text-blue-600/40"
              hideTextOnMobile={false}
            >
              {photosCountOutdated}
            </PathLoaderButton>}
          </div>
          {blobPhotoUrls.length > 0 &&
            <div className={clsx(
              'border-b pb-6',
              'border-gray-200 dark:border-gray-700',
              'space-y-4',
            )}>
              <div className="font-bold">
                Photo Blobs ({blobPhotoUrls.length})
              </div>
              <AdminUploadsTable urlAddStatuses={blobPhotoUrls} />
            </div>}
          {/* Use custom spacing to address gap/space-y compatibility quirks */}
          <div className="space-y-[6px] sm:space-y-[10px]">
            <AdminPhotosTable
              photos={photos}
              hasAiTextGeneration={hasAiTextGeneration}
              timezone={timezone}
            />
            {photosCount > photos.length &&
              <AdminPhotosTableInfinite
                initialOffset={infiniteScrollInitial}
                itemsPerPage={infiniteScrollMultiple}
                hasAiTextGeneration={hasAiTextGeneration}
                timezone={timezone}
              />}
          </div>
        </div>}
    />
  );
}
