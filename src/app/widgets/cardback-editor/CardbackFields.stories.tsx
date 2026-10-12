import preview from '@sb/preview';
import { INITIAL_CARDBACK_PRESETS } from '@shared/assets/cardbackPresets';
import { GF9_STRONGHOLD_DECK } from '@shared/assets/gf9StrongholdDeck';
import { expect, fn, userEvent, within } from 'storybook/test';

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
export const EmblemBackground = meta.story({
  args: {
    cardback: { ...INITIAL_CARDBACK_PRESETS[2]!.cardback, emblemBackground: { color: '#4466aa', intensity: 0.35 } },
    onChange: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Emblem background shade' })).toHaveValue('#4466aa');
    const intensity = canvas.getByRole('slider', { name: 'Emblem background intensity' });
    await expect(intensity).toHaveAttribute('aria-valuenow', '0.35');
    intensity.focus();
    await userEvent.keyboard('{End}');
    await expect(args.onChange).toHaveBeenLastCalledWith({
      ...args.cardback,
      emblemBackground: { color: '#4466aa', intensity: 1 },
    });
  },
});
export const Stronghold = meta.story({
  args: { cardback: GF9_STRONGHOLD_DECK.cardback },
  play: async ({ canvasElement }) => {
    const scale = within(canvasElement).getByRole('slider', { name: 'Emblem scale' });
    await expect(scale).toHaveAttribute('aria-valuenow', '1.3');
    await expect(scale).toHaveAttribute('aria-valuemax', '2');
  },
});

export const LegacyLabelWeight = meta.story({
  args: { cardback: { ...GF9_STRONGHOLD_DECK.cardback, nameFont: 'C_Busorama_Bold' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('combobox', { name: 'Label weight' })).toBeNull();
    await expect(canvas.getByRole('textbox', { name: 'Label' })).toHaveValue('Stronghold');
  },
});
