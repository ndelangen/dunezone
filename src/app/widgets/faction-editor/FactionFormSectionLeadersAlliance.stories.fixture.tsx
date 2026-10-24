import { Box, Stack } from '@mantine/core';
import { DECAL, LEADERS } from '@shared/assetIds';
import { useForm } from '@tanstack/react-form';

import type { Faction } from '@db/factions';

import { defaultFaction } from './defaultFaction';
import { FactionFormSectionAlliance } from './FactionFormSectionAlliance';
import { FactionFormSectionFactionLeader } from './FactionFormSectionFactionLeader';
import { FactionFormSectionLeaders } from './FactionFormSectionLeaders';

export function LeadersAllianceFixture({ faction }: { faction: Faction }) {
  const form = useForm<
    Faction,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined
  >({
    defaultValues: structuredClone(faction),
  });

  return (
    <Box w="min(78rem, calc(100vw - 2rem))" p="md">
      <Stack gap="xl">
        <FactionFormSectionFactionLeader form={form} />
        <FactionFormSectionLeaders form={form} />
        <FactionFormSectionAlliance form={form} />
      </Stack>
    </Box>
  );
}

export function withLeadersAndDecals(leaderCount: number, decalCount: number): Faction {
  const faction = structuredClone(defaultFaction);
  faction.factionLeader = {
    name: 'Lady Corinne',
    image: LEADERS.options[0],
  };
  faction.leaders = Array.from({ length: leaderCount }, (_, index) => ({
    name: `Supporting leader ${index + 1}`,
    strength: index + 1,
    image: LEADERS.options[index % LEADERS.options.length],
  }));
  faction.decals = Array.from({ length: decalCount }, (_, index) => ({
    id: DECAL.options[index % DECAL.options.length],
    muted: index % 2 === 1,
    outline: index % 2 === 0,
    scale: 0.42 + index * 0.12,
    offset: [index * 48 - 24, index * -36],
  }));
  faction.rules.alliance.text = '**Share prescience.** Your ally may use one of your revealed advantages.';
  return faction;
}
