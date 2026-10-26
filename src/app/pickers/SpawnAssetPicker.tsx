import { Combobox, Stack, TextInput, useCombobox } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { SPAWN_PICKER_STEP } from '@shared/play/inventory';
import type { SpawnableAsset, SpawnableAssets, SpawnSelection } from '@shared/play/inventory';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { useEffect, useState } from 'react';

import { useSpawnableAssets } from '@db/play';
import { useGrowingLimit, useGrowingSearch } from '@app/routes/growingSearch';

import { SpawnAssetCeiling, SpawnAssetOptions, spawnableKey } from './SpawnAssetPicker.parts';

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
 * Highlights the first row of each search as it lists, so Enter after typing picks the best match without an arrow key first;
 * Load more grows the same search and leaves the highlight where the reader moved it.
 * `listed` is the search whose first rows are on screen, or null while they are on their way.
 * The method is taken off the store because the store is a fresh object every render, and an effect keyed on it would re-highlight the first row on every render.
 */
function useHighlightFirstRow(combobox: ReturnType<typeof useCombobox>, listed: string | null) {
  const { selectFirstOption } = combobox;
  useEffect(() => {
    if (listed !== null) {
      selectFirstOption();
    }
  }, [selectFirstOption, listed]);
}

/**
 * A Picker: the decks, bundles and tokens a seated player may ask the table to spawn, searched on the server and grown with Load more.
 * It is mounted only while the Shared table inventory's catalogue is open, so it subscribes the moment it mounts, and the subscription ends with the pane (see the Pickers section in AGENTS.md).
 * With nothing typed it lists the newest assets, which is the order the asset catalogue opens in and the one most likely to hold what was just published for this game;
 * a typed word asks the catalogue search over the asset's and its owner's name, best matches first.
 * The choice leaves through `onPick`;
 * checking the asset's definitions and requesting the spawn stay with the table.
 */
export function SpawnAssetPicker({ value, disabled = false, onPick }: SpawnAssetPickerProps) {
  /*
   * Held open: the rows are inline, so there is no dropdown for Escape to close, and Mantine submits Enter only while the store is open.
   * A store that merely started open would close on Escape and leave the listed rows unpickable until an arrow key reopened it.
   */
  const combobox = useCombobox({ opened: true });
  const [search, setSearch] = useState('');
  const [settled] = useDebouncedValue(search.trim(), SEARCH_SETTLE_MS);
  /* Until the typed word settles the rows on screen answer the search before it, so a pick among them would take an asset the reader did not ask for. */
  const unsettled = search.trim() !== settled;
  const pickable = !disabled && !unsettled;
  const growing = useGrowingLimit({ q: settled }, SPAWN_PICKER_STEP);
  const live = useSpawnableRows(settled, growing.limit);
  const { data, loading, loadMore } = useGrowingSearch({
    search: growing,
    initial: NOTHING,
    live,
    rows: (page) => page.entries.length,
  });
  const pending = live === undefined && growing.limit === growing.step;
  useHighlightFirstRow(combobox, pending ? null : growing.key);
  return (
    <Stack gap="sm">
      <Combobox
        store={combobox}
        onOptionSubmit={(key) => {
          const entry = pickable ? data.entries.find((candidate) => spawnableKey(candidate) === key) : undefined;
          if (entry) {
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
          loading={loading || unsettled}
          disabled={disabled}
        />
      </Combobox>
      {data.hasMore ? <LoadMoreButton loading={loading} onLoadMore={loadMore} /> : null}
      {data.capped ? <SpawnAssetCeiling searched={settled !== ''} /> : null}
    </Stack>
  );
}
