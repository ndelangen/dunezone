import { AssetSelect } from '@ui/control/AssetSelect';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { useAssetsByTypes } from '@app/db/assets';

/** A board offered without loading the catalogue: the maintained map, or the board already chosen. */
type BoardChoice = { id: string; name: string; previewSrc: string | null };

export type BoardPickerProps = {
  label: string;
  value: string;
  fixed: readonly (BoardChoice & { collection: string })[];
  selected?: BoardChoice;
  onPick: (id: string) => void;
};

/** How a widget that may not fetch takes the field from its page: the page renders `BoardPicker` with these props. */
export type BoardSelect = (props: BoardPickerProps) => ReactNode;

const SAVED_BOARDS = 'Saved boards';
const LOADING = '__loading';
const BOARD_TYPES = ['board'];

/** Reads the saved boards while mounted, which the field does while it is open, and hands them up. */
function SavedBoards({ onBoards }: { onBoards: (boards: readonly BoardChoice[]) => void }) {
  const catalogue = useAssetsByTypes(BOARD_TYPES);
  useEffect(() => {
    if (catalogue.data) {
      onBoards(
        catalogue.data.map((row) => ({ id: String(row.id), name: row.name, previewSrc: row.previewHref ?? null }))
      );
    }
  }, [catalogue.data, onBoards]);
  return null;
}

/**
 * The board a Spice card or a Rulebook scene draws, chosen the way artwork is: one field with each board's face beside its name.
 * `fixed` are the boards offered without a read, such as the maintained map;
 * saved boards are read only while the field is open, so a closed field holds no subscription;
 * the last list read stays offered after closing.
 * `selected` keeps the chosen saved board named and pictured before the first read.
 */
export function BoardPicker({ label, value, fixed, selected, onPick }: Readonly<BoardPickerProps>) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<readonly BoardChoice[]>();
  const offered = new Set([...fixed, ...(saved ?? [])].map((board) => board.id));
  /* The chosen board stays listed, so the field keeps naming it, even when the catalogue does not hold it. */
  const kept = selected && !offered.has(selected.id) ? [selected] : [];
  const boards = [...fixed, ...[...(saved ?? []), ...kept].map((board) => ({ ...board, collection: SAVED_BOARDS }))];
  const previews = new Map(boards.map((board) => [board.id, board.previewSrc]));
  return (
    <>
      {open ? <SavedBoards onBoards={setSaved} /> : null}
      <AssetSelect
        aria-label={label}
        value={value}
        allowDeselect={false}
        data={[
          ...boards.map((board) => ({ value: board.id, label: board.name, collection: board.collection })),
          ...(open && !saved
            ? [{ value: LOADING, label: 'Loading saved boards...', collection: SAVED_BOARDS, disabled: true }]
            : []),
        ]}
        getPreviewSrc={(id) => previews.get(id)}
        previewSize={36}
        onDropdownChange={setOpen}
        onChange={(id) => {
          if (id && id !== LOADING) {
            onPick(id);
          }
        }}
      />
    </>
  );
}
