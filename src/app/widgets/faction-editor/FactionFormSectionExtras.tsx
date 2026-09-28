import { ActionIcon, Button, Group, Popover, Stack, Text } from '@mantine/core';
import { ASSET_TYPES } from '@shared/assets/types';
import { FACTION_EXTRA_TYPES, factionExtraKey } from '@shared/factions/extras';
import type { FactionExtra } from '@shared/factions/extras';
import { X } from 'lucide-react';
import { useState } from 'react';

import { AssetPicker } from '@app/pickers/AssetPicker';

import styles from './FactionEditor.module.css';
import type { FactionFormApi } from './factionFormTypes';

const EXTRA_TYPES = [...FACTION_EXTRA_TYPES];

/*
 * A row names its asset by catalogue address, the way the faction stores it: the editor fetches nothing for rows already listed.
 * The save refuses an address the catalogue lacks, and Play names one that has since gone.
 */
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

function ExtrasList({ extras, onRemove }: { extras: FactionExtra[]; onRemove: (index: number) => void }) {
  if (extras.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No Extras. The faction brings only its own components.
      </Text>
    );
  }
  return (
    <Stack component="ul" gap="xs" aria-label="Extras" className={styles.extrasList}>
      {extras.map((extra, index) => (
        <Group component="li" key={factionExtraKey(extra)} gap="sm" wrap="nowrap">
          <ExtraLabel extra={extra} />
          <ActionIcon variant="subtle" color="gray" aria-label={`Remove ${extra.slug}`} onClick={() => onRemove(index)}>
            <X size={16} aria-hidden />
          </ActionIcon>
        </Group>
      ))}
    </Stack>
  );
}

/**
 * Faction Extras (#1226): catalogue decks, token bundles and single tokens the faction brings to setup.
 * The picker loads the catalogue only while its popover is open.
 */
export function FactionFormSectionExtras({ form }: { form: FactionFormApi }) {
  const [picking, setPicking] = useState(false);
  return (
    <Stack component="section" gap="md" aria-labelledby="extras-heading">
      <Stack gap="xs">
        <Text id="extras-heading" fw={700} size="lg">
          Faction Extras
        </Text>
        <Text c="dimmed" size="sm">
          Decks, token bundles and single tokens from the catalogue that this faction adds at setup. A deck or bundle
          brings its own counts; a single token is one piece. Each Extra is listed once.
        </Text>
      </Stack>
      <form.Field name="extras">
        {(field) => {
          const extras = field.state.value ?? [];
          return (
            <Stack gap="sm">
              <Group justify="flex-end">
                <Popover opened={picking} onChange={setPicking} width={340} position="bottom-end" withinPortal>
                  <Popover.Target>
                    <Button variant="light" size="compact-sm" onClick={() => setPicking((open) => !open)}>
                      Add Extra
                    </Button>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <AssetPicker
                      types={EXTRA_TYPES}
                      filter={(entry) =>
                        !extras.some((extra) => extra.type === entry.type && extra.slug === entry.slug)
                      }
                      copy={{
                        searchLabel: 'Search decks, bundles and tokens',
                        searchPlaceholder: 'Type a name, slug or owner…',
                        emptyMessage: 'No other decks, bundles or tokens exist yet.',
                        cancelLabel: 'Done',
                      }}
                      onPick={(picked) => {
                        setPicking(false);
                        field.handleChange([
                          ...extras,
                          { type: picked.type as FactionExtra['type'], slug: picked.slug },
                        ]);
                      }}
                      onCancel={() => setPicking(false)}
                    />
                  </Popover.Dropdown>
                </Popover>
              </Group>
              <ExtrasList
                extras={extras}
                onRemove={(index) => field.handleChange(extras.filter((_, at) => at !== index))}
              />
            </Stack>
          );
        }}
      </form.Field>
    </Stack>
  );
}

/** The artifact column's view: what the faction adds to its starting supply. */
export function FactionExtrasProof({ extras }: { extras: readonly FactionExtra[] }) {
  return (
    <Stack component="section" gap="sm" className={styles.phaseProof} p="lg" aria-label="Starting Extras">
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
