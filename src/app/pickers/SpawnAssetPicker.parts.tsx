import { Combobox, ScrollArea, Stack, Text } from '@mantine/core';
import { ASSET_TYPES } from '@shared/assets/types';
import type { SpawnableAsset, SpawnSelection } from '@shared/play/inventory';

/** The key a listed asset is picked by: its type and slug, which is what the table is asked to spawn. */
export function spawnableKey(entry: SpawnSelection): string {
  return `${entry.type}/${entry.slug}`;
}

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
  /** A longer list is on its way; the rows shown stay in place. */
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
            <Combobox.Option value={key} key={key} active={key === chosen} disabled={disabled}>
              <SpawnAssetOptionRow entry={entry} />
            </Combobox.Option>
          );
        })}
      </Combobox.Options>
    </ScrollArea.Autosize>
  );
}
