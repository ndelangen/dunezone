import { Box, Stack } from '@mantine/core';
import preview from '@sb/preview';
import { DECAL, LEADERS } from '@shared/assetIds';
import { useForm } from '@tanstack/react-form';
import { expect, screen, within } from 'storybook/test';

import type { Faction } from '@db/factions';

import { defaultFaction } from './defaultFaction';
import { FactionFormSectionAlliance } from './FactionFormSectionAlliance';
import { FactionFormSectionFactionLeader } from './FactionFormSectionFactionLeader';
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
        <FactionFormSectionFactionLeader form={form} />
        <FactionFormSectionLeaders form={form} />
        <FactionFormSectionAlliance form={form} />
      </Stack>
    </Box>
  );
}

function withLeadersAndDecals(leaderCount: number, decalCount: number): Faction {
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

const meta = preview.meta({
  title: 'Leaders and Alliance',
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

export const Hivers = meta.story({
  args: {
    faction: {
      ...withLeadersAndDecals(5, 0),
      factionLeader: { name: 'Hiver court', image: '/image/leader/hivers/hiver-high-crown.png' },
      leaders: [
        { name: 'Amber Pendant', strength: 1, image: '/image/leader/hivers/hiver-amber-pendant.png' },
        { name: 'Fur Mantle', strength: 2, image: '/image/leader/hivers/hiver-fur-mantle.png' },
        { name: 'High Crown', strength: 3, image: '/image/leader/hivers/hiver-high-crown.png' },
        { name: 'Horned Mask', strength: 4, image: '/image/leader/hivers/hiver-horned-mask.png' },
        { name: 'Black Ruff', strength: 5, image: '/image/leader/hivers/hiver-black-ruff.png' },
      ],
    },
  },
});

export const AdvisoryBlanks = meta.story({
  args: {
    faction: {
      ...withLeadersAndDecals(2, 1),
      factionLeader: {
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

export const BrowseEveryPortrait = meta.story({
  args: { faction: withLeadersAndDecals(5, 2) },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const portrait = canvas.getByRole('combobox', { name: 'Faction leader portrait' });
    await userEvent.click(portrait);
    await expect(screen.getByRole('listbox').querySelectorAll('[role="option"]')).toHaveLength(LEADERS.options.length);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(canvas.getByRole('button', { name: 'Filter Faction leader portrait collections' }));
    await userEvent.click(screen.getByRole('option', { name: 'Custom portraits / Green and gold uniforms 9' }));
    await userEvent.click(portrait);
    await expect(screen.getByRole('listbox').querySelectorAll('[role="option"]')).toHaveLength(9);
    await userEvent.click(screen.getByRole('option', { name: 'Tanya' }));
    await expect(portrait).toHaveValue('Tanya');
    await userEvent.click(canvas.getByRole('button', { name: 'Filter Faction leader portrait collections' }));
    await userEvent.click(screen.getByRole('option', { name: `All collections ${LEADERS.options.length}` }));
    await userEvent.clear(portrait);
    await userEvent.type(portrait, 'Atreides');
    await expect(screen.getByRole('option', { name: 'Jessica' })).toBeVisible();
    await expect(screen.queryByRole('option', { name: 'Tanya' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    const leaderCollection = canvas.getByRole('button', { name: 'Filter Leader portrait collections' });
    await userEvent.click(leaderCollection);
    await userEvent.click(screen.getByRole('option', { name: 'Custom portraits / Green and gold uniforms 9' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(canvas.getByText('2. Supporting leader 2'));
    await expect(leaderCollection).toHaveAttribute('aria-pressed', 'true');
    const supportingPortrait = canvas.getByRole('combobox', { name: 'Leader portrait' });
    await userEvent.click(supportingPortrait);
    await expect(screen.getByRole('listbox').querySelectorAll('[role="option"]')).toHaveLength(9);
    await userEvent.click(screen.getByRole('option', { name: 'Tirza' }));
    await expect(supportingPortrait).toHaveValue('Tirza');
    await userEvent.click(leaderCollection);
    await userEvent.type(supportingPortrait, 'Atreides');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(screen.getByRole('listbox').querySelectorAll('[role="option"]')).toHaveLength(6);
    await userEvent.type(supportingPortrait, 'Gurney');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(supportingPortrait).toHaveValue('Gurney');
    await userEvent.click(supportingPortrait);
    await userEvent.type(supportingPortrait, 'no matching portrait');
    await expect(screen.getByText('No matching artwork. Try another search or collection.')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect(supportingPortrait).toHaveValue('Gurney');
  },
});
