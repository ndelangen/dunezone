import { spiceBoardTokenIds } from '@shared/assets/spiceCardReferences';
import type { ReactNode } from 'react';

import { useSpiceCardBoard } from '@app/db/assets';
import { BoardPicker } from '@app/pickers/BoardPicker';
import type { BoardSelect } from '@app/pickers/BoardPicker';
import type { SpiceBoardRead } from '@app/widgets/card-editor/SpiceBoardFields';
import type { SpiceDraft } from '@app/widgets/card-editor/SpiceCardEditor';

/** Create and edit pages install the same board field on Spice cards. */
export const spiceBoardSelect: BoardSelect = (props) => <BoardPicker {...props} />;

function LinkedBoardRead({
  link,
  render,
}: {
  link: NonNullable<SpiceDraft['board']>;
  render: (read: SpiceBoardRead) => ReactNode;
}) {
  const tokenIds = spiceBoardTokenIds(link);

  return render(useSpiceCardBoard(link.asset_id, tokenIds));
}

/** Reads the draft's linked board and tokens only while it links one; a card on the classic map holds no read. */
export function SpiceBoardRead({ draft, render }: { draft: SpiceDraft; render: (read: SpiceBoardRead) => ReactNode }) {
  return draft.board ? <LinkedBoardRead link={draft.board} render={render} /> : render(undefined);
}
