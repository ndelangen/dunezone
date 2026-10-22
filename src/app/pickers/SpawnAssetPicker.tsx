import { Combobox, Stack, Text, TextInput, useCombobox } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { SPAWN_PICKER_STEP } from '@shared/play/inventory';
import type { SpawnableAsset, SpawnableAssets, SpawnSelection } from '@shared/play/inventory';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { useEffect, useState } from 'react';

import { useSpawnableAssets } from '@db/play';
import { useGrowingLimit, useGrowingSearch } from '@app/routes/growingSearch';

import { SpawnAssetOptions, spawnableKey } from './SpawnAssetPicker.parts';

/** How long typing settles before the catalogue is asked, so a word costs one read rather than one per keystroke. */
const SEARCH_SETTLE_MS = 250;

/** What the picker shows before the catalogue's first answer for a search. */
const NOTHING: SpawnableAssets = { entries: [], hasMore: false, capped: false };

export type SpawnAssetPickerProps = {
  /** The asset chosen so far, kept marked while the table checks it. */
  value: SpawnSelection | null;
  /** While the table is reconnecting no choice can be checked, so none is offered. */
  disabled?: boolean;
  /** Fires once per choice. The caller asks the table about it and decides what happens next. */
  onPick: (picked: SpawnableAsset) => void;
};

/** The catalogue's answer at one limit; a search term goes only when there is one, since an absent argument is not an undefined one. */
function useSpawnableRows(q: string, limit: number) {
  return useSpawnableAssets(q ? { q, limit } : { limit }).data;
}

/**
 * A Picker: the decks, bundles and tokens a seated player may ask the table to spawn, searched on the server and grown with Load more.
 * It is mounted only while the Shared inventory's catalogue is open, so it subscribes the moment it mounts, and the subscription ends with the pane (see the Pickers section in AGENTS.md).
 * With nothing typed it lists the newest assets, which is the order the asset catalogue opens in and the one most likely to hold what was just published for this game;
 * a typed word asks the catalogue search over the asset's and its owner's name, best matches first.
 * The choice leaves through `onPick`;
 * checking the asset's definitions and requesting the spawn stay with the table.
 */
export function SpawnAssetPicker({ value, disabled = false, onPick }: SpawnAssetPickerProps) {
  /* Open from the start: Mantine submits Enter only while the store is open, so the highlighted first row is pickable as soon as it lists. */
  const combobox = useCombobox({ defaultOpened: true });
  const [search, setSearch] = useState('');
  const [settled] = useDebouncedValue(search.trim(), SEARCH_SETTLE_MS);
  const growing = useGrowingLimit({ q: settled }, SPAWN_PICKER_STEP);
  const live = useSpawnableRows(settled, growing.limit);
  const { data, loading, loadMore } = useGrowingSearch({
    search: growing,
    initial: NOTHING,
    live,
    rows: (page) => page.entries.length,
  });
  const pending = live === undefined && growing.limit === growing.step;
  /* The first row is highlighted once the rows settle, so Enter after typing picks the best match. */
  useEffect(() => {
    combobox.selectFirstOption();
  }, [combobox, data.entries]);
  return (
    <Stack gap="sm">
      <Combobox
        store={combobox}
        onOptionSubmit={(key) => {
          const entry = data.entries.find((candidate) => spawnableKey(candidate) === key);
          if (entry && !disabled) {
            onPick(entry);
          }
        }}
      >
        <Combobox.EventsTarget>
          <TextInput
            label="Search the catalogue"
            placeholder="A deck, bundle or token, or who made it"
            value={search}
            disabled={disabled}
            /*
             * Safari and password-manager extensions ignore autoComplete="off" alone.
             * The search type, neutral name and vendor opt-outs keep credential autofill prompts off this field.
             */
            type="search"
            name="catalogue-search"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
            data-form-type="other"
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </Combobox.EventsTarget>
        <SpawnAssetOptions
          entries={data.entries}
          value={value}
          searched={settled !== ''}
          pending={pending}
          loading={loading}
          disabled={disabled}
        />
      </Combobox>
      {data.hasMore ? <LoadMoreButton loading={loading} onLoadMore={loadMore} /> : null}
      {data.capped ? (
        <Text size="xs" c="dimmed" ta="center">
          {settled
            ? "That's as far as this search goes. Add a word to narrow it."
            : "That's as far as the newest go. Search for an older one by name."}
        </Text>
      ) : null}
    </Stack>
  );
}
