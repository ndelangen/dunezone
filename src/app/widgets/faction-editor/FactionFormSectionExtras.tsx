import { Stack, Text } from '@mantine/core';
import { ASSET_TYPES } from '@shared/assets/types';
import { FACTION_EXTRA_TYPES, factionExtraKey } from '@shared/factions/extras';
import type { FactionExtra } from '@shared/factions/extras';

import { AssetListPicker } from '@app/pickers/AssetListPicker';

import styles from './FactionEditor.module.css';
import type { FactionFormApi } from './factionFormTypes';

const EXTRA_TYPES = [...FACTION_EXTRA_TYPES];

/* The proof names each Extra by catalogue address, the way the faction stores it; the chapter's list draws the assets themselves. */
function ExtraLabel({ extra }: { extra: FactionExtra }) {
  return (
    <Stack gap={0} flex={1} miw={0}>
      <Text size="sm" fw={600} truncate>
        {extra.slug}
      </Text>
      <Text size="xs" c="dimmed">
        {ASSET_TYPES[extra.type].label}
      </Text>
    </Stack>
  );
}

/**
 * Faction Extras (#1226): any catalogue asset the faction brings to setup, a single card or token, a deck or a bundle.
 * The asset-picker list reads the listed assets while this chapter is open, and the catalogue only while its add popover is.
 */
export function FactionFormSectionExtras({ form }: { form: FactionFormApi }) {
  return (
    <Stack component="section" gap="md" aria-labelledby="extras-heading">
      <Stack gap="xs">
        <Text id="extras-heading" fw={700} size="lg">
          Faction Extras
        </Text>
        <Text c="dimmed" size="sm">
          Any cards, tokens, decks or bundles from the catalogue that this faction adds to its hand at setup. A deck or
          bundle brings its own counts; a single card or token is one piece, and a single card wears the back of the
          deck that holds it. Each Extra is listed once.
        </Text>
      </Stack>
      <form.Field name="extras">
        {(field) => (
          <AssetListPicker
            value={field.state.value ?? []}
            types={EXTRA_TYPES}
            defaultType="card-custom"
            copy={{
              listLabel: 'Extras',
              emptyMessage: 'No Extras. The faction brings only its own components.',
              addLabel: 'Add Extra',
            }}
            onChange={(extras) => field.handleChange(extras as FactionExtra[])}
          />
        )}
      </form.Field>
    </Stack>
  );
}

/** The artifact column's view: what the faction adds to its starting supply. */
export function FactionExtrasProof({ extras }: { extras: readonly FactionExtra[] }) {
  return (
    <Stack component="section" gap="sm" className={styles.extrasProof} p="lg" aria-label="Starting Extras">
      <Text ff="serif" fw={800} tt="uppercase">
        Added at setup
      </Text>
      {extras.length === 0 ? (
        <Text size="sm" c="dimmed">
          Nothing beyond the faction&apos;s own components.
        </Text>
      ) : (
        extras.map((extra) => <ExtraLabel key={factionExtraKey(extra)} extra={extra} />)
      )}
    </Stack>
  );
}
