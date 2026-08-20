import {
  Button,
  Center,
  Combobox,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  useCombobox,
} from '@mantine/core';
import { useMemo, useState } from 'react';

import { useAssetsByTypes } from '@app/db/assets';
import type { AssetListEntry } from '@app/db/assets';

import { AssetPickerOptionRow, assetPickerSearchText } from './AssetPicker.parts';

/**
 * What crosses back out when an Asset is chosen.
 * The identifiers matter as much as the payload: `data` alone cannot say *which* Asset was picked, since id, type and slug live on the row rather than inside the blob.
 */
interface PickedAsset {
  id: AssetListEntry['id'];
  type: string;
  slug: string;
  name: string;
  data: unknown;
}

/**
 * Everything the picker says, supplied by the caller.
 * No defaults on purpose.
 * One caller is choosing a token's reverse face and another is filling a deck, and wording phrased for either reads as a mistake in the other.
 */
interface AssetPickerCopy {
  searchLabel: string;
  searchPlaceholder: string;
  /** Shown when nothing of these types exists yet, which is not the same as a search matching nothing. */
  emptyMessage: string;
  /** Optional dismissal, rendered only when the caller passes `onCancel`. */
  cancelLabel?: string;
}

export interface AssetPickerProps {
  /** Asset types to offer, as the flat discriminators the registry uses. */
  types: string[];
  /** Asset ids to leave out. In practice the one being edited, so nothing can reference itself. */
  excludeIds?: string[];
  copy: AssetPickerCopy;
  /** Fires once per choice. The picker never closes itself; the container that gated its mount decides that. */
  onPick: (picked: PickedAsset) => void;
  onCancel?: () => void;
}

/**
 * A Picker: it fetches the Assets a reader may choose from, lets one be chosen, and hands the choice back.
 *
 * It subscribes the moment it mounts, which is the gated-by-container shape.
 * Every consumer already gates that mount behind a popover or an unmounted tab panel, so being mounted is itself the reader's signal of intent.
 * See the Pickers section in AGENTS.md.
 *
 * Single-select, and it stays open after a pick.
 * Multi-select, per-card counts and any confirm-before-commit belong to the caller, so the deck editor's composition rows and count steppers stay in the deck editor.
 *
 * Two ceilings are inherited from `assets.listByTypes` and recorded rather than solved.
 * It truncates at 200 rows per type without saying so, and search runs client-side over whatever was fetched.
 * A dedicated `assets.listForPicker` lands when a type approaches that, following `factions.listForLoadPicker`.
 */
export function AssetPicker({ types, excludeIds, copy, onPick, onCancel }: AssetPickerProps) {
  const catalogue = useAssetsByTypes(types);
  const combobox = useCombobox();
  const [search, setSearch] = useState('');

  const availableRows = useMemo(() => {
    /* Built inside the memo that uses it: callers pass a fresh array each render, so memoizing the set alone never hits. */
    const excluded = new Set(excludeIds ?? []);
    return (catalogue.data ?? []).filter((row) => !excluded.has(row.id));
  }, [catalogue.data, excludeIds]);

  const query = search.trim().toLocaleLowerCase();
  const filteredRows = query
    ? availableRows.filter((row) => assetPickerSearchText(row).toLocaleLowerCase().includes(query))
    : availableRows;

  const rowsById = useMemo(() => new Map(availableRows.map((row) => [String(row.id), row])), [availableRows]);

  return (
    <Stack gap="md">
      {catalogue.isPending ? (
        <Center py="md">
          <Loader size="sm" aria-label={copy.searchLabel} />
        </Center>
      ) : availableRows.length === 0 ? (
        <Text size="sm" c="dimmed">
          {copy.emptyMessage}
        </Text>
      ) : (
        /* One floating layer only: the options render inline in the pane, never as a second popover. */
        <Combobox
          store={combobox}
          onOptionSubmit={(id) => {
            const row = rowsById.get(id);
            if (!row) {
              return;
            }
            onPick({ id: row.id, type: row.type, slug: row.slug, name: row.name, data: row.data });
          }}
        >
          <Combobox.EventsTarget>
            <TextInput
              label={copy.searchLabel}
              placeholder={copy.searchPlaceholder}
              value={search}
              /*
               * Safari and password-manager extensions ignore autoComplete="off" alone.
               * The search type, neutral name and vendor opt-outs keep credential autofill prompts off this field.
               */
              type="search"
              name="asset-search"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-bwignore
              data-form-type="other"
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                combobox.selectFirstOption();
              }}
            />
          </Combobox.EventsTarget>
          <ScrollArea.Autosize mah={260} type="auto">
            <Combobox.Options>
              {filteredRows.length === 0 ? (
                <Combobox.Empty>No matches</Combobox.Empty>
              ) : (
                filteredRows.map((row) => (
                  <Combobox.Option value={String(row.id)} key={row.id}>
                    <AssetPickerOptionRow entry={row} />
                  </Combobox.Option>
                ))
              )}
            </Combobox.Options>
          </ScrollArea.Autosize>
        </Combobox>
      )}

      {onCancel ? (
        <Group justify="flex-end">
          <Button type="button" variant="default" size="compact-sm" onClick={onCancel}>
            {copy.cancelLabel ?? 'Cancel'}
          </Button>
        </Group>
      ) : null}
    </Stack>
  );
}
