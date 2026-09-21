import { NumberInput, Slider, TextInput } from '@mantine/core';
import type { CardBack } from '@shared/assets/schema';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import type { z } from 'zod';

import type { BackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import { BackgroundPresetControl } from '@app/widgets/background-composer/BackgroundPresetControl';
import {
  assetOptionToPreviewSrc,
  decalAssetOptionToLabel,
  decalAssetOptions,
} from '@app/widgets/faction-editor/factionFormAssetUtils';
import { backgroundPresets } from '@game/data/backgrounds';

type CardbackData = z.infer<typeof CardBack>;
const emblemOptions = decalAssetOptions.map((value) => ({ value, label: decalAssetOptionToLabel(value) }));
const BACK_PRESETS = [
  { key: 'weapon', label: 'Weapon', background: backgroundPresets.weapon },
  { key: 'defense', label: 'Defense', background: backgroundPresets.defense },
  { key: 'special', label: 'Special', background: backgroundPresets.special },
  { key: 'worthless', label: 'Worthless', background: backgroundPresets.worthless },
];

export function CardbackFields({
  cardback,
  onChange,
  declaredCustom,
  onDeclaredCustomChange,
  modeMemory,
  onModeMemoryChange,
}: {
  cardback: CardbackData;
  onChange: (next: CardbackData) => void;
  declaredCustom: boolean;
  onDeclaredCustomChange: (next: boolean) => void;
  modeMemory: BackgroundModeMemory;
  onModeMemoryChange: (memory: BackgroundModeMemory) => void;
}) {
  return (
    <>
      <ControlBlock
        title="Label"
        description="The word printed across the back."
        input={
          <TextInput
            aria-label="Label"
            value={cardback.name}
            onChange={(event) => onChange({ ...cardback, name: event.currentTarget.value })}
          />
        }
      />
      <BackgroundPresetControl
        title="Background"
        description="Behind the emblem."
        usedOn="this card back"
        presets={BACK_PRESETS}
        value={cardback.background}
        declaredCustom={declaredCustom}
        onDeclaredCustomChange={onDeclaredCustomChange}
        modeMemory={modeMemory}
        onModeMemoryChange={onModeMemoryChange}
        onChange={(background) => onChange({ ...cardback, background })}
      />
      <ControlBlock
        title="Emblem"
        description="The vector at the centre of the back."
        input={
          <AssetSelect
            aria-label="Emblem"
            allowDeselect={false}
            limit={30}
            data={emblemOptions}
            getPreviewSrc={assetOptionToPreviewSrc}
            glyphPreviews
            value={cardback.image}
            onChange={(next) => {
              if (next) {
                onChange({ ...cardback, image: next as CardbackData['image'] });
              }
            }}
          />
        }
      />
      <ControlBlock
        title="Emblem scale"
        input={
          <Slider
            aria-label="Emblem scale"
            min={0}
            max={1}
            step={0.01}
            label={(value) => value.toFixed(2)}
            value={cardback.imageScale}
            onChange={(imageScale) => onChange({ ...cardback, imageScale })}
          />
        }
      />
      <ControlBlock
        title="Emblem offset"
        description="Vertical nudge, in card space."
        input={
          <NumberInput
            aria-label="Emblem offset"
            value={cardback.imageOffset[1]}
            onChange={(value) => onChange({ ...cardback, imageOffset: [cardback.imageOffset[0], Number(value) || 0] })}
          />
        }
      />
    </>
  );
}
