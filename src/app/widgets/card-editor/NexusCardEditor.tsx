import { Stack, TextInput } from '@mantine/core';
import type { NexusCardAsset } from '@shared/assets/schema';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { ScrollText, Shield } from 'lucide-react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { emptyBackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import type { BackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import { BackgroundPresetControl } from '@app/widgets/background-composer/BackgroundPresetControl';
import { assetOptionToPreviewSrc, decalAssetOptions } from '@app/widgets/faction-editor/factionFormAssetUtils';
import { NexusCard } from '@game/assets/card/Nexus';
import { backgroundPresets } from '@game/data/backgrounds';
import { card as CARD_SIZE } from '@game/data/sizes';

import styles from './CardEditor.module.css';
import { cardHeadAndSymbolChapters, initialCardHeadMemory } from './CardHeadChapters';
import type { CardHeadMemory } from './CardHeadChapters';

export type NexusDraft = z.infer<typeof NexusCardAsset>;
export type NexusMemory = CardHeadMemory & { factionCustom: boolean; factionModeMemory: BackgroundModeMemory };
export type NexusChapter = 'head' | 'icon' | 'faction' | 'effects' | 'about';
export const INITIAL_NEXUS_MEMORY: NexusMemory = {
  ...initialCardHeadMemory(),
  factionCustom: false,
  factionModeMemory: emptyBackgroundModeMemory(),
};
export const INITIAL_NEXUS_DRAFT: NexusDraft = {
  name: '',
  about: '',
  subName: 'Nexus',
  faction: '',
  factionSymbol: { image: '/vector/logo/atreides.svg', background: backgroundPresets.atreides },
  head: backgroundPresets.nexus,
  icon: [backgroundPresets.nexus, '/vector/icon/alliance.svg'],
  betrayal: '',
  cunning: '',
  secretAlly: '',
};

export function nexusDraftWarnings(draft: NexusDraft): { source: string; missing: string; chapter: NexusChapter }[] {
  const warnings: { source: string; missing: string; chapter: NexusChapter }[] = [];
  if (!draft.name.trim()) {
    warnings.push({ source: 'Head', missing: 'a name', chapter: 'head' });
  }
  if (!draft.faction.trim()) {
    warnings.push({ source: 'Effects', missing: 'a faction', chapter: 'faction' });
  }
  for (const [key, label] of [
    ['betrayal', 'Betrayal'],
    ['cunning', 'Cunning'],
    ['secretAlly', 'Secret Ally'],
  ] as const) {
    if (!draft[key].trim()) {
      warnings.push({ source: label, missing: 'effect text', chapter: 'effects' });
    }
  }
  return warnings;
}

