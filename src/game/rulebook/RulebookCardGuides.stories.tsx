import preview from '@sb/preview';
import type { RulebookBlockDraft } from '@shared/rulebooks/contents';
import type { RulebookSize } from '@shared/rulebooks/settings';
import { expect } from 'storybook/test';

import { cardEntryFixture, cardGroupFixture, cardGuidePage } from './RulebookCardGuides.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

type GroupVariant = Extract<RulebookBlockDraft, { kind: 'card-group' }>['variant'];

function CardGuideStory({
  treatment = 'entry',
  size = 'a4',
}: Readonly<{ treatment?: 'entry' | GroupVariant | 'incomplete'; size?: RulebookSize }>) {
  let blocks: Parameters<typeof cardGuidePage>[0];
  if (treatment === 'entry') {
    blocks = [cardEntryFixture()];
  } else if (treatment === 'incomplete') {
    blocks = [
      {
        ...cardGroupFixture('featured-member'),
        featuredItemId: undefined,
        itemOrder: ['LOST', 'OPEN'],
        itemsById: {
          LOST: {
            id: 'LOST',
            source: { kind: 'asset', assetId: 'unavailable-card' },
            quantity: 0,
            text: 'This card is excluded from the example. Its explanation remains when the source is unavailable.',
          },
          OPEN: { id: 'OPEN', text: 'Choose the next card when the guide is ready to expand.' },
        },
      },
      {
        ...cardGroupFixture('compact'),
        id: 'EMPT',
        anchor: 'future-card-group',
        title: 'Other treachery cards',
        text: 'An author can begin with shared guidance and add the cards later.',
        featuredItemId: undefined,
        itemOrder: [],
        itemsById: {},
      },
    ];
  } else {
    blocks = [cardGroupFixture(treatment)];
  }
  return (
    <div style={{ width: size === 'tall' ? 'min(24rem, 92vw)' : 'min(44rem, 92vw)' }}>
      <RulebookPageRenderer page={cardGuidePage(blocks)} settings={{ size, design: 'illustrated' }} />
    </div>
  );
}

const meta = preview.meta({
  title: 'Card guides',
  component: CardGuideStory,
  args: { treatment: 'entry', size: 'a4' },
  parameters: { layout: 'centered' },
});

async function expectContained({ canvasElement }: { canvasElement: HTMLElement }) {
  await document.fonts.ready;
  await Promise.all(
    [...canvasElement.querySelectorAll<HTMLImageElement>('[data-rulebook-block-id] img')].map((image) => image.decode())
  );
  const region = canvasElement.querySelector('[data-rulebook-region]')!.getBoundingClientRect();
  for (const block of canvasElement.querySelectorAll('[data-rulebook-block-id]')) {
    const bounds = block.getBoundingClientRect();
    expect(bounds.left).toBeGreaterThanOrEqual(region.left - 1);
    expect(bounds.right).toBeLessThanOrEqual(region.right + 1);
    expect(bounds.bottom).toBeLessThanOrEqual(region.bottom + 1);
  }
}

export const IndividualCard = meta.story({ play: expectContained });
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
