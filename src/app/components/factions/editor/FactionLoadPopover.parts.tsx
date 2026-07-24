import { Box, Group, Stack, Text } from '@mantine/core';

import type { FactionData, FactionLoadPickerRow } from '@db/factions';
import { Token as FactionToken } from '@game/assets/faction/token/Token';

export function factionLoadOptionLabel(row: FactionLoadPickerRow): string {
  return `${row.data.name} (${row.slug})`;
}

export function factionLoadOptionSearchText(row: FactionLoadPickerRow): string {
  return [row.id, row.data.name, row.slug, row.groupLabel, row.ownerUsername ?? ''].join(' ');
}

export function factionLoadOwnerLabel(
  row: Pick<FactionLoadPickerRow, 'ownerUsername' | 'ownerId'>
): string {
  const u = row.ownerUsername?.trim();
  if (u) return u;
  return row.ownerId || 'Unknown owner';
}

export type FactionLoadOptionRowProps = {
  name: string;
  slug: string;
  logo: FactionData['logo'];
  background: FactionData['background'];
  ownerLabel: string;
  groupLabel: string;
  isMember: boolean;
};

export function FactionLoadOptionRow({
  name,
  slug,
  logo,
  background,
  ownerLabel,
  groupLabel,
  isMember,
}: FactionLoadOptionRowProps) {
  return (
    <Group gap="sm" wrap="nowrap" align="center">
      <Box aria-hidden w={30} h={30} miw={30} style={{ display: 'grid', placeItems: 'center' }}>
        <Box w="100%" h="100%">
          <FactionToken logo={logo} background={background} />
        </Box>
      </Box>
      <Stack gap={1} miw={0}>
        <Text size="sm" fw={700} lh={1.25}>
          {name}
        </Text>
        <Text size="xs" c="dimmed" lh={1.2}>
          Owner: {ownerLabel} · Group: {groupLabel}
          {isMember ? ' (You are a member)' : ''}
        </Text>
        <Text size="xs" c="dimmed" lh={1.2}>
          Slug: {slug}
        </Text>
      </Stack>
    </Group>
  );
}
