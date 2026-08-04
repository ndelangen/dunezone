import { Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';

import type { FactionCatalogueSpotlightData } from '@db/factions';
import { Token as FactionToken } from '@game/assets/faction/token/Token';

import styles from './FactionCatalogueSpotlight.module.css';

/** A compact link for a faction singled out by catalogue recency. */
export function FactionCatalogueSpotlight({
  faction,
  label,
  meta,
}: {
  faction: FactionCatalogueSpotlightData;
  label: string;
  meta: string;
}) {
  return (
    <UnstyledButton
      className={styles.root}
      renderRoot={(rootProps) => (
        <Link {...rootProps} to="/factions/$factionId" params={{ factionId: faction.slug }} />
      )}
    >
      <Group wrap="nowrap" gap="sm">
        <div className={styles.token} aria-hidden>
          <FactionToken logo={faction.data.logo} background={faction.data.background} />
        </div>
        <Stack gap={1} miw={0} flex={1}>
          <Text size="xs" tt="uppercase" fw={800} c="dune.8">
            {label}
          </Text>
          <Text fw={700} truncate>
            {faction.data.name}
          </Text>
          <Text size="xs" c="dimmed">
            {meta}
          </Text>
        </Stack>
        <ChevronRight size={18} aria-hidden />
      </Group>
    </UnstyledButton>
  );
}
