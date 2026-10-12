import { Alert, Select, Stack } from '@mantine/core';
import type { StormCardAsset } from '@shared/assets/schema';
import { StormCardAssetInput } from '@shared/assets/schema';
import { standardStormCard } from '@shared/assets/standardStormDeck';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ControlBlock } from '@ui/control/ControlBlock';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Layers3 } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { z } from 'zod';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { BackgroundPresetControl } from '@app/widgets/background-composer/BackgroundPresetControl';
import { StormCard } from '@game/assets/card/Storm';
import { card } from '@game/data/sizes';

import type { CustomCardEditor } from './CustomCardEditor';
import { INITIAL_CUSTOM_CARD_MEMORY } from './CustomCardEditor';
import type { CustomCardChapter } from './CustomCardEditor';
import { CustomCardLayerPanel, CustomCardLayers } from './CustomCardLayers';
import styles from './StormCardEditor.module.css';

export type StormCardDraft = z.infer<typeof StormCardAsset>;
export const INITIAL_STORM_CARD_DRAFT: StormCardDraft = { ...standardStormCard(1), name: '' };
export { INITIAL_CUSTOM_CARD_MEMORY as INITIAL_STORM_CARD_MEMORY };
export type { CustomCardChapter as StormCardChapter, CustomCardMemory as StormCardMemory } from './CustomCardEditor';

type Props = Omit<ComponentProps<typeof CustomCardEditor>, 'draft' | 'patch'> & {
  draft: StormCardDraft;
  patch: (update: Partial<StormCardDraft>) => void;
};
const LAYERS = {
  decal: { label: 'Decal', topic: 'decals' },
  token: { label: 'Token', topic: 'token' },
  text: { label: 'Text', topic: 'text' },
} as const;

/** Callers own the storm draft; this edits its movement and custom layers within the Storm format. */
export function StormCardEditor({
  draft,
  patch,
  memory,
  remember,
  nameField,
  chapter,
  onChapterChange,
  onSettle,
  tokens,
  tokensError,
  tokenPicker,
}: Props) {
  const layersPatch = (update: { layers?: StormCardDraft['layers'] }) => patch(update);
  const validation = StormCardAssetInput.safeParse(draft);
  return (
    <WorkbenchLayout.Workbench>
      <WorkbenchLayout.Chapters>
        <div onBlurCapture={onSettle}>
          {draft.layers.some((layer) => layer.kind === 'token' && tokens[layer.asset_id] === null) ? (
            <Alert title="Linked token unavailable" color="yellow">
              Replace the missing token in its layer tab, or remove the layer.
            </Alert>
          ) : null}
          <ConnectedTabs<CustomCardChapter>
            value={
              chapter.startsWith('layer:') && !draft.layers.some((layer) => `layer:${layer.layerId}` === chapter)
                ? 'layers'
                : chapter
            }
            onValueChange={(next) => {
              onChapterChange(next);
              onSettle();
            }}
            ariaLabel="Storm card chapters"
            items={[
              {
                value: 'head',
                label: 'Storm',
                icon: <TopicIcon topic="storm" size={21} />,
                panel: (
                  <Stack gap="md">
                    <ControlBlock
                      title="Name"
                      description="Names this asset and determines its URL. The printed title follows the movement value."
                      input={nameField}
                    />
                    <ControlBlock
                      title="Movement"
                      description="The storm moves counterclockwise. This value sets the printed title, instruction and corner number."
                      input={
                        <Select
                          aria-label="Storm movement"
                          allowDeselect={false}
                          value={String(draft.sectors)}
                          data={[1, 2, 3, 4, 5, 6].map((value) => ({
                            value: String(value),
                            label: `${value} ${value === 1 ? 'sector' : 'sectors'}`,
                          }))}
                          onChange={(value) => {
                            if (value) {
                              patch({ sectors: Number(value) });
                            }
                          }}
                        />
                      }
                    />
                    <BackgroundPresetControl
                      title="Head background"
                      description="Colour and texture behind the movement title."
                      usedOn="this storm card's head"
                      presets={[{ key: 'storm', label: 'Storm', background: standardStormCard(1).head }]}
                      value={draft.head}
                      declaredCustom={memory.headCustom}
                      onDeclaredCustomChange={(headCustom) => remember({ headCustom })}
                      modeMemory={memory.headModeMemory}
                      onModeMemoryChange={(headModeMemory) => remember({ headModeMemory })}
                      onChange={(head) => patch({ head })}
                    />
                    <BackgroundPresetControl
                      title="Symbol background"
                      description="Colour and texture behind the fixed storm symbol."
                      usedOn="this storm card's symbol"
                      presets={[{ key: 'storm', label: 'Storm', background: standardStormCard(1).icon[0] }]}
                      value={draft.icon[0]}
                      declaredCustom={memory.iconCustom}
                      onDeclaredCustomChange={(iconCustom) => remember({ iconCustom })}
                      modeMemory={memory.iconModeMemory}
                      onModeMemoryChange={(iconModeMemory) => remember({ iconModeMemory })}
                      onChange={(background) => patch({ icon: [background, '/vector/icon/storm_disc.svg'] })}
                    />
                  </Stack>
                ),
              },
              {
                value: 'layers',
                label: 'Layers',
                icon: <Layers3 size={21} aria-hidden />,
                panel: (
                  <CustomCardLayers
                    tokenPicker={tokenPicker}
                    draft={draft}
                    patch={layersPatch}
                    onChapterChange={onChapterChange}
                  />
                ),
              },
              ...draft.layers.map((layer, index) => ({
                value: `layer:${layer.layerId}` as CustomCardChapter,
                label: `${index + 1}. ${LAYERS[layer.kind].label}`,
                icon: <TopicIcon topic={LAYERS[layer.kind].topic} size={21} />,
                panel: (
                  <CustomCardLayerPanel
                    tokens={tokens}
                    tokenPicker={tokenPicker}
                    draft={draft}
                    patch={layersPatch}
                    index={index}
                    onChapterChange={onChapterChange}
                  />
                ),
              })),
              aboutChapter(draft.about, (about) => patch({ about })),
            ]}
          />
          {tokensError || !validation.success ? (
            <Alert title="Card needs attention" color="red">
              {tokensError ?? (!validation.success ? validation.error.issues[0]?.message : '')}
            </Alert>
          ) : null}
        </div>
      </WorkbenchLayout.Chapters>
      <WorkbenchLayout.Rail>
        <CanvasScale rounded canvasWidth={card.width} canvasHeight={card.height} frameClassName={styles.proofFrame}>
          <StormCard {...draft} tokens={tokens} />
        </CanvasScale>
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}
