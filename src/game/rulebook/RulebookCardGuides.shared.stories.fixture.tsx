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

export async function expectContained({ canvasElement }: { canvasElement: HTMLElement }) {
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

export function ComponentEntryStory({ size = 'a4' }: { size?: RulebookSize }) {
  return <CardGuideStory treatment="entry" size={size} />;
}
export function CardGroupStory({
  treatment = 'compact',
  size = 'a4',
}: {
  treatment?: GroupVariant | 'incomplete';
  size?: RulebookSize;
}) {
  return <CardGuideStory treatment={treatment} size={size} />;
}
