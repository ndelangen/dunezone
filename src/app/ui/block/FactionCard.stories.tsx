import preview from '@sb/preview';
import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';
import { IconAction } from '@ui/control/IconAction';
import { EllipsisVertical } from 'lucide-react';
import { expect, waitFor, within } from 'storybook/test';

import type { FactionCatalogueEntry } from '@db/factions';

import { FactionCard } from './FactionCard';
import { baseFaction, publishedImage, failedImage, withImages, missingToken } from './FactionCard.stories.fixture';

const longName = 'The Very Long and Distinguished House of Atreides Expeditionary Council';

const meta = preview.meta({
  component: FactionCard,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: '19rem' }}>
        <Story />
      </div>
    ),
  ],
  args: { faction: baseFaction },
});

export const Default = meta.story({
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', {
        name: 'Atreides Advanced Dune Novice complexity, 2 out of 10',
      })
    ).toBeVisible();
  },
});

export const MultipleRulesets = meta.story({
  args: {
    faction: {
      ...baseFaction,
      rulesets: [
        { id: 'ruleset-advanced', slug: 'advanced', name: 'Advanced Dune' },
        { id: 'ruleset-classic', slug: 'classic', name: 'Classic Dune' },
        { id: 'ruleset-tournament', slug: 'tournament', name: 'Tournament Dune' },
      ],
    } as FactionCatalogueEntry,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Advanced Dune +2')).toBeVisible();
  },
});

export const ContentStress = meta.story({
  args: {
    faction: {
      ...baseFaction,
      data: {
        ...assetPublishingFaction,
        name: longName,
        leaders: assetPublishingFaction.leaders.slice(0, 3),
      },
      rulesets: [],
    } as FactionCatalogueEntry,
  },
  decorators: [
    (Story) => (
      <div style={{ width: '10rem' }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    /* The link's name is the caption alone, so no ruleset label renders. */
    const card = canvas
      .getByRole('link', { name: `${longName} Novice complexity, 2 out of 10` })
      .getBoundingClientRect();
    const name = canvas.getByText(longName).getBoundingClientRect();
    await expect(name.left).toBeGreaterThanOrEqual(card.left);
    await expect(name.right).toBeLessThanOrEqual(card.right);
  },
});

/** With an adornment: a control that acts on the faction where it is listed, top-left because the other corners are taken. */
export const WithAction = meta.story({
  args: {
    action: (
      <IconAction
        label="Faction actions"
        emphasis="standard"
        intent="neutral"
        size="sm"
        icon={<EllipsisVertical size={15} aria-hidden />}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link');
    const actionButton = canvas.getByRole('button', { name: 'Faction actions' });

    await expect(actionButton).toBeVisible();
    /* The whole point of the adornment being a sibling: clicking it cannot navigate, because it is not inside the link. */
    await expect(link.contains(actionButton)).toBe(false);
  },
});

export const Published = meta.story({
  args: { faction: withImages(publishedImage) },
  play: async ({ canvasElement }) => {
    await waitFor(async () => {
      const images = canvasElement.querySelectorAll('img');
      await expect(images).toHaveLength(5);
      await expect([...images].every((image) => image.naturalWidth === 600)).toBe(true);
    });
  },
});

export const MissingPublications = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('LJ')).toBeVisible();
    await expect(canvasElement.querySelectorAll('img')).toHaveLength(0);
  },
});

export const FailedPublications = meta.story({
  args: { faction: withImages(failedImage) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).findByRole('img', missingToken)).resolves.toBeVisible();
    await waitFor(() => expect(canvasElement.querySelectorAll('img')).toHaveLength(0));
    await expect(within(canvasElement).getByRole('link')).toHaveAttribute('href', '/factions/atreides');
  },
});

export const LiveDraftPreview = meta.story({
  args: { livePreview: true, faction: withImages(failedImage) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Lady Jessica')).toBeVisible();
    await expect(canvasElement.querySelectorAll('img')).toHaveLength(0);
  },
});
