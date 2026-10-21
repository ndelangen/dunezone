import preview from '@sb/preview';
import { getRulebookSize } from '@shared/rulebooks/settings';
import type { RulebookSize } from '@shared/rulebooks/settings';
import { expect } from 'storybook/test';

import { CardGroupStory, expectContained } from './RulebookCardGuides.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Card group/Rendered',
  component: CardGroupStory,
  args: { treatment: 'compact', size: 'a4' },
  parameters: { layout: 'centered' },
});

export const CompactGroup = meta.story({
  args: { treatment: 'compact' },
  play: async (context) => {
    await expectContained(context);
    const items = [...context.canvasElement.querySelectorAll('[data-rulebook-item-id]')];
    await expect(items.map((item) => item.getAttribute('data-rulebook-item-id'))).toEqual(['SUPL', 'SEED', 'TRSH']);
    const rectangles = items.map((item) => item.getBoundingClientRect());
    await expect(rectangles[1]!.top).toBeGreaterThan(rectangles[0]!.bottom);
    await expect(rectangles[2]!.top).toBeGreaterThan(rectangles[1]!.bottom);
  },
});

export const GalleryGroup = meta.story({
  args: { treatment: 'gallery' },
  play: async (context) => {
    await expectContained(context);
    const items = [...context.canvasElement.querySelectorAll('[data-rulebook-item-id]')];
    const rectangles = items.map((item) => item.getBoundingClientRect());
    await expect(rectangles[1]!.top).toBeCloseTo(rectangles[0]!.top, 1);
    await expect(rectangles[2]!.top).toBeCloseTo(rectangles[0]!.top, 1);
    await expect(rectangles[1]!.left).toBeGreaterThan(rectangles[0]!.right);
    await expect(rectangles[2]!.left).toBeGreaterThan(rectangles[1]!.right);
  },
});

export const FeaturedMemberGroup = meta.story({
  args: { treatment: 'featured-member' },
  play: async (context) => {
    await expectContained(context);
    const items = [...context.canvasElement.querySelectorAll('[data-rulebook-item-id]')];
    await expect(items.filter((item) => item.hasAttribute('data-card-featured'))).toHaveLength(1);
    const rectangles = items.map((item) => item.getBoundingClientRect());
    await expect(rectangles[0]!.width).toBeGreaterThan(rectangles[1]!.width * 2);
    await expect(rectangles[1]!.top).toBeCloseTo(rectangles[2]!.top, 1);
  },
});

export const IncompleteGroups = meta.story({
  args: { treatment: 'incomplete', size: 'tall' },
  play: async (context) => {
    await expectContained(context);
    await expect(context.canvasElement.querySelector('[data-card-featured]')).toBeNull();
    await expect(context.canvasElement.querySelector('[data-rulebook-block-id="EMPT"] ul')).toBeNull();
    await expect(context.canvasElement.textContent).toContain('Quantity: 0');
  },
});

async function expectFanContained(context: { canvasElement: HTMLElement }) {
  await expectContained(context);
  const page = context.canvasElement.querySelector<HTMLElement>('[data-rulebook-page]')!;
  const fan = context.canvasElement.querySelector('.rulebookCardFan')!.getBoundingClientRect();
  // The source shadow extends beyond the transformed card's border box.
  const shadow =
    (page.getBoundingClientRect().width / getRulebookSize(page.dataset.rulebookSize as RulebookSize).widthMm) * 4;
  for (const image of context.canvasElement.querySelectorAll('.rulebookCardFan img')) {
    const bounds = image.getBoundingClientRect();
    await expect(bounds.left - shadow).toBeGreaterThanOrEqual(fan.left - 1);
    await expect(bounds.right + shadow).toBeLessThanOrEqual(fan.right + 1);
    await expect(bounds.top - shadow).toBeGreaterThanOrEqual(fan.top - 1);
    await expect(bounds.bottom + shadow).toBeLessThanOrEqual(fan.bottom + 1);
  }
}

export const SixCardFan = meta.story({
  args: { treatment: 'fan', size: 'gf9-core', fanCount: 6 },
  play: async (context) => {
    await expectFanContained(context);
    const cards = [...context.canvasElement.querySelectorAll('.rulebookCardFan > div')];
    await expect(cards).toHaveLength(6);
    const bounds = cards.map((card) => card.getBoundingClientRect());
    await expect(bounds[1]!.left).toBeLessThan(bounds[0]!.right);
    await expect(bounds[5]!.left).toBeGreaterThan(bounds[0]!.left);
    await expect(cards[0]!.getAttribute('style')).toContain('rotate(-15deg)');
    await expect(cards[5]!.getAttribute('style')).toContain('rotate(15deg)');
  },
});

export const FourCardFan = meta.story({
  args: { treatment: 'fan', size: 'gf9-expansion', fanCount: 4 },
  play: async (context) => {
    await expectFanContained(context);
    await expect(context.canvasElement.querySelectorAll('.rulebookCardFan img')).toHaveLength(4);
  },
});

export const SixCardFanInColumn = meta.story({
  args: { treatment: 'fan', size: 'gf9-core', fanCount: 6, columns: true },
  play: expectFanContained,
});
