import preview from '@sb/preview';
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
    expect(items.map((item) => item.getAttribute('data-rulebook-item-id'))).toEqual(['SUPL', 'SEED', 'TRSH']);
    const rectangles = items.map((item) => item.getBoundingClientRect());
    expect(rectangles[1]!.top).toBeGreaterThan(rectangles[0]!.bottom);
    expect(rectangles[2]!.top).toBeGreaterThan(rectangles[1]!.bottom);
  },
});

export const GalleryGroup = meta.story({
  args: { treatment: 'gallery' },
  play: async (context) => {
    await expectContained(context);
    const items = [...context.canvasElement.querySelectorAll('[data-rulebook-item-id]')];
    const rectangles = items.map((item) => item.getBoundingClientRect());
    expect(rectangles[1]!.top).toBeCloseTo(rectangles[0]!.top, 1);
    expect(rectangles[2]!.top).toBeCloseTo(rectangles[0]!.top, 1);
    expect(rectangles[1]!.left).toBeGreaterThan(rectangles[0]!.right);
    expect(rectangles[2]!.left).toBeGreaterThan(rectangles[1]!.right);
  },
});

export const FeaturedMemberGroup = meta.story({
  args: { treatment: 'featured-member' },
  play: async (context) => {
    await expectContained(context);
    const items = [...context.canvasElement.querySelectorAll('[data-rulebook-item-id]')];
    expect(items.filter((item) => item.hasAttribute('data-card-featured'))).toHaveLength(1);
    const rectangles = items.map((item) => item.getBoundingClientRect());
    expect(rectangles[0]!.width).toBeGreaterThan(rectangles[1]!.width * 2);
    expect(rectangles[1]!.top).toBeCloseTo(rectangles[2]!.top, 1);
  },
});

export const IncompleteGroups = meta.story({
  args: { treatment: 'incomplete', size: 'tall' },
  play: async (context) => {
    await expectContained(context);
    expect(context.canvasElement.querySelector('[data-card-featured]')).toBeNull();
    expect(context.canvasElement.querySelector('[data-rulebook-block-id="EMPT"] ul')).toBeNull();
    expect(context.canvasElement.textContent).toContain('Quantity: 0');
  },
});
