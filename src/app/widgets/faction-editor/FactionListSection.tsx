import { ListChapter } from '@ui/block/ListChapter';
import type { ListChapterProps } from '@ui/block/ListChapter';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { FactionCollectionShelf } from './FactionCollectionShelf';

/** The entry a list section has open: the caller's, when it keeps it, otherwise the section's own. */
export function useListSelection(selectedIndex?: number, onSelectedIndexChange?: (index: number) => void) {
  const [internal, setInternal] = useState(0);
  return [selectedIndex ?? internal, onSelectedIndexChange ?? setInternal] as const;
}

/**
 * An ordered list the faction editor keeps (supporting leaders, advantages, phases): the chapter with its add and remove, the shelf to pick and reorder an entry, and the open entry's fields below.
 * Each section owns its words, what an entry looks like on the shelf, and the entry's fields;
 * this owns the selection that follows an add or a removal, and keeps the open entry in range.
 */
export function FactionListSection<T>({
  title,
  help,
  note,
  badge,
  noun,
  sortablePrefix,
  values,
  describe,
  selected,
  onSelect,
  addDisabled = false,
  onAdd,
  onRemoveLast,
  onMove,
  children,
}: {
  title: string;
  help: string;
  note: ListChapterProps['note'];
  /** A count or limit beside the add and remove actions. */
  badge?: ReactNode;
  /** One entry, as the actions name it: "faction advantage". */
  noun: string;
  sortablePrefix: string;
  values: readonly T[];
  /** An entry's line on the shelf. */
  describe: (value: T, index: number) => { label: string; description?: string };
  selected: number;
  onSelect: (index: number) => void;
  addDisabled?: boolean;
  /** Appends a new entry; the section then opens it. */
  onAdd: () => void;
  onRemoveLast: () => void;
  onMove: (from: number, to: number) => void;
  /** The open entry's fields. */
  children: (index: number) => ReactNode;
}) {
  const count = values.length;
  const open = Math.min(Math.max(selected, 0), Math.max(count - 1, 0));
  return (
    <ListChapter
      title={title}
      help={help}
      note={note}
      actions={
        <>
          {badge}
          <ListLengthActions
            removeLabel={`Remove last ${noun}`}
            addLabel={`Add ${noun}`}
            removeDisabled={count === 0}
            addDisabled={addDisabled}
            onRemove={() => {
              const lastIndex = count - 1;
              if (lastIndex < 0) {
                return;
              }
              if (selected >= lastIndex) {
                onSelect(Math.max(0, lastIndex - 1));
              }
              onRemoveLast();
            }}
            onAdd={() => {
              if (addDisabled) {
                return;
              }
              onAdd();
              onSelect(count);
            }}
          />
        </>
      }
    >
      {count > 0 ? (
        <>
          <FactionCollectionShelf
            label={`Ordered ${noun}s`}
            sortablePrefix={sortablePrefix}
            selectedIndex={open}
            onSelectedIndexChange={onSelect}
            items={values.map((value, index) => ({ id: `${sortablePrefix}${index}`, ...describe(value, index) }))}
            onMove={onMove}
          />
          {children(open)}
        </>
      ) : null}
    </ListChapter>
  );
}
