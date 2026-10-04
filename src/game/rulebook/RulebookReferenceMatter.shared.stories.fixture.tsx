import type { RulebookSize } from '@shared/rulebooks/settings';
import { expect } from 'storybook/test';

import { creditsFixture, referenceMatterPage, referenceTableFixture } from './RulebookReferenceMatter.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

export function ReferenceMatterStory({
  treatment = 'table',
  size = 'a4',
}: Readonly<{ treatment?: 'table' | 'credits' | 'both' | 'empty'; size?: RulebookSize }>) {
  let blocks: Parameters<typeof referenceMatterPage>[0];
  if (treatment === 'table') {
    blocks = [referenceTableFixture()];
  } else if (treatment === 'credits') {
    blocks = [creditsFixture()];
  } else if (treatment === 'both') {
    blocks = [referenceTableFixture(), creditsFixture()];
  } else {
    blocks = [
      { ...referenceTableFixture(), columnOrder: [], columnsById: {}, rowOrder: [], rowsById: {}, note: '' },
      { ...creditsFixture(), groupOrder: [], groupsById: {} },
    ];
  }
  return (
    <div style={{ width: size === 'tall' ? 'min(24rem, 92vw)' : 'min(44rem, 92vw)' }}>
      <RulebookPageRenderer page={referenceMatterPage(blocks)} settings={{ size, design: 'illustrated' }} />
    </div>
  );
}

export async function expectContained({ canvasElement }: { canvasElement: HTMLElement }) {
  await document.fonts.ready;
  const region = canvasElement.querySelector('[data-rulebook-region]')!.getBoundingClientRect();
  for (const block of canvasElement.querySelectorAll('[data-rulebook-block-id]')) {
    const bounds = block.getBoundingClientRect();
    expect(bounds.left).toBeGreaterThanOrEqual(region.left - 1);
    expect(bounds.right).toBeLessThanOrEqual(region.right + 1);
    expect(bounds.bottom).toBeLessThanOrEqual(region.bottom + 1);
  }
}

export /* A whole word in a header or first-column cell paints on one line: a column never shrinks below its longest word. */
function expectWholeWords(canvasElement: HTMLElement) {
  const cells = canvasElement.querySelectorAll('th, tbody tr > td:first-child');
  expect(cells.length).toBeGreaterThan(0);
  for (const cell of cells) {
    const text = cell.querySelector('strong') ?? cell;
    const words = (text.textContent ?? '').split(' ').filter(Boolean);
    for (const word of words) {
      const start = (text.textContent ?? '').indexOf(word);
      const range = document.createRange();
      const node = text.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) {
        continue;
      }
      range.setStart(node, start);
      range.setEnd(node, start + word.length);
      expect(range.getClientRects().length, `${word} paints on one line`).toBe(1);
    }
  }
}

export function TableStory({ size = 'a4' }: { size?: RulebookSize }) {
  return <ReferenceMatterStory treatment="table" size={size} />;
}
export function CreditsStory({ size = 'a4' }: { size?: RulebookSize }) {
  return <ReferenceMatterStory treatment="credits" size={size} />;
}
