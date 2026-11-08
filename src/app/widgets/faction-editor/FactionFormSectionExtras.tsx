import { Stack, Text } from '@mantine/core';
import { ASSET_TYPES } from '@shared/assets/types';
import { FACTION_EXTRA_TYPES, factionExtraKey } from '@shared/factions/extras';
import type { FactionExtra } from '@shared/factions/extras';
import { ListChapter } from '@ui/block/ListChapter';
import { EmptyNote } from '@ui/content/EmptyNote';
import { TitledLine } from '@ui/content/TitledLine';

import { AssetList, AssetListAdd } from '@app/pickers/AssetListPicker';

import styles from './FactionEditor.module.css';
import type { FactionFormApi } from './factionFormTypes';

const EXTRA_TYPES = [...FACTION_EXTRA_TYPES];

/* The proof names each Extra by catalogue address, the way the faction stores it; the chapter's list draws the assets themselves. */
function ExtraLabel({ extra }: { extra: FactionExtra }) {
  return <TitledLine title={extra.slug} detail={ASSET_TYPES[extra.type].label} />;
}

/**
 * Faction Extras (#1226): any catalogue asset the faction brings to setup, a single card or token, a deck or a bundle.
 * The asset-picker list reads the listed assets while this chapter is open, and the catalogue only while its add popover is.
 */
export function FactionFormSectionExtras({ form }: { form: FactionFormApi }) {
  return (
    <form.Field name="extras">
      {(field) => {
        const extras = field.state.value ?? [];
        const onChange = (next: readonly { type: string; slug: string }[]) =>
          field.handleChange(next as FactionExtra[]);
        return (
          <ListChapter
            title="Faction Extras"
            help={
              'Catalogue cards, tokens, decks or bundles this faction adds at setup.\nA deck or bundle brings its own counts; a single card or token is one piece.\nA single card wears the back of the deck that holds it. Each Extra is listed once.'
            }
            note={
              extras.length === 0 ? { title: 'No Extras', text: 'The faction brings only its own components.' } : null
            }
            actions={
              <AssetListAdd
                value={extras}
                types={EXTRA_TYPES}
                defaultType="card-custom"
                copy={{ addLabel: 'Add Extra' }}
                onChange={onChange}
              />
            }
          >
            <AssetList value={extras} label="Extras" onChange={onChange} />
          </ListChapter>
        );
      }}
    </form.Field>
  );
}

/** The artifact column's view: what the faction adds to its starting supply. */
export function FactionExtrasProof({ extras }: { extras: readonly FactionExtra[] }) {
  return (
    <Stack component="section" gap="sm" className={styles.extrasProof} p="lg" aria-label="Starting Extras">
      <Text ff="serif" fw={800} className={styles.sheetCaps}>
        Added at setup
      </Text>
      {extras.length === 0 ? (
        <EmptyNote>Nothing beyond the faction&apos;s own components.</EmptyNote>
      ) : (
        extras.map((extra) => <ExtraLabel key={factionExtraKey(extra)} extra={extra} />)
      )}
    </Stack>
  );
}
