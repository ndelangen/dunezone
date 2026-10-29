import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { GameName } from './GameName';

const meta = preview.meta({
  component: GameName,
  parameters: { layout: 'padded' },
  args: { children: 'Caladan wedding traitor' },
});

/** A settled name, in the display face. */
export const Default = meta.story({});

/** A name still waiting to be settled shows faded. */
export const Pending = meta.story({
  args: { pending: true },
  play: async ({ canvasElement }) => {
    await expect(
      Number(getComputedStyle(within(canvasElement).getByText('Caladan wedding traitor')).opacity)
    ).toBeLessThan(1);
  },
});

/** A long name wraps in balanced lines, breaking a long word only where it must. */
export const LongName = meta.story({
  args: { children: 'The Giedi Prime lost invitation to the Landsraad wedding of the century' },
  globals: { viewport: { value: 'contentNarrow' } },
});
