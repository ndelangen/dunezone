import { NumberInput, Stack } from '@mantine/core';
import { PLANET } from '@shared/assetIds';
import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import type { HomeworldCardAsset } from '@shared/assets/schema';
import { resolveAsset } from '@shared/media/resolveAsset';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Globe, ScrollText } from 'lucide-react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { HomeworldCard } from '@game/assets/card/Homeworld';
import { card as CARD_SIZE } from '@game/data/sizes';

import styles from './CardEditor.module.css';
import { fixedCardHeadChapter } from './CardHeadChapters';
import { CardIconScaleControl } from './CardIconAdjustments';

export type HomeworldDraft = z.infer<typeof HomeworldCardAsset>;
export type HomeworldChapter = 'head' | 'planet' | 'effects' | 'about';
const planets = stockAssetOptions(PLANET.options);

export function homeworldDraftWarnings(draft: HomeworldDraft) {
  const warnings: { source: string; missing: string; chapter: HomeworldChapter }[] = [];
  if (!draft.name.trim()) {
    warnings.push({ source: 'Head', missing: 'a name', chapter: 'head' });
  }
  for (const [source, text] of [
    ['High reserves', draft.high.text],
    ['Low reserves', draft.low.text],
    ['Occupied', draft.occupied],
  ]) {
    if (!text.trim()) {
      warnings.push({ source: source!, missing: 'effect text', chapter: 'effects' });
    }
  }
  return warnings;
}

/** Pages own the draft and persistence; this edits the Homeworld fields beside the same card proof as Nexus. */
export function HomeworldCardEditor({
  nameField,
  frontStyle,
  draft,
  patch,
  chapter,
  onChapterChange,
  onSettle,
}: Readonly<{
  nameField: ReactNode;
  frontStyle?: CardFrontStyle;
  draft: HomeworldDraft;
  patch: (update: Partial<HomeworldDraft>) => void;
  chapter: HomeworldChapter;
  onChapterChange: (chapter: HomeworldChapter) => void;
  onSettle: () => void;
}>) {
  return (
    <WorkbenchLayout.Workbench>
      <WorkbenchLayout.Chapters>
        <div onBlurCapture={onSettle}>
          <ConnectedTabs<HomeworldChapter>
            value={chapter}
            onValueChange={(next) => {
              onChapterChange(next);
              onSettle();
            }}
            ariaLabel="Homeworld card chapters"
            items={[
              fixedCardHeadChapter(nameField),
              {
                value: 'planet',
                label: 'Planet',
                icon: <Globe size={21} aria-hidden />,
                panel: (
                  <Stack gap="md">
                    <ControlBlock
                      title="Planet illustration"
                      description="Shown in the card head. Any faction can use this homeworld."
                      input={
                        <AssetSelect
                          aria-label="Planet illustration"
                          allowDeselect={false}
                          data={planets}
                          getPreviewSrc={(image) => resolveAsset(image, 'small')}
                          value={draft.icon[1]}
                          onChange={(image) => {
                            const selected = PLANET.safeParse(image);
                            if (selected.success) {
                              patch({ icon: [draft.icon[0], selected.data] });
                            }
                          }}
                        />
                      }
                    />
                    <CardIconScaleControl
                      value={draft}
                      onChange={patch}
                      label="Planet size"
                      description="Resize the whole planet above the frame, including its rings. A size of 1 fits the illustration inside the disc."
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
                    <ControlBlock
                      title="High reserve threshold"
                      description={
                        'The fewest reserve forces for the high-reserve effect.\nFewer forces use the low-reserve effect.'
                      }
                      input={
                        <NumberInput
                          aria-label="High reserve threshold"
                          value={draft.threshold}
                          min={1}
                          max={999}
                          allowDecimal={false}
                          onChange={(threshold) => {
                            if (typeof threshold === 'number') {
                              patch({ threshold });
                            }
                          }}
                        />
                      }
                    />
                    {(['high', 'low'] as const).map((key) => {
                      const label = key === 'high' ? 'High reserves' : 'Low reserves';
                      return (
                        <Stack key={key} gap="sm">
                          <ControlBlock
                            title={label}
                            description="Up to 400 characters and six lines."
                            input={
                              <FormattedTextInput
                                aria-label={label}
                                minRows={3}
                                value={draft[key].text}
                                onChange={(text) => patch({ [key]: { ...draft[key], text } })}
                              />
                            }
                          />
                          <ControlBlock
                            title={`${label} strength`}
                            description={
                              'The battle dial bonus at home.\nNative forces lost to a Lasgun / Shield explosion.'
                            }
                            input={
                              <NumberInput
                                aria-label={`${label} strength`}
                                min={0}
                                max={99}
                                allowDecimal={false}
                                value={draft[key].strength}
                                onChange={(strength) => {
                                  if (typeof strength === 'number') {
                                    patch({ [key]: { ...draft[key], strength } });
                                  }
                                }}
                              />
                            }
                          />
                        </Stack>
                      );
                    })}
                    <ControlBlock
                      title="Occupied"
                      description="The occupier's effect, including any income. Up to 400 characters and six lines."
                      input={
                        <FormattedTextInput
                          aria-label="Occupied"
                          minRows={3}
                          value={draft.occupied}
                          onChange={(occupied) => patch({ occupied })}
                        />
                      }
                    />
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
          <HomeworldCard {...draft} frontStyle={frontStyle} />
        </CanvasScale>
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}
