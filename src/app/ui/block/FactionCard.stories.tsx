import { Button } from '@mantine/core';
import preview from '@sb/preview';
import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';
import { IconAction } from '@ui/control/IconAction';
import { EllipsisVertical } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import type { FactionCatalogueEntry } from '@db/factions';

import { FactionCard } from './FactionCard';

const baseFaction = {
  _id: 'faction-atreides',
  _creationTime: Date.parse('2026-07-20T10:00:00.000Z'),
  owner_id: 'owner-1',
  data: assetPublishingFaction,
  slug: 'atreides',
  group_id: null,
  created_at: '2026-07-20T10:00:00.000Z',
  updated_at: '2026-07-20T10:00:00.000Z',
  is_deleted: false,
  rulesets: [{ id: 'ruleset-advanced', slug: 'advanced', name: 'Advanced Dune' }],
} as unknown as FactionCatalogueEntry;

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
});

export const SelectedRulesetPriority = meta.story({
  args: {
    faction: {
      ...baseFaction,
      rulesets: [
        { id: 'ruleset-advanced', slug: 'advanced', name: 'Advanced Dune' },
        { id: 'ruleset-classic', slug: 'classic', name: 'Classic Dune' },
      ],
    } as FactionCatalogueEntry,
    selectedRulesetSlug: 'classic',
  },
});

export const ContentStress = meta.story({
  args: {
    faction: {
      ...baseFaction,
      data: {
        ...assetPublishingFaction,
        name: 'The Very Long and Distinguished House of Atreides Expeditionary Council',
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

/* A self-contained image exercises publication delivery without a live publisher. */
const publishedImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><circle cx="300" cy="300" r="300" fill="#4b4c0d"/><circle cx="300" cy="300" r="285" fill="none" stroke="#e3dbb3" stroke-width="8"/><text x="300" y="340" text-anchor="middle" font-family="serif" font-size="120" fill="#e3dbb3">AT</text></svg>')}`;
const failedImage = 'data:image/png;base64,not-an-image';

function withImages(image: string): FactionCatalogueEntry {
  return {
    ...baseFaction,
    tokenImages: {
      faction: image,
      members: Object.fromEntries(
        [baseFaction.data.hero, ...baseFaction.data.leaders].map((member) => [member.memberId, image])
      ),
    },
  };
}

export const Published = meta.story({
  args: { faction: withImages(publishedImage) },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const images = canvasElement.querySelectorAll('img');
      expect(images).toHaveLength(5);
      expect([...images].every((image) => image.naturalWidth === 600)).toBe(true);
    });
  },
});

export const MissingPublications = meta.story({
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByText('LJ')).toBeVisible();
    expect(canvasElement.querySelectorAll('img')).toHaveLength(0);
  },
});

/* The tokens are decorative beside the link's own name, so their missing state sits under `aria-hidden`. */
const missingToken = { name: 'Lady Jessica: preview unavailable', hidden: true };

export const FailedPublications = meta.story({
  args: { faction: withImages(failedImage) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).findByRole('img', missingToken)).resolves.toBeVisible();
    await waitFor(() => expect(canvasElement.querySelectorAll('img')).toHaveLength(0));
    expect(within(canvasElement).getByRole('link')).toHaveAttribute('href', '/factions/atreides');
  },
});

function ReplacementPublication() {
  const [image, setImage] = useState(failedImage);
  return (
    <>
      <FactionCard faction={withImages(image)} />
      <Button onClick={() => setImage(publishedImage)}>Use new publication</Button>
    </>
  );
}

export const PublicationAfterFailure = meta.story({
  render: () => <ReplacementPublication />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('img', missingToken);
    await userEvent.click(canvas.getByRole('button', { name: 'Use new publication' }));
    await waitFor(() => {
      const images = canvasElement.querySelectorAll('img');
      expect(images).toHaveLength(5);
      expect([...images].every((image) => image.naturalWidth === 600)).toBe(true);
    });
  },
});

export const LiveDraftPreview = meta.story({
  args: { livePreview: true, faction: withImages(failedImage) },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByLabelText('Lady Jessica')).toBeVisible();
    expect(canvasElement.querySelectorAll('img')).toHaveLength(0);
  },
});
