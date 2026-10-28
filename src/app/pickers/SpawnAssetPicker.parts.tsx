import { Combobox, ScrollArea, Stack, Text } from '@mantine/core';
import { ASSET_TYPES, assetTypeNoun } from '@shared/assets/types';
import type { SpawnType } from '@shared/play/captureTypes';
import { spawnableKey } from '@shared/play/inventory';
import type { SpawnableAsset, SpawnSelection } from '@shared/play/inventory';

/**
 * What the picker offers, in words: a deck, bundle or token by default, or the types a shelf narrowed it to.
 * `one` names a single asset, `many` the lot.
 */
export function spawnTypeWords(types: readonly SpawnType[]): Readonly<{ one: string; many: string }> {
  if (types.length === 0) {
    return { one: 'deck, bundle or token', many: 'decks, bundles or tokens' };
  }
  const either = (words: string[]) =>
    words.length > 1 ? `${words.slice(0, -1).join(', ')} or ${words.at(-1)}` : (words[0] ?? '');
  return {
    one: either(types.map((type) => assetTypeNoun(type).toLowerCase())),
    many: either(types.map((type) => ASSET_TYPES[type].label.toLowerCase())),
  };
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
  /** The types on offer, which the empty list names. */
  types: readonly SpawnType[];
  /** Whether the entries are a search's matches rather than the newest assets, which changes what an empty list means. */
  searched: boolean;
  /** The first answer for this search is still on its way. */
  pending: boolean;
  /** A longer list, or the typed word's own list, is on its way; the rows shown stay in place. */
  loading: boolean;
  disabled: boolean;
};

/** The picker's rows, inline in the pane: one floating layer only, never a dropdown of their own. */
export function SpawnAssetOptions({
  entries,
  types,
  value,
  searched,
  pending,
  loading,
  disabled,
}: SpawnAssetOptionsProps) {
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
        {searched
          ? `No ${spawnTypeWords(types).one} matches.`
          : `The catalogue has no ${spawnTypeWords(types).many} yet.`}
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
            <Combobox.Option value={key} key={key} active={key === chosen} disabled={disabled} data-spawn-asset={key}>
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
