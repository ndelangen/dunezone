import { Box, Group, Stack, Text } from '@mantine/core';
import { QualifiedName } from '@ui/content/QualifiedName';

import type { FactionData, FactionLoadPickerRow } from '@db/factions';
import { Token as FactionToken } from '@game/assets/faction/token/Token';

export function factionLoadOptionSearchText(row: FactionLoadPickerRow): string {
  return [row.id, row.data.name, row.variant ?? '', row.slug, row.groupLabel, row.ownerUsername ?? ''].join(' ');
}

/* Never the owner's raw account id, which means nothing to a reader; an owner without a public name is unknown, as in the other pickers. */
export function factionLoadOwnerLabel(row: Pick<FactionLoadPickerRow, 'ownerUsername'>): string {
  return row.ownerUsername?.trim() || 'Unknown owner';
}

export type FactionLoadOptionRowProps = {
  name: string;
  slug: string;
  emblem: FactionData['emblem'];
  background: FactionData['background'];
  ownerLabel: string;
  groupLabel: string;
  isMember: boolean;
  /** The variant's name, where the faction has several variants to tell apart. */
  variant?: string;
};

export function FactionLoadOptionRow({
  name,
  slug,
  emblem,
  background,
  ownerLabel,
  groupLabel,
  isMember,
  variant,
}: FactionLoadOptionRowProps) {
  return (
    <Group gap="sm" wrap="nowrap" align="center">
      <Box aria-hidden w={30} h={30} miw={30} style={{ display: 'grid', placeItems: 'center' }}>
        <Box w="100%" h="100%">
          <FactionToken emblem={emblem} background={background} />
        </Box>
      </Box>
      <Stack gap="xs" miw={0}>
        <Text size="sm" fw={700} lh={1.25}>
          <QualifiedName name={name} qualifier={variant} />
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
