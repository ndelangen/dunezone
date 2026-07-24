import { Box, Stack } from '@mantine/core';
import preview from '@sb/preview';
import { useForm } from '@tanstack/react-form';

import type { Faction } from '@db/factions';
import { defaultFaction } from '@data/defaultFaction';
import { DECAL, LEADERS } from '@game/data/generated';

import { FactionFormSectionAlliance } from './FactionFormSectionAlliance';
import { FactionFormSectionHero } from './FactionFormSectionHero';
import { FactionFormSectionLeaders } from './FactionFormSectionLeaders';

function LeadersAllianceFixture({ faction }: { faction: Faction }) {
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
        <FactionFormSectionHero form={form} />
        <FactionFormSectionLeaders form={form} />
        <FactionFormSectionAlliance form={form} />
      </Stack>
    </Box>
  );
}

function withLeadersAndDecals(leaderCount: number, decalCount: number): Faction {
  const faction = structuredClone(defaultFaction);
  faction.hero = {
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
  faction.rules.alliance.text =
    '**Share prescience.** Your ally may use one of your revealed advantages.';
  return faction;
}

const meta = preview.meta({
  title: 'App/Factions/Editor/LeadersAndAlliance',
  component: LeadersAllianceFixture,
  globals: {
    viewport: {
      value: 'appDesktop',
    },
  },
  parameters: {
    layout: 'fullscreen',
  },
});

export const ConventionalFive = meta.story({
  args: {
    faction: withLeadersAndDecals(5, 2),
  },
});

export const ValidZero = meta.story({
  args: {
    faction: withLeadersAndDecals(0, 0),
  },
});

export const MaximumTen = meta.story({
  args: {
    faction: withLeadersAndDecals(10, 3),
  },
});

export const AdvisoryBlanks = meta.story({
  args: {
    faction: {
      ...withLeadersAndDecals(2, 1),
      hero: {
        name: '',
        image: LEADERS.options[0],
      },
      rules: {
        ...withLeadersAndDecals(2, 1).rules,
        alliance: { text: '' },
      },
    },
  },
});

export const PreviewFreeMobile = meta.story({
  args: {
    faction: withLeadersAndDecals(5, 2),
  },
  globals: {
    viewport: {
      value: 'appMobile',
    },
  },
});
