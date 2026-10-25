import preview from '@sb/preview';
import { LEADERS } from '@shared/assetIds';
import { expect, within } from 'storybook/test';

import { LeadersAllianceFixture, withLeadersAndDecals } from './FactionFormSectionLeadersAlliance.stories.fixture';

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
  /* A faction with no alliance decals, which the alliance section answers with a notice rather than an empty list. */
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No alliance decals')).toBeVisible();
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/^The alliance advantage is empty\./)).toHaveAttribute('role', 'status');
    await expect(canvas.getByText(/^The faction leader name is empty\./)).toHaveAttribute('role', 'status');
    await expect(
      canvas.getByText(/Most factions use five supporting leaders; this roster is still valid\./)
    ).toBeVisible();
  },
});
