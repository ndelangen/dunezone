import { testingPreview } from '@sb/preview';
import { expect, within } from 'storybook/test';

import { FormattedText, FormattedTextSource } from './FormattedText';

const meta = testingPreview.meta({
  component: FormattedText,
  globals: {
    backgrounds: { value: 'dark', grid: false },
  },
  parameters: { layout: 'padded' },
});

export const StoredSource = meta.story({
  args: { blocks: [] },
  render: () => <FormattedTextSource source={'A *formatted* paragraph.\n\n- First point\n- Second point'} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('formatted').tagName).toBe('STRONG');
    const items = within(canvas.getByRole('list')).getAllByRole('listitem');
    await expect(items.map((item) => item.textContent)).toEqual(['First point', 'Second point']);
  },
});
