import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { createCataloguePage } from './RulebookCatalogue.stories.fixture';
import { ReferenceMatterStory, expectContained } from './RulebookReferenceMatter.shared.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

const meta = preview.meta({
  title: 'Page/Composition/Rendered',
  component: ReferenceMatterStory,
  args: { treatment: 'table', size: 'a4' },
  parameters: { layout: 'centered' },
});

export const TableAndCredits = meta.story({ args: { treatment: 'both' }, play: expectContained });

export const EmptyBlocks = meta.story({
  args: { treatment: 'empty', size: 'square' },
  play: async (context) => {
    await expectContained(context);
    expect(context.canvasElement.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(2);
    expect(context.canvasElement.querySelector('th')).toBeNull();
    expect(context.canvasElement.querySelector('[data-rulebook-block-id="CRED"] h3')).toBeNull();
  },
});

export const WrittenRules = meta.story({
  render: () => (
    <div style={{ width: 'min(46rem, 100%)' }}>
      <RulebookPageRenderer page={createCataloguePage('two-columns', { written: true })} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    expect(canvasElement.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(7);
    expect(canvasElement.querySelector('ol > li strong')?.textContent).toBe('Choose a group');
    expect(canvasElement.querySelector('[data-faction-id="atreides"]')?.textContent).toBe('Shipment and movement');
    expect(canvasElement.querySelectorAll('blockquote')).toHaveLength(1);
    for (const region of canvasElement.querySelectorAll<HTMLElement>('[data-rulebook-region]')) {
      expect(region.scrollHeight).toBeLessThanOrEqual(region.clientHeight + 1);
    }
  },
});
