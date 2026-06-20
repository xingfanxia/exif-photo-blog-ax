import PhotoTag from '@/tag/PhotoTag';
import { isTagFavs } from '.';
import PhotoFavs from './PhotoFavs';
import { EntityLinkExternalProps } from '@/components/entity/EntityLink';
import { Fragment } from 'react';

export default function PhotoTags({
  tags,
  tagCounts = {},
  tagLabels = {},
  contrast,
  prefetch,
}: {
  tags: string[]
  tagCounts?: Record<string, number>
  // FORK: optional slug→display-label map (e.g. localized zh labels).
  tagLabels?: Record<string, string>
} & EntityLinkExternalProps) {
  return (
    <div className="flex flex-col">
      {tags.map(tag =>
        <Fragment key={tag}>
          {isTagFavs(tag)
            ? <PhotoFavs {...{
              contrast,
              prefetch,
              hoverCount: tagCounts[tag],
            }} />
            : <PhotoTag {...{
              tag,
              displayLabel: tagLabels[tag],
              contrast,
              prefetch, hoverCount: tagCounts[tag] }} />}
        </Fragment>)}
    </div>
  );
}
