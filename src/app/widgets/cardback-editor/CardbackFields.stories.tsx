import preview from '@sb/preview';
import { INITIAL_CARDBACK_PRESETS } from '@shared/assets/cardbackPresets';
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
