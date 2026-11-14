import { SimpleGrid } from '@mantine/core';
import preview from '@sb/preview';
import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';
import { IconAction } from '@ui/control/IconAction';
import { EllipsisVertical } from 'lucide-react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import type { FactionCatalogueEntry } from '@db/factions';

import { FactionCard } from './FactionCard';
import {
  baseFaction,
  inRulesets,
  publishedImage,
  failedImage,
  withImages,
  missingToken,
} from './FactionCard.stories.fixture';

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

/** Up to four rulesets stand under the name as their covers, each named on hover; one without a cover shows its initial. */
export const MultipleRulesets = meta.story({
  args: { faction: inRulesets(3) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const covers = canvas.getByRole('img', { name: 'Advanced Dune, Classic Dune, Tournament Dune' });
    await expect(covers).toBeVisible();
    await waitFor(async () => {
      const images = covers.querySelectorAll('img');
      await expect(images).toHaveLength(2);
      await expect([...images].every((image) => image.naturalWidth > 0)).toBe(true);
    });
    await expect(within(covers).getByText('T')).toBeVisible();
    await expect(within(covers).queryByText(/^\+/)).toBeNull();
    await userEvent.hover(covers.querySelector('img')!);
    /* The tooltip fades in, so it is waited for rather than read as it mounts. */
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole('tooltip', { name: 'Advanced Dune' });
    await waitFor(() => expect(tooltip).toBeVisible());
  },
});

/** From five rulesets the fourth place counts the rest, and the ruleset the list is narrowed to leads. */
export const ManyRulesets = meta.story({
  args: { faction: inRulesets(6), selectedRulesetSlug: 'spring-cup' },
  play: async ({ canvasElement }) => {
    const covers = within(canvasElement).getByRole('img', {
      name: 'Spring Cup, Advanced Dune, Classic Dune, Tournament Dune, Dreamrules, Sietch house rules',
    });
    await expect(covers.children).toHaveLength(4);
    await expect(within(covers).getByText('+3')).toBeVisible();
    await userEvent.hover(within(covers).getByText('+3'));
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole('tooltip', {
      name: 'Tournament Dune, Dreamrules, Sietch house rules',
    });
    await waitFor(() => expect(tooltip).toBeVisible());
  },
});

const rulesetCounts = [0, 1, 3, 4, 6, 8];

/**
 * A faction in no ruleset, one, three, four, six and eight, as compact cards two across a phone.
 * No ruleset leaves no row, and the row never outgrows the caption or cuts its count.
 */
export const RulesetCounts = meta.story({
  render: () => (
    <SimpleGrid cols={2} spacing="sm">
      {rulesetCounts.map((count) => (
        <FactionCard key={count} faction={inRulesets(count)} />
      ))}
    </SimpleGrid>
  ),
  play: async ({ canvasElement }) => {
    const cards = within(canvasElement).getAllByRole('link');
    /* The complexity glyph is a picture too, so the row of covers is the one that is not it. */
    const coversOf = (card: HTMLElement) =>
      within(card)
        .getAllByRole('img')
        .find((picture) => !picture.getAttribute('aria-label')?.includes('complexity'));
    await expect(cards.map((card) => coversOf(card)?.children.length ?? 0)).toEqual([0, 1, 3, 4, 4, 4]);
    await expect(within(cards[4]!).getByText('+3')).toBeVisible();
    await expect(within(cards[5]!).getByText('+5')).toBeVisible();
    for (const card of cards) {
      const covers = coversOf(card);
      if (!covers) {
        continue;
      }
      /* The row sits inside the card and stops short of the complexity glyph at the caption's right. */
      const row = covers.getBoundingClientRect();
      const glyph = within(card)
        .getByRole('img', { name: /complexity/ })
        .getBoundingClientRect();
      await expect(row.left).toBeGreaterThanOrEqual(card.getBoundingClientRect().left);
      await expect(row.bottom).toBeLessThanOrEqual(card.getBoundingClientRect().bottom);
      await expect(row.right).toBeLessThanOrEqual(glyph.left);
      /* No disc cuts what it holds: the "+N" fits its circle. */
      for (const disc of covers.children) {
        const count = disc.querySelector('span');
        await expect(count?.scrollWidth ?? 0).toBeLessThanOrEqual(disc.clientWidth);
      }
    }
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
    /* The link's name is the caption alone, so no row of rulesets renders. */
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
