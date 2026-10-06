import { Stack, TextInput } from '@mantine/core';
import type { Treachery } from '@shared/assets/schema';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { TopicIcon } from '@ui/content/TopicIcon';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { emptyBackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import type { BackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import { BackgroundPresetControl } from '@app/widgets/background-composer/BackgroundPresetControl';
import { hasWorkToLose, sameBackground } from '@app/widgets/background-composer/presetChoice';
import { assetOptionToPreviewSrc, decalAssetOptions } from '@app/widgets/faction-editor/factionFormAssetUtils';
import { backgroundPresets } from '@game/data/backgrounds';

import { CardIconAdjustments } from './CardIconAdjustments';

type CardHeadDraft = Pick<
  z.infer<typeof Treachery>,
  'name' | 'subName' | 'head' | 'icon' | 'iconScale' | 'iconOffset' | 'iconInvert' | 'iconOpacity'
>;
export type CardHeadMemory = {
  headCustom: boolean;
  iconCustom: boolean;
  headModeMemory: BackgroundModeMemory;
  iconModeMemory: BackgroundModeMemory;
};
export function initialCardHeadMemory(): CardHeadMemory {
  return {
    headCustom: false,
    iconCustom: false,
    headModeMemory: emptyBackgroundModeMemory(),
    iconModeMemory: emptyBackgroundModeMemory(),
  };
}
type Patch = (update: Partial<CardHeadDraft>) => void;
type RememberHead = (update: Partial<CardHeadMemory>) => void;
const iconOptions = stockAssetOptions(decalAssetOptions);
/* The four stock treachery looks: a head Background paired with its striped icon Background. */
const CARD_PRESETS = [
  { key: 'weapon', label: 'Weapon', head: backgroundPresets.weapon, striped: backgroundPresets.stripedWeapon },
  { key: 'defense', label: 'Defense', head: backgroundPresets.defense, striped: backgroundPresets.stripedDefense },
  { key: 'special', label: 'Special', head: backgroundPresets.special, striped: backgroundPresets.stripedSpecial },
  {
    key: 'worthless',
    label: 'Worthless',
    head: backgroundPresets.worthless,
    striped: backgroundPresets.stripedWorthless,
  },
] as const;

const HEAD_PRESETS = CARD_PRESETS.map(({ key, label, head }) => ({ key, label, background: head }));
const ICON_BACKGROUND_PRESETS = CARD_PRESETS.map(({ key, label, striped }) => ({ key, label, background: striped }));

/* The card's head: its name, type, and the Background behind them. */
function HeadFields({
  draft,
  patch,
  memory,
  remember,
  nameField,
}: {
  draft: CardHeadDraft;
  patch: Patch;
  memory: CardHeadMemory;
  remember: RememberHead;
  nameField: ReactNode;
}) {
  return (
    <Stack gap="md">
      <ControlBlock
        title="Name"
        description="Names the card and determines its URL. Long titles resize to fit."
        input={nameField}
      />
      <ControlBlock
        title="Type"
        description="Shown under the name, for example Weapon - Projectile."
        input={
          <TextInput
            aria-label="Type"
            value={draft.subName}
            onChange={(event) => patch({ subName: event.currentTarget.value })}
          />
        }
      />
      <BackgroundPresetControl
        title="Head background"
        description="The background behind the card's name. The icon's stripes follow it, unless you have composed your own."
        usedOn="this card's head"
        presets={HEAD_PRESETS}
        value={draft.head}
        declaredCustom={memory.headCustom}
        onDeclaredCustomChange={(headCustom) => remember({ headCustom })}
        modeMemory={memory.headModeMemory}
        onModeMemoryChange={(headModeMemory) => remember({ headModeMemory })}
        onChange={(head, presetKey) => {
          patch({ head, ...matchingStripes(presetKey, draft, memory) });
        }}
      />
    </Stack>
  );
}

/** Stock symbol stripes follow the Head until the creator composes a symbol background of their own. */
function matchingStripes(
  presetKey: string | null,
  draft: CardHeadDraft,
  memory: CardHeadMemory
): Pick<CardHeadDraft, 'icon'> | undefined {
  const preset = CARD_PRESETS.find((candidate) => candidate.key === presetKey);
  if (!preset) {
    return undefined;
  }
  const wornHead = CARD_PRESETS.find((candidate) => sameBackground(candidate.head, draft.head));
  const iconIsStillItsStripes = wornHead ? sameBackground(wornHead.striped, draft.icon[0]) : false;
  const lose = hasWorkToLose({ stillWearsExpected: iconIsStillItsStripes, declaredCustom: memory.iconCustom });
  return lose ? undefined : { icon: [preset.striped, draft.icon[1]] };
}

/* The card's icon: the vector in the top-right disc, its Background, and its scale. */
function IconFields({
  draft,
  patch,
  memory,
  remember,
}: {
  draft: CardHeadDraft;
  patch: Patch;
  memory: CardHeadMemory;
  remember: RememberHead;
}) {
  const icon = draft.icon;
  return (
    <Stack gap="md">
      <ControlBlock
        title="Icon"
        description="The vector in the top-right disc."
        input={
          <AssetSelect
            aria-label="Icon"
            allowDeselect={false}
            data={iconOptions}
            getPreviewSrc={assetOptionToPreviewSrc}
            glyphPreviews
            value={icon[1]}
            onChange={(value) => {
              if (value) {
                patch({ icon: [icon[0], value as NonNullable<CardHeadDraft['icon']>[1]] });
              }
            }}
          />
        }
      />
      <BackgroundPresetControl
        title="Icon background"
        description="The background behind the icon, independent of the head background."
        usedOn="this card's icon"
        presets={ICON_BACKGROUND_PRESETS}
        value={icon[0]}
        declaredCustom={memory.iconCustom}
        onDeclaredCustomChange={(iconCustom) => remember({ iconCustom })}
        modeMemory={memory.iconModeMemory}
        onModeMemoryChange={(iconModeMemory) => remember({ iconModeMemory })}
        onChange={(background) => patch({ icon: [background, icon[1]] })}
      />
      <CardIconAdjustments value={draft} onChange={patch} />
    </Stack>
  );
}

/** Callers own the card and background memory; both editors install the same Head and Symbol tabs. */
export function cardHeadAndSymbolChapters({
  draft,
  patch,
  memory,
  remember,
  nameField,
}: {
  draft: CardHeadDraft;
  patch: Patch;
  memory: CardHeadMemory;
  remember: RememberHead;
  nameField: ReactNode;
}) {
  return [
    {
      value: 'head' as const,
      label: 'Head',
      icon: <TopicIcon topic="head" size={21} />,
      panel: <HeadFields draft={draft} patch={patch} memory={memory} remember={remember} nameField={nameField} />,
    },
    {
      value: 'icon' as const,
      label: 'Symbol',
      icon: <TopicIcon topic="symbol" size={21} />,
      panel: (
        <Stack gap="lg">
          <IconFields draft={draft} patch={patch} memory={memory} remember={remember} />
        </Stack>
      ),
    },
  ];
}
