import { Box, Group, Stack, Text } from '@mantine/core';
import { ActionError } from '@ui/block/ActionError';
import { Disclosure } from '@ui/block/Disclosure';
import { EmptyNote } from '@ui/content/EmptyNote';
import { HoldAction } from '@ui/control/HoldAction';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { useDeleteEmptyFaction, useOwnEmptyFactions } from '@db/factions';
import type { EmptyFactionEntry } from '@db/factions';
import { Token as FactionToken } from '@game/assets/faction/token/Token';

/** What happened and who can act on it, for one Faction or for several. */
function why(count: number) {
  return count === 1
    ? 'Someone else deleted its last variant, so no page shows it any more.\nOnly you, its owner, can delete it.'
    : 'Someone else deleted the last variant of each, so no page shows them any more.\nOnly you, their owner, can delete them.';
}

/**
 * The viewer's own Factions left without a live variant, closing "Factions created" on their own profile alone (#2928).
 * Its own component so the query mounts only for the person it answers, as with their invitations.
 * `whenNone` stands in while there is no such Faction, for a section with nothing else to show.
 */
export function ProfileEmptyFactions({ whenNone = null }: Readonly<{ whenNone?: ReactNode }>) {
  const factions = useOwnEmptyFactions() ?? [];
  const remove = useDeleteEmptyFaction();
  /* The Faction last held, so only its own hold reads as busy. */
  const [heldId, setHeldId] = useState<string | null>(null);
  if (factions.length === 0 && !remove.error) {
    return whenNone;
  }
  return (
    <Stack gap="xs">
      <ActionError subject="Faction" verb="delete" error={remove.error} />
      <Stack component="ul" gap="xs" m={0} p={0} style={{ listStyle: 'none' }}>
        {factions.map((faction) => (
          <EmptyFactionRow
            key={faction.id}
            faction={faction}
            busy={remove.isPending}
            deleting={remove.isPending && heldId === faction.id}
            onDelete={() => {
              setHeldId(faction.id);
              remove.mutate({ family_id: faction.id });
            }}
          />
        ))}
      </Stack>
      {factions.length > 0 ? (
        /* The line is the toggle, so it gets a box of its own to stretch over. */
        <Box pos="relative">
          <Disclosure title="Why a faction has no variants">
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-line' }}>
              {why(factions.length)}
            </Text>
          </Disclosure>
        </Box>
      ) : null}
    </Stack>
  );
}

/** One empty Faction: its emblem, its name, that it has no variants, and the hold that deletes it. */
function EmptyFactionRow({
  faction,
  busy,
  deleting,
  onDelete,
}: Readonly<{ faction: EmptyFactionEntry; busy: boolean; deleting: boolean; onDelete: () => void }>) {
  /* A Faction whose data does not parse still has its address to go by. */
  const name = faction.data?.name ?? faction.slug;
  return (
    <Group component="li" gap="sm" wrap="nowrap">
      <Box pos="relative" w={28} h={28} flex="none" style={{ overflow: 'hidden', borderRadius: '50%' }} aria-hidden>
        {faction.data ? <FactionToken emblem={faction.data.emblem} background={faction.data.background} /> : null}
      </Box>
      <Group gap="xs" flex={1} miw={0} align="baseline" style={{ rowGap: 0 }}>
        <Text size="sm" fw={600}>
          {name}
        </Text>
        <EmptyNote>No variants</EmptyNote>
      </Group>
      <HoldAction
        size="md"
        label={`Delete ${name}`}
        hint="Hold to delete this faction."
        pending={deleting}
        disabled={busy && !deleting}
        onConfirm={onDelete}
      />
    </Group>
  );
}