/** Pages own the draft and persistence; this workbench edits the constrained Nexus face and shows its proof. */
export function NexusCardEditor({
  nameField,
  draft,
  patch,
  memory,
  remember,
  chapter,
  onChapterChange,
  onSettle,
}: {
  nameField: ReactNode;
  draft: NexusDraft;
  patch: (update: Partial<NexusDraft>) => void;
  memory: NexusMemory;
  remember: (update: Partial<NexusMemory>) => void;
  chapter: NexusChapter;
  onChapterChange: (chapter: NexusChapter) => void;
  onSettle: () => void;
}) {
  return (
    <WorkbenchLayout.Workbench>
      <WorkbenchLayout.Chapters>
        <div onBlurCapture={onSettle}>
          <ConnectedTabs<NexusChapter>
            value={chapter}
            onValueChange={(next) => {
              onChapterChange(next);
              onSettle();
            }}
            ariaLabel="Nexus card chapters"
            items={[
              ...cardHeadAndSymbolChapters({
                draft,
                patch: (update) => patch({ ...update, subName: 'Nexus' }),
                memory,
                remember,
                nameField,
                fixedType: 'Nexus',
                presets: [
                  {
                    key: 'nexus',
                    label: 'Nexus',
                    head: backgroundPresets.nexus,
                    striped: backgroundPresets.nexus,
                  },
                ],
              }),
              {
                value: 'faction',
                label: 'Faction',
                icon: <Shield size={21} aria-hidden />,
                panel: (
                  <Stack gap="md">
                    <ControlBlock
                      title="Faction"
                      description="Names the faction in the three printed conditions."
                      input={
                        <TextInput
                          aria-label="Faction"
                          value={draft.faction}
                          maxLength={40}
                          onChange={(event) => patch({ faction: event.currentTarget.value })}
                        />
                      }
                    />
                    <ControlBlock
                      title="Faction symbol"
                      description="The emblem beside Secret Ally."
                      input={
                        <AssetSelect
                          aria-label="Faction symbol"
                          allowDeselect={false}
                          data={stockAssetOptions(decalAssetOptions)}
                          getPreviewSrc={assetOptionToPreviewSrc}
                          glyphPreviews
                          value={draft.factionSymbol.image}
                          onChange={(image) => {
                            if (image) {
                              patch({
                                factionSymbol: {
                                  ...draft.factionSymbol,
                                  image: image as NexusDraft['factionSymbol']['image'],
                                },
                              });
                            }
                          }}
                        />
                      }
                    />
                    <BackgroundPresetControl
                      title="Faction background"
                      description="The colours behind the faction emblem."
                      usedOn="this card's faction emblem"
                      presets={[
                        ['atreides', 'Atreides'],
                        ['beneGesserit', 'Bene Gesserit'],
                        ['beneTleilaxu', 'Tleilaxu'],
                        ['choam', 'CHOAM'],
                        ['ecaz', 'Ecaz'],
                        ['emperor', 'Emperor'],
                        ['fremen', 'Fremen'],
                        ['guild', 'Spacing Guild'],
                        ['harkonnen', 'Harkonnen'],
                        ['ixian', 'Ixians'],
                        ['moritani', 'Moritani'],
                        ['richese', 'Richese'],
                      ].map(([key, label]) => ({
                        key: key!,
                        label: label!,
                        background: backgroundPresets[key as keyof typeof backgroundPresets],
                      }))}
                      value={draft.factionSymbol.background}
                      onChange={(background) => patch({ factionSymbol: { ...draft.factionSymbol, background } })}
                      declaredCustom={memory.factionCustom}
                      onDeclaredCustomChange={(factionCustom) => remember({ factionCustom })}
                      modeMemory={memory.factionModeMemory}
                      onModeMemoryChange={(factionModeMemory) => remember({ factionModeMemory })}
                    />
                  </Stack>
                ),
              },
              {
                value: 'effects',
                label: 'Effects',
                icon: <ScrollText size={21} aria-hidden />,
                panel: (
                  <Stack gap="md">
                    {(
                      [
                        ['betrayal', 'Betrayal', 'Use when another player plays this faction.'],
                        ['cunning', 'Cunning', 'Use when you play this faction.'],
                        ['secretAlly', 'Secret Ally', 'Use when this faction is absent from the game.'],
                      ] as const
                    ).map(([key, label, description]) => (
                      <ControlBlock
                        key={key}
                        title={label}
                        description={`${description} Up to 400 characters and six lines.`}
                        input={
                          <FormattedTextInput
                            aria-label={label}
                            autosize
                            minRows={3}
                            value={draft[key]}
                            onChange={(text) => patch({ [key]: text })}
                          />
                        }
                      />
                    ))}
                  </Stack>
                ),
              },
              aboutChapter(draft.about, (about) => patch({ about })),
            ]}
          />
        </div>
      </WorkbenchLayout.Chapters>
      <WorkbenchLayout.Rail>
        <CanvasScale
          rounded
          canvasWidth={CARD_SIZE.width}
          canvasHeight={CARD_SIZE.height}
          frameClassName={styles.proofFrame}
        >
          <NexusCard {...draft} />
        </CanvasScale>
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}
