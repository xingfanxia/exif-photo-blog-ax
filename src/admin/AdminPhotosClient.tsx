'use client';

import { clsx } from 'clsx/lite';
import AppGrid from '@/components/AppGrid';
import AdminPhotosTable from '@/admin/AdminPhotosTable';
import AdminPhotosTableInfinite from '@/admin/AdminPhotosTableInfinite';
import PathLoaderButton from '@/components/primitives/PathLoaderButton';
import { PATH_ADMIN_OUTDATED } from '@/app/paths';
import { Photo } from '@/photo';
import { StorageListResponse } from '@/platforms/storage';
import { LiaBroomSolid } from 'react-icons/lia';
import AdminUploadsTable from './AdminUploadsTable';
import { Timezone } from '@/utility/timezone';
import { useAppState } from '@/state/AppState';
import PhotoUploadWithStatus from '@/photo/PhotoUploadWithStatus';
import { HiSparkles } from 'react-icons/hi';
import ProgressButton from '@/components/primitives/ProgressButton';
import { syncPhotosAction, getAllPhotoIdsAction } from '@/photo/actions';
import { toastSuccess } from '@/toast';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPhotosClient({
  photos,
  photosCount,
  photosCountOutdated,
  blobPhotoUrls,
  shouldResize,
  hasAiTextGeneration,
  onLastUpload,
  infiniteScrollInitial,
  infiniteScrollMultiple,
  timezone,
}: {
  photos: Photo[]
  photosCount: number
  photosCountOutdated: number
  blobPhotoUrls: StorageListResponse
  shouldResize: boolean
  hasAiTextGeneration: boolean
  onLastUpload: () => Promise<void>
  infiniteScrollInitial: number
  infiniteScrollMultiple: number
  timezone: Timezone
}) {
  const { uploadState: { isUploading } } = useAppState();
  const [isRegeneratingAI, setIsRegeneratingAI] = useState(false);
  const [regenerationProgress, setRegenerationProgress] = useState<number>();
  const [showAiButton, setShowAiButton] = useState(false);
  const [tagsOnlyMode, setTagsOnlyMode] = useState(false);
  const { registerAdminUpdate } = useAppState();
  const router = useRouter();

  useEffect(() => {
    setShowAiButton(hasAiTextGeneration);
  }, [hasAiTextGeneration]);

  const handleRegenerateAI = async () => {
    const message = tagsOnlyMode 
      ? `Are you sure you want to regenerate AI tags for all ${photosCount} photos? This may take a while.`
      : `Are you sure you want to regenerate all AI fields for all ${photosCount} photos? This may take a while.`;
      
    if (!confirm(message)) {
      return;
    }

    setIsRegeneratingAI(true);
    setRegenerationProgress(0);

    try {
      // Process photos in batches with rate limiting to avoid OpenAI rate limits
      const BATCH_SIZE = 2; // Smaller batch size to reduce concurrent API calls
      const DELAY_BETWEEN_BATCHES = 2000; // 2 second delay between batches
      let processedCount = 0;

      // Fetch all photo IDs using server action
      const allPhotoIds = await getAllPhotoIdsAction();
      const photoBatches = [];
      for (let i = 0; i < allPhotoIds.length; i += BATCH_SIZE) {
        photoBatches.push(allPhotoIds.slice(i, i + BATCH_SIZE));
      }

      // Select which fields to regenerate
      const fieldsToRegenerate = tagsOnlyMode 
        ? ['tags'] 
        : ['title', 'caption', 'tags', 'semanticDescription'];

      for (let i = 0; i < photoBatches.length; i++) {
        const batch = photoBatches[i];
        
        try {
          await syncPhotosAction(batch, true, fieldsToRegenerate);
        } catch (error) {
          console.error(`Error processing batch ${i}:`, error);
          // Continue with next batch despite errors
        }
        
        processedCount += batch.length;
        // Update progress
        const progress = Math.min(processedCount / photosCount, 1);
        setRegenerationProgress(progress);
        
        // Add delay between batches to avoid rate limiting
        if (i < photoBatches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }

      const fieldDescription = tagsOnlyMode ? 'AI tags' : 'AI fields';
      toastSuccess(`${fieldDescription} regenerated for all ${photosCount} photos`);
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
    <AppGrid
      contentMain={
        <div className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <div className="grow min-w-0">
              <PhotoUploadWithStatus
                inputId="admin-photos"
                shouldResize={shouldResize}
                onLastUpload={onLastUpload}
              />
            </div>
            {showAiButton && (
              <div className="flex flex-col gap-2">
                <ProgressButton
                  icon={<HiSparkles size={16} />}
                  isLoading={isRegeneratingAI}
                  progress={regenerationProgress}
                  onClick={handleRegenerateAI}
                  hideTextOnMobile={false}
                >
                  {isRegeneratingAI 
                    ? `Regenerating ${Math.round((regenerationProgress || 0) * 100)}%`
                    : `Regen AI ${tagsOnlyMode ? 'Tags' : 'Fields'}`}
                </ProgressButton>
                <label className="flex items-center text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tagsOnlyMode}
                    onChange={(e) => setTagsOnlyMode(e.target.checked)}
                    className="mr-1.5 h-3.5 w-3.5"
                    disabled={isRegeneratingAI}
                  />
                  Tags Only
                </label>
              </div>
            )}
            {photosCountOutdated > 0 &&
              <PathLoaderButton
                path={PATH_ADMIN_OUTDATED}
                icon={<LiaBroomSolid
                  size={18}
                  className="translate-y-[-1px]"
                />}
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
