import type { RulebookSize } from '@shared/rulebooks/settings';
import { expect, waitFor } from 'storybook/test';

import { liveReferenceBlocks, liveReferencePage } from './RulebookLiveReferences.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

export function LiveReferenceStory({ index, size = 'a4' }: Readonly<{ index: number; size?: RulebookSize }>) {
  return (
    <div style={{ width: size === 'tall' ? 'min(22rem, 92vw)' : 'min(42rem, 92vw)' }}>
      <RulebookPageRenderer
        page={liveReferencePage([liveReferenceBlocks()[index]!])}
        settings={{ size, design: 'illustrated' }}
      />
    </div>
  );
}

export async function expectContainedReferences({ canvasElement }: { canvasElement: HTMLElement }) {
  for (const image of canvasElement.querySelectorAll<HTMLImageElement>('img')) {
    await waitFor(() => expect(image.complete && image.naturalWidth > 0).toBe(true));
  }
  const region = canvasElement.querySelector('[data-rulebook-region]')!.getBoundingClientRect();
  const block = canvasElement.querySelector('[data-rulebook-block-id]')!.getBoundingClientRect();
  expect(block.left).toBeGreaterThanOrEqual(region.left - 1);
  expect(block.right).toBeLessThanOrEqual(region.right + 1);
  expect(block.bottom).toBeLessThanOrEqual(region.bottom + 1);
}

export function IllustrationStory({ size = 'a4' }: { size?: RulebookSize }) {
  return <LiveReferenceStory index={0} size={size} />;
}
export function InventoryStory({ size = 'a4' }: { size?: RulebookSize }) {
  return <LiveReferenceStory index={1} size={size} />;
}
