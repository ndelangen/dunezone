import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { Kbd, KeyedText } from './Kbd';

const meta = preview.meta({
  component: Kbd,
  parameters: { layout: 'padded' },
  args: { children: 'Space' },
});

/** One key. */
export const Key = meta.story({});

/** Keys named in braces inside an instruction show as caps; the rest stays prose. */
export const InProse = meta.story({
  render: () => (
    <p>
      <KeyedText>{'Press {Space}, then {←} and {Space} again. {Escape} closes it.'}</KeyedText>
    </p>
  ),
  play: async ({ canvasElement }) => {
    const keys = [...canvasElement.querySelectorAll('kbd')].map((key) => key.textContent);
    await expect(keys).toEqual(['Space', '←', 'Space', 'Escape']);
    await expect(canvasElement.querySelector('p')?.textContent).toBe(
      'Press Space, then ← and Space again. Escape closes it.'
    );
  },
});

/** On the dark table the cap takes the light text colour around it. */
export const OnDark = meta.story({
  render: () => (
    <p
      style={{
        background: '#211d18',
        color: '#f0e8da',
        padding: 16,
        fontSize: '1.15rem',
      }}
    >
      <KeyedText>{'Hold {Alt} over a card to read it.'}</KeyedText>
    </p>
  ),
});
