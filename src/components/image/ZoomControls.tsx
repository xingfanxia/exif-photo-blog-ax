import clsx from 'clsx/lite';
import { ReactNode, RefObject, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import useImageZoomControls from './useImageZoomControls';
import { RiExpandDiagonalLine } from 'react-icons/ri';

export type ZoomControlsRef = {
  open: () => void
  zoomTo: (zoomLevel?: number) => void
}

export default function ZoomControls({
  ref,
  children,
  ...props
}: {
  ref?: RefObject<ZoomControlsRef | null>
  children: ReactNode
  selectImageElement?: (container: HTMLElement | null) =>
    HTMLImageElement | null
  isEnabled?: boolean
  // FORK (PLOG-6 follow-up): the un-suffixed R2 original to load in the
  // fullscreen viewer, so zoom shows true full-res instead of the lg (1080px)
  // render variant. When omitted the viewer falls back to the rendered src.
  fullResImageUrl?: string
}) {
  const refImageContainer = useRef<HTMLDivElement>(null);

  const {
    open,
    zoomTo,
    refViewerContainer,
  } = useImageZoomControls({
    refImageContainer,
    ...props,
  });

  useEffect(() => {
    if (ref) { ref.current = { open, zoomTo }; }
  }, [ref, open, zoomTo]);

  // FORK: jump the fullscreen viewer to 100% — true actual-pixel detail of the
  // R2 original (viewerjs ratio 1 = natural size). The toolbar's "1:1" control
  // only resets to FIT, so this is the only way to inspect real detail.
  const button =
    <button
      type="button"
      aria-label="100%"
      className={clsx(
        'fixed top-[20px] right-[70px]',
        'h-10 px-3.5 flex items-center justify-center gap-1.5',
        'rounded-full border-none cursor-pointer',
        'text-white text-[13px] font-medium tabular-nums',
        'bg-black/50 hover:bg-black/85',
      )}
      onClick={() => zoomTo(1)}
    >
      <RiExpandDiagonalLine className="shrink-0" size={16} />
      100%
    </button>;

  return (
    <div
      ref={refImageContainer}
      className={clsx('h-full', props.isEnabled && 'cursor-zoom-in')}
    >
      {children}
      {refViewerContainer.current
        ? createPortal(button, refViewerContainer.current)
        : null}
    </div>
  );
}
