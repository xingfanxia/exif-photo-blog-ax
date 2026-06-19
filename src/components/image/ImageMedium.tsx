import { IMAGE_WIDTH_MEDIUM, CustomImageProps } from '.';
import ImageWithFallback from './ImageWithFallback';

export default function ImageMedium(props: CustomImageProps) {
  const {
    aspectRatio,
    blurCompatibilityMode,
    ...rest
  } = props;
  return (
    <ImageWithFallback {...{
      ...rest,
      // Responsive srcset hint for grid cards (PLOG-6) so the browser picks
      // the right R2 variant per breakpoint instead of defaulting to 100vw.
      sizes: rest.sizes
        ?? '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
      blurCompatibilityLevel: blurCompatibilityMode ? 'high' : 'none',
      width: IMAGE_WIDTH_MEDIUM,
      height: Math.round(IMAGE_WIDTH_MEDIUM / aspectRatio),
    }} />
  );
};
