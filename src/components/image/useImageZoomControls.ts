import useMetaThemeColor from '@/utility/useMetaThemeColor';
import { useAppState } from '@/app/AppState';
import {
  ComponentProps,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Viewer from 'viewerjs';
import ZoomControls from './ZoomControls';

export default function useImageZoomControls({
  refImageContainer,
  selectImageElement,
  isEnabled,
  fullResImageUrl,
} : {
  refImageContainer: RefObject<HTMLElement | null>
} & Omit<ComponentProps<typeof ZoomControls>, 'ref' | 'children'>) {
  const viewerRef = useRef<Viewer | null>(null);

  const refViewerContainer = useRef<HTMLDivElement>(null);

  const { setShouldRespondToKeyboardCommands } = useAppState();

  const [colorLight, setColorLight] = useState<string>();

  useMetaThemeColor({ colorLight });

  const open = useCallback(() =>
    viewerRef.current?.show(), []);

  const close = useCallback(() =>
    viewerRef.current?.hide(), []);

  const zoomTo = useCallback((zoomLevel = 1) =>
    viewerRef.current?.zoomTo(zoomLevel), []);

  useEffect(() => {
    if (isEnabled) {
      const imageRef = (
        selectImageElement?.(refImageContainer.current) ?? 
        refImageContainer.current
      );
      if (imageRef) {
        viewerRef.current = new Viewer(imageRef, {
          navbar: false,
          title: false,
          toolbar: {
            zoomIn: 1,
            reset: 2,
            zoomOut: 3,
          },
          ready: ({ target }) => {
            refViewerContainer.current =
              (target as any).viewer.viewer as HTMLDivElement;
          },
          url: (image: HTMLImageElement) => {
            // Addresses Safari bug where images don't load
            image.loading = 'eager';
            // FORK: serve the un-suffixed R2 ORIGINAL in the fullscreen viewer
            // (zoom showed the lg=1080px render variant before). Falls back to
            // the rendered src for non-R2 / missing originals.
            return fullResImageUrl ?? image.src;
          },
          show: () => {
            setShouldRespondToKeyboardCommands?.(false);
            setColorLight('#000');
          },
          hide: () => {
            // Optimizes Safari status bar animation
            setTimeout(() => setColorLight(undefined), 300);
          },
          hidden: () => {
            setShouldRespondToKeyboardCommands?.(true);
          },
        });
        return () => {
          viewerRef.current?.destroy();
          viewerRef.current = null;
        };
      }
    }
  }, [
    isEnabled,
    refImageContainer,
    selectImageElement,
    setShouldRespondToKeyboardCommands,
    fullResImageUrl,
  ]);

  return {
    open,
    close,
    zoomTo,
    refViewerContainer,
  };
}
