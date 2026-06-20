'use client';

import { pathForTag } from '@/app/path';
import { formatTag } from '.';
import EntityLink, {
  EntityLinkExternalProps,
} from '@/components/entity/EntityLink';
import IconTag from '@/components/icons/IconTag';
import useCategoryCounts from '@/category/useCategoryCounts';
import { useAppState } from '@/app/AppState';
import AdminTagMenu from './AdminTagMenu';

export default function PhotoTag({
  tag,
  showAdminMenu,
  // FORK: localized display label (e.g. zh); routing/slug stays on `tag`.
  displayLabel,
  ...props
}: {
  tag: string
  showAdminMenu?: boolean
  displayLabel?: string
} & EntityLinkExternalProps) {
  const { getTagCount } = useCategoryCounts();
  const { isUserSignedIn } = useAppState();
  const count = props.hoverCount ?? getTagCount(tag);
  return (
    <EntityLink
      {...props}
      label={displayLabel || formatTag(tag)}
      path={pathForTag(tag)}
      hoverQueryOptions={{ tag }}
      icon={<IconTag size={14} className="translate-x-[0.5px]" />}
      hoverCount={count}
      action={showAdminMenu && isUserSignedIn &&
        <AdminTagMenu {...{ tag, count }} />}
    />
  );
}
