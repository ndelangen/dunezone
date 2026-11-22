import { Combobox, ScrollArea, TextInput, useCombobox } from '@mantine/core';
import { Pending } from '@ui/content/Pending';
import { ControlBlock } from '@ui/control/ControlBlock';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { useState } from 'react';

import { useNexusFactionChoices } from '@db/factions';
import type { NexusFactionChoice } from '@db/factions';

import { NexusFactionRow } from './NexusFactionPicker.parts';

/**
 * A Picker: the Factions a Nexus card may link, one row per Faction and never one per variant (#2921).
 * It reads its own options a few at a time, read-only, and a search finds a Faction by its variants' names too.
 * A pick leaves through `onPick` at once, with no confirmation, since linking another Faction undoes it.
 * Its caller mounts it only while the reader is choosing, so the read lives no longer than the list.
 */
export function NexusFactionPicker({
  linkedId,
  onPick,
}: Readonly<{
  /** The Faction the card links now, marked in the list. */
  linkedId?: string;
  onPick: (faction: NexusFactionChoice) => void;
}>) {
  /* No Dropdown is mounted, so "opened" changes nothing visually; it is what lets Enter submit the highlighted row, which Mantine gates on the dropdown state. */
  const combobox = useCombobox({ defaultOpened: true });
  const [search, setSearch] = useState('');
  const query = search.trim();
  const { results, status, loadMore } = useNexusFactionChoices(query);
  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(id) => {
        const faction = results.find((candidate) => candidate.id === id);
        if (faction) {
          onPick(faction);
        }
      }}
    >
      <ControlBlock
        title="Search factions"
        input={(fieldProps) => (
          <Combobox.EventsTarget>
            <TextInput
              {...fieldProps}
              type="search"
              name="faction-search"
              placeholder="Faction or variant name"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-bwignore
              data-form-type="other"
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                combobox.resetSelectedOption();
              }}
            />
          </Combobox.EventsTarget>
        )}
      />
      <ScrollArea.Autosize mah={320} type="auto" offsetScrollbars>
        <Combobox.Options>
          {results.map((faction) => (
            <Combobox.Option value={faction.id} key={faction.id} active={faction.id === linkedId}>
              <NexusFactionRow faction={faction} />
            </Combobox.Option>
          ))}
          {status === 'Exhausted' && results.length === 0 ? (
            <Combobox.Empty>{query ? 'No matching factions' : 'No faction is available to link.'}</Combobox.Empty>
          ) : null}
        </Combobox.Options>
        {status === 'LoadingFirstPage' ? <Pending>Loading factions</Pending> : null}
        {status === 'CanLoadMore' || status === 'LoadingMore' ? (
          <LoadMoreButton loading={status === 'LoadingMore'} onLoadMore={loadMore} />
        ) : null}
      </ScrollArea.Autosize>
    </Combobox>
  );
}
