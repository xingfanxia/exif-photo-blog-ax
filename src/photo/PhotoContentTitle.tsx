'use client';

import { useEffect } from 'react';
import { Photo, titleForPhoto } from '.';
import { useAppState } from '@/app/AppState';

// FORK: localize the browser tab title for the content-language toggle.
// generateMetadata renders the canonical (English) <title> server-side — good
// for crawlers / OG and keeps the route statically rendered. This client effect
// then syncs document.title to the active content language (no per-request
// cookie read on the server, so no de-optimization). Renders nothing.
export default function PhotoContentTitle({ photo }: { photo: Photo }) {
  const { contentLanguage } = useAppState();
  useEffect(() => {
    document.title = titleForPhoto(photo, true, undefined, contentLanguage);
  }, [contentLanguage, photo]);
  return null;
}
