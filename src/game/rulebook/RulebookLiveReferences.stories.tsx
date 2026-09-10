import preview from '@sb/preview';
import type { RulebookSize } from '@shared/rulebooks/settings';
import { expect, waitFor } from 'storybook/test';

import { liveReferenceBlocks, liveReferencePage } from './RulebookLiveReferences.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

function LiveReferenceStory({ index, size = 'a4' }: Readonly<{ index: number; size?: RulebookSize }>) {
  return (
    <div style={{ width: size === 'tall' ? 'min(22rem, 92vw)' : 'min(42rem, 92vw)' }}>
      <RulebookPageRenderer
        page={liveReferencePage([liveReferenceBlocks()[index]!])}
        settings={{ size, design: 'illustrated' }}
      />
    </div>
  );
}

const meta = preview.meta({
  title: 'Live references',
  component: LiveReferenceStory,
  args: { index: 0, size: 'a4' },
  parameters: { layout: 'centered' },
});

async function expectContainedReferences({ canvasElement }: { canvasElement: HTMLElement }) {
  for (const image of canvasElement.querySelectorAll<HTMLImageElement>('img')) {
    await waitFor(() => expect(image.complete && image.naturalWidth > 0).toBe(true));
  }
  const region = canvasElement.querySelector('[data-rulebook-region]')!.getBoundingClientRect();
  const block = canvasElement.querySelector('[data-rulebook-block-id]')!.getBoundingClientRect();
  expect(block.left).toBeGreaterThanOrEqual(region.left - 1);
  expect(block.right).toBeLessThanOrEqual(region.right + 1);
  expect(block.bottom).toBeLessThanOrEqual(region.bottom + 1);
}

export const ReferencedBoard = meta.story({ args: { index: 0 }, play: expectContainedReferences });
export const IllustratedInventory = meta.story({ args: { index: 1 }, play: expectContainedReferences });
export const UnavailableFactionComponents = meta.story({ args: { index: 2 }, play: expectContainedReferences });
export const TallInventory = meta.story({ args: { index: 1, size: 'tall' }, play: expectContainedReferences });
export const SquareFactionIntroduction = meta.story({
  args: { index: 2, size: 'square' },
  play: expectContainedReferences,
});
