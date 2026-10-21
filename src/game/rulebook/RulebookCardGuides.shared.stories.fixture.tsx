import type { RulebookBlockDraft } from '@shared/rulebooks/contents';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import { getRulebookSize } from '@shared/rulebooks/settings';
import type { RulebookSize } from '@shared/rulebooks/settings';
import { expect } from 'storybook/test';

import {
  cardEntryFixture,
  cardGroupFixture,
  cardGuidePage,
  cardGuideAssets,
  techTokenAssets,
} from './RulebookCardGuides.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

type GroupVariant = Extract<RulebookBlockDraft, { kind: 'card-group' }>['variant'];

function CardGuideStory({
  treatment = 'entry',
  size = 'a4',
  fanCount = 6,
}: Readonly<{ treatment?: 'entry' | GroupVariant | 'incomplete'; size?: RulebookSize; fanCount?: 4 | 6 }>) {
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
    const group = cardGroupFixture(treatment);
    if (treatment === 'fan') {
      const items = group.itemOrder.map((id) => group.itemsById[id]!);
      group.title = 'Related cards';
      group.text = '';
      group.itemOrder = Array.from({ length: fanCount }, (_, index) => `CARD${index}`);
      group.itemsById = Object.fromEntries(
        group.itemOrder.map((id, index) => [id, { ...items[index % items.length]!, id, text: '', quantity: undefined }])
      );
    }
    blocks = [group];
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
    await expect(bounds.left).toBeGreaterThanOrEqual(region.left - 1);
    await expect(bounds.right).toBeLessThanOrEqual(region.right + 1);
    await expect(bounds.bottom).toBeLessThanOrEqual(region.bottom + 1);
  }
}

export function ComponentEntryStory({ size = 'a4' }: { size?: RulebookSize }) {
  return <CardGuideStory treatment="entry" size={size} />;
}
export function CardGroupStory({
  treatment = 'compact',
  size = 'a4',
  fanCount = 6,
}: {
  treatment?: GroupVariant | 'incomplete';
  size?: RulebookSize;
  fanCount?: 4 | 6;
}) {
  return <CardGuideStory treatment={treatment} size={size} fanCount={fanCount} />;
}

export function CardEntryLayoutMatrix() {
  return (
    <div>
      {(['gf9-core', 'gf9-expansion'] as const).flatMap((size) =>
        (['left', 'right'] as const).flatMap((imageSide) =>
          (['beside', 'wrap'] as const).flatMap((textFlow) =>
            (['card', 'token'] as const).map((source) => {
              const entry = cardEntryFixture();
              entry.imageSide = imageSide;
              entry.textFlow = textFlow;
              entry.name = `${size} ${source} ${imageSide} ${textFlow}`;
              entry.text =
                'A short opening paragraph.\n\n' +
                'Keep each illustration beside the explanation. Text below the image uses the complete available width. '
                  .repeat(size === 'gf9-core' ? 21 : 11)
                  .trim();
              if (source === 'token') {
                entry.source = { kind: 'asset', assetId: 'tech' };
              }
              const page = cardGuidePage([]);
              page.title = entry.name;
              page.regions[0]!.blocks = [
                projectRulebookDraftRenderBlock(entry, { ...cardGuideAssets, ...techTokenAssets }),
              ];
              return (
                <div key={entry.name} style={{ width: `${getRulebookSize(size).widthMm}mm` }}>
                  <RulebookPageRenderer page={page} settings={{ size, design: 'illustrated' }} />
                </div>
              );
            })
          )
        )
      )}
    </div>
  );
}
