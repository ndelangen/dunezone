import { Link } from '@tanstack/react-router';
import { OpenableTile } from '@ui/block/OpenableTile';

import type { AssetBrowseEntry } from '@db/assets';

import { AssetFace } from './AssetFace';

/** The asset catalogue's tile, shared with FAQ references. */
export function AssetCatalogueTile({ entry }: { entry: AssetBrowseEntry }) {
  return (
    <OpenableTile
      caption={entry.name}
      renderRoot={(rootProps) => (
        <Link {...rootProps} to="/assets/$type/$slug" params={{ type: entry.type, slug: entry.slug }} />
      )}
    >
      <AssetFace
        href={entry.previewHref}
        type={entry.type}
        data={entry.data}
        name={entry.name}
        members={entry.members}
      />
    </OpenableTile>
  );
}
