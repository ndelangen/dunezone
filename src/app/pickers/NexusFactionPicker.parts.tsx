import { Box, Group, Stack, Text } from '@mantine/core';
import { FactionVariantCount } from '@ui/content/FactionVariantCount';

import type { NexusFactionChoice } from '@db/factions';
import { Token as FactionToken } from '@game/assets/faction/token/Token';

/** One Faction in the Nexus card's picker: its token and name, who maintains it, and its variant count at the row's end. */
export function NexusFactionRow({ faction }: Readonly<{ faction: NexusFactionChoice }>) {
  /* Never the owner's raw account id; an owner without a public name is unknown, as in the other pickers. */
  const owner = faction.owner?.trim() || 'Unknown owner';
  return (
    <Group gap="sm" wrap="nowrap" align="center">
      <Box aria-hidden w={30} h={30} miw={30}>
        <FactionToken emblem={faction.emblem} background={faction.background} />
      </Box>
      <Stack gap="xs" miw={0} flex={1}>
        <Text size="sm" fw={700} lh={1.25}>
          {faction.name}
        </Text>
        <Text size="xs" c="dimmed" lh={1.2}>
          {faction.group ? `${owner} · ${faction.group}` : owner}
        </Text>
      </Stack>
      <FactionVariantCount count={faction.variantCount} />
    </Group>
  );
}
