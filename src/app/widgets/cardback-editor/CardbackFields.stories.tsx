import preview from '@sb/preview';
import { INITIAL_CARDBACK_PRESETS } from '@shared/assets/cardbackPresets';
import { GF9_STRONGHOLD_DECK } from '@shared/assets/gf9StrongholdDeck';
import { expect, fn, within } from 'storybook/test';

import { emptyBackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';

import { CardbackFields } from './CardbackFields';
const meta = preview.meta({
  component: CardbackFields,
  args: {
    cardback: INITIAL_CARDBACK_PRESETS[2]!.cardback,
    onChange: fn(),
    declaredCustom: false,
    onDeclaredCustomChange: fn(),
    modeMemory: emptyBackgroundModeMemory(),
    onModeMemoryChange: fn(),
  },
});
export const Traitor = meta.story({});
export const Stronghold = meta.story({
  args: { cardback: GF9_STRONGHOLD_DECK.cardback },
  play: async ({ canvasElement }) => {
    const scale = within(canvasElement).getByRole('slider', { name: 'Emblem scale' });
    await expect(scale).toHaveAttribute('aria-valuenow', '1.3');
    await expect(scale).toHaveAttribute('aria-valuemax', '2');
  },
});
