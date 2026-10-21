import { Stack, TextInput } from '@mantine/core';
import { LEADERS, LOGO } from '@shared/assetIds';
import type { LeaderTokenAsset } from '@shared/assets/schema';
import { resolveAsset } from '@shared/media/resolveAsset';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { TopicIcon } from '@ui/content/TopicIcon';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { TokenFrame } from '@app/widgets/asset-face/AssetFace';
import type { BackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import { BackgroundPresetControl } from '@app/widgets/background-composer/BackgroundPresetControl';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { backgroundPresets } from '@game/data/backgrounds';

export type LeaderTokenDraft = z.infer<typeof LeaderTokenAsset>;
export type LeaderTokenChapter = 'identity' | 'artwork' | 'background' | 'about';
export type LeaderTokenMemory = { declaredCustom: boolean; backgroundMode: BackgroundModeMemory };
const portraits = stockAssetOptions(LEADERS.options);
const emblems = stockAssetOptions(LOGO.options);
const backgrounds = [
  { key: 'ecaz', label: 'Ecaz', background: backgroundPresets.ecaz },
  { key: 'moritani', label: 'Moritani', background: backgroundPresets.moritani },
];

export function leaderTokenDraftWarnings(draft: LeaderTokenDraft) {
  return draft.name.trim() ? [] : [{ source: 'Identity', missing: 'a name', chapter: 'identity' as const }];
}

/** Pages own the draft and persistence; this edits a standalone face beside its existing leader proof. */
export function LeaderTokenEditor({
  nameField,
  draft,
  patch,
  memory,
  remember,
  chapter,
  onChapterChange,
  onSettle,
}: Readonly<{
  nameField: ReactNode;
  draft: LeaderTokenDraft;
  patch: (update: Partial<LeaderTokenDraft>) => void;
  memory: LeaderTokenMemory;
  remember: (update: Partial<LeaderTokenMemory>) => void;
  chapter: LeaderTokenChapter;
  onChapterChange: (chapter: LeaderTokenChapter) => void;
  onSettle: () => void;
}>) {
  return (
    <WorkbenchLayout.Workbench>
      <WorkbenchLayout.Chapters>
        <div onBlurCapture={onSettle}>
          <ConnectedTabs<LeaderTokenChapter>
            value={chapter}
            onValueChange={(next) => {
              onChapterChange(next);
              onSettle();
            }}
            ariaLabel="Leader token chapters"
            items={[
              {
                value: 'identity',
                label: 'Identity',
                icon: <TopicIcon topic="identity" size={21} />,
                panel: (
                  <Stack gap="md">
                    {nameField}
                    <ControlBlock
                      title="Strength"
                      description="A whole number or one character. Leave blank to omit."
                      input={
                        <TextInput
                          aria-label="Strength"
                          value={draft.strength === undefined ? '' : String(draft.strength)}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            if (!value) {
                              patch({ strength: undefined });
                            } else if (/^-?\d+$/u.test(value)) {
                              patch({ strength: Number.parseInt(value, 10) });
                            } else if (value.length === 1) {
                              patch({ strength: value });
                            }
                          }}
                        />
                      }
                    />
                  </Stack>
                ),
              },
              {
                value: 'artwork',
                label: 'Artwork',
                icon: <TopicIcon topic="face" size={21} />,
                panel: <ArtworkFields draft={draft} patch={patch} />,
              },
              {
                value: 'background',
                label: 'Background',
                icon: <TopicIcon topic="tints" size={21} />,
                panel: (
                  <BackgroundPresetControl
                    title="Background"
                    description="The printed token background."
                    usedOn="this leader token"
                    presets={backgrounds}
                    value={draft.background}
                    onChange={(background) => patch({ background })}
                    declaredCustom={memory.declaredCustom}
                    onDeclaredCustomChange={(declaredCustom) => remember({ declaredCustom })}
                    modeMemory={memory.backgroundMode}
                    onModeMemoryChange={(backgroundMode) => remember({ backgroundMode })}
                  />
                ),
              },
              aboutChapter(draft.about, (about) => patch({ about })),
            ]}
          />
        </div>
      </WorkbenchLayout.Chapters>
      <WorkbenchLayout.Rail>
        <TokenFrame shape="round">
          <LeaderToken {...draft} />
        </TokenFrame>
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}

function ArtworkFields({
  draft,
  patch,
}: Readonly<{
  draft: LeaderTokenDraft;
  patch: (update: Partial<LeaderTokenDraft>) => void;
}>) {
  return (
    <Stack gap="md">
      <ControlBlock
        title="Leader portrait"
        input={
          <AssetSelect
            aria-label="Leader portrait"
            allowDeselect={false}
            data={portraits}
            getPreviewSrc={(image) => resolveAsset(image, 'small')}
            value={draft.image}
            onChange={(image) => {
              const value = LEADERS.safeParse(image);
              if (value.success) {
                patch({ image: value.data });
              }
            }}
          />
        }
      />
      <ControlBlock
        title="Emblem"
        input={
          <AssetSelect
            aria-label="Emblem"
            allowDeselect={false}
            data={emblems}
            getPreviewSrc={(image) => image}
            value={draft.logo}
            onChange={(logo) => {
              const value = LOGO.safeParse(logo);
              if (value.success) {
                patch({ logo: value.data });
              }
            }}
          />
        }
      />
    </Stack>
  );
}
