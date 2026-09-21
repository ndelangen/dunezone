import preview from '@sb/preview';
import { INITIAL_CARDBACK_PRESETS } from '@shared/assets/cardbackPresets';
import { fn } from 'storybook/test';

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
