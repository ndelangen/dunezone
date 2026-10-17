import { compareCodeUnits } from '@shared/compareText';
import type { ReactNode } from 'react';

import { useSpiceCardBoard } from '@app/db/assets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import type { AssetPick, SpiceBoardRead } from '@app/widgets/card-editor/SpiceBoardFields';
import type { SpiceDraft } from '@app/widgets/card-editor/SpiceCardEditor';

/** Create and edit pages install the same read-only board picker on Spice cards. */
export const spiceBoardPicker: AssetPick = (onPick, onCancel) => (
  <AssetPicker
    types={['board']}
    copy={{
      searchLabel: 'Find a board',
      searchPlaceholder: 'Name or creator',
      emptyMessage: 'No board assets are available yet.',
    }}
    onPick={(picked) => onPick(picked.id)}
    onCancel={onCancel}
  />
);

function LinkedBoardRead({
  link,
  render,
}: {
  link: NonNullable<SpiceDraft['board']>;
  render: (read: SpiceBoardRead) => ReactNode;
}) {
  const tokenIds = [...new Set(link.tokens.map((token) => token.asset_id))].sort(compareCodeUnits);
  return render(useSpiceCardBoard(link.asset_id, tokenIds));
}

/** Reads the draft's linked board and tokens only while it links one; a card on the classic map holds no read. */
export function SpiceBoardRead({ draft, render }: { draft: SpiceDraft; render: (read: SpiceBoardRead) => ReactNode }) {
  return draft.board ? <LinkedBoardRead link={draft.board} render={render} /> : render(undefined);
}
