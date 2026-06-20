import PhotoOGTile from '@/photo/PhotoOGTile';
import { absolutePathForPhoto } from '@/app/path';
import { Photo, titleForPhoto } from '.';
import { PhotoSetCategory } from '../category';
import ShareModal from '@/share/ShareModal';
import { useAppText } from '@/i18n/state/client';

export default function PhotoShareModal(
  props: { photo: Photo } & PhotoSetCategory,
) {
  const appText = useAppText();
  return (
    <ShareModal
      pathShare={absolutePathForPhoto(props, true)}
      navigatorTitle={titleForPhoto(props.photo)}
      socialText={appText.photo.shareText}
    >
      <PhotoOGTile {...props} />
    </ShareModal>
  );
}
