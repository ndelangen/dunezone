import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { FactList } from './FactList';

const meta = preview.meta({
  component: FactList,
  parameters: { layout: 'padded' },
  args: {
    facts: [
      { label: 'Your seat', value: '1' },
      { label: 'Ruleset', value: 'Dreamrules' },
      { label: 'Seats', value: '6' },
      { label: 'Last turn', value: '10' },
      { label: 'First stop', value: 'Drafting' },
    ],
  },
});

/** The facts in one printed line, wrapping onto a second where the line runs out. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Ruleset').tagName).toBe('DT');
    await expect(canvas.getByText('Dreamrules').tagName).toBe('DD');
  },
});

/** A narrow foot wraps the facts onto more lines. */
export const Narrow = meta.story({ globals: { viewport: { value: 'contentNarrow' } } });
