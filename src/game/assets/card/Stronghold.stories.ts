import preview from '@sb/preview';
import { GF9_STRONGHOLD_CARDS } from '@shared/assets/gf9StrongholdDeck';
import { expect, within } from 'storybook/test';

import { StrongholdCard } from './Stronghold';
import { checkBody } from './Stronghold.stories.fixture';

const meta = preview.meta({
  component: StrongholdCard,
  globals: { viewport: { value: 'card' } },
  args: GF9_STRONGHOLD_CARDS[0],
});

export const Arrakeen = meta.story({ args: GF9_STRONGHOLD_CARDS[0], play: checkBody });

export const FixedTypography = meta.story({
  args: { textSize: 24 },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement).getByText(args.text, { exact: true }).closest('div');
    await expect(body).toHaveStyle({ fontSize: '40px' });
    await checkBody({ canvasElement, args });
  },
});
