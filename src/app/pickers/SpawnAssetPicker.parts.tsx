import { Combobox, ScrollArea, Stack, Text } from '@mantine/core';
import { ASSET_TYPES } from '@shared/assets/types';
import { spawnableKey } from '@shared/play/inventory';
import type { SpawnableAsset, SpawnSelection } from '@shared/play/inventory';

function SpawnAssetOptionRow({ entry }: { entry: SpawnableAsset }) {
  return (
    <Stack gap={2} miw={0}>
      <Text size="sm" fw={700} lh={1.25}>
        {entry.name}
      </Text>
      <Text size="xs" c="dimmed" lh={1.2}>
        {ASSET_TYPES[entry.type].shortLabel} · {entry.owner ?? 'Unknown owner'}
      </Text>
    </Stack>
  );
}

export type SpawnAssetOptionsProps = {
  entries: SpawnableAsset[];
  /** The asset chosen so far, kept marked while the table checks it. */
  value: SpawnSelection | null;
  /** Whether the entries are a search's matches rather than the newest assets, which changes what an empty list means. */
  searched: boolean;
  /** The first answer for this search is still on its way. */
  pending: boolean;
  /** A longer list, or the typed word's own list, is on its way; the rows shown stay in place. */
  loading: boolean;
  disabled: boolean;
};

/** The picker's rows, inline in the pane: one floating layer only, never a dropdown of their own. */
export function SpawnAssetOptions({ entries, value, searched, pending, loading, disabled }: SpawnAssetOptionsProps) {
  if (pending) {
    return (
      <Text role="status" size="sm" c="dimmed">
        Loading the catalogue...
      </Text>
    );
  }
  if (entries.length === 0) {
    return (
      <Text role="status" size="sm" c="dimmed">
        {searched ? 'No deck, bundle or token matches.' : 'The catalogue has no decks, bundles or tokens yet.'}
      </Text>
    );
  }
  const chosen = value ? spawnableKey(value) : null;
  return (
    <ScrollArea.Autosize mah={260} type="auto" overscrollBehavior="contain">
      <Combobox.Options aria-label="Catalogue assets" aria-busy={loading}>
        {entries.map((entry) => {
          const key = spawnableKey(entry);
          return (
            <Combobox.Option
              value={key}
              key={key}
              active={key === chosen}
              disabled={disabled}
              /* The asset a row offers, by type and slug, for a reader that must not go by the names it shows. */
              data-spawn-asset={key}
            >
              <SpawnAssetOptionRow entry={entry} />
            </Combobox.Option>
          );
        })}
      </Combobox.Options>
    </ScrollArea.Autosize>
  );
}

/** The note under the rows once the shared ceiling stops Load more, pointing a search at a narrower word and the newest list at search. */
export function SpawnAssetCeiling({ searched }: { searched: boolean }) {
  return (
    <Text size="xs" c="dimmed" ta="center">
      {searched
        ? "That's as far as this search goes. Add a word to narrow it."
        : "That's as far as the newest go. Search for an older one by name."}
    </Text>
  );
}
