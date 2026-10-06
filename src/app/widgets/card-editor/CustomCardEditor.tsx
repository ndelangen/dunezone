import { Alert, Stack } from '@mantine/core';
import { CustomCardAssetInput } from '@shared/assets/schema';
import type { CustomCardTokens } from '@shared/assets/schema';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ControlBlock } from '@ui/control/ControlBlock';
import { PreviewChoice } from '@ui/control/PreviewChoice';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Layers3, LayoutTemplate } from 'lucide-react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { CustomCard } from '@game/assets/card/Custom';
import { card } from '@game/data/sizes';

import { cardHeadAndSymbolChapters, initialCardHeadMemory } from './CardHeadChapters';
import type { CardHeadMemory } from './CardHeadChapters';
import styles from './CustomCardEditor.module.css';
import type { CardTokenPicker } from './CustomCardLayers';
import { CustomCardLayerPanel, CustomCardLayers } from './CustomCardLayers';
import type { CustomCardDraft } from './customCardPresets';
import { CustomCardStartingPreset } from './CustomCardStartingPreset';

export type { CustomCardDraft } from './customCardPresets';
export { INITIAL_CUSTOM_CARD_DRAFT } from './customCardPresets';
export type CustomCardChapter = 'head' | 'icon' | 'format' | 'layers' | 'about' | `layer:${string}`;
export type CustomCardMemory = CardHeadMemory;
export const INITIAL_CUSTOM_CARD_MEMORY: CustomCardMemory = initialCardHeadMemory();

type Patch = (update: Partial<CustomCardDraft>) => void;

function CardProof({ draft, tokens }: { draft: CustomCardDraft; tokens: z.infer<typeof CustomCardTokens> }) {
  return (
    <CanvasScale rounded canvasWidth={card.width} canvasHeight={card.height} frameClassName={styles.proofFrame}>
      <CustomCard {...draft} tokens={tokens} />
    </CanvasScale>
  );
}

function CardFormat({
  draft,
  tokens,
  patch,
}: {
  draft: CustomCardDraft;
  tokens: z.infer<typeof CustomCardTokens>;
  patch: Patch;
}) {
  return (
    <Stack gap="lg">
      <ControlBlock
        title="Format"
        description="Changing the frame keeps every layer where you placed it."
        input={
          <PreviewChoice
            label="Card format"
            value={draft.format}
            onChange={(format) => patch({ format })}
            aspectRatio={String(card.width / card.height)}
            options={(['decal-window', 'plain'] as const).map((format) => ({
              value: format,
              label: format === 'plain' ? 'Plain' : 'With decal window',
              preview: <CustomCard {...draft} format={format} tokens={tokens} />,
              canvas: { width: card.width, height: card.height },
            }))}
          />
        }
      />
      <ControlBlock
        title="Starting preset"
        description="An editable starting layout. Every layer can be changed afterward."
        input={<CustomCardStartingPreset draft={draft} patch={patch} />}
      />
    </Stack>
  );
}

export function customCardDraftWarnings(
  draft: CustomCardDraft
): { source: string; missing: string; chapter: CustomCardChapter }[] {
  return draft.layers.length ? [] : [{ source: 'Layers', missing: 'any decal, text or token', chapter: 'layers' }];
}

/** Callers own the card and session memory; this owns the authoring controls and live proof. */
export function CustomCardEditor({
  nameField,
  draft,
  patch,
  memory,
  remember,
  chapter,
  onChapterChange,
  onSettle,
  tokens,
  tokensError,
  tokenPicker,
}: {
  tokens: z.infer<typeof CustomCardTokens>;
  tokensError?: string | null;
  tokenPicker: CardTokenPicker;
  nameField: ReactNode;
  draft: CustomCardDraft;
  patch: Patch;
  memory: CustomCardMemory;
  remember: (update: Partial<CustomCardMemory>) => void;
  chapter: CustomCardChapter;
  onChapterChange: (chapter: CustomCardChapter) => void;
  onSettle: () => void;
}) {
  const missingTokens = draft.layers.some((layer) => layer.kind === 'token' && tokens[layer.asset_id] === null);
  const validated = CustomCardAssetInput.shape.layers.safeParse(draft.layers);
  return (
    <WorkbenchLayout.Workbench>
      <WorkbenchLayout.Chapters>
        <div onBlurCapture={onSettle}>
          {tokensError ? (
            <Alert title="Linked tokens need attention" color="red">
              {tokensError}
            </Alert>
          ) : null}
          {missingTokens ? (
            <Alert title="Linked token unavailable" color="yellow">
              A linked token has been deleted or cannot be read. Replace it in its layer tab, or remove the layer.
            </Alert>
          ) : null}
          {!validated.success ? (
            <Alert title="Layers need attention" color="red">
              {validated.error.issues[0]?.message}
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
            ariaLabel="Custom card chapters"
            items={[
              ...cardHeadAndSymbolChapters({ draft, patch, memory, remember, nameField }),
              {
                value: 'format',
                label: 'Format',
                icon: <LayoutTemplate size={21} aria-hidden />,
                panel: <CardFormat draft={draft} tokens={tokens} patch={patch} />,
              },
              {
                value: 'layers',
                label: 'Layers',
                icon: <Layers3 size={21} aria-hidden />,
                panel: (
                  <CustomCardLayers
                    tokenPicker={tokenPicker}
                    draft={draft}
                    patch={patch}
                    onChapterChange={onChapterChange}
                  />
                ),
              },
              ...draft.layers.map((layer, index) => ({
                value: `layer:${layer.layerId}` as CustomCardChapter,
                label: `${index + 1}. ${layer.kind === 'decal' ? 'Decal' : layer.kind === 'token' ? 'Token' : 'Text'}`,
                icon:
                  layer.kind === 'decal' ? (
                    <TopicIcon topic="decals" size={21} />
                  ) : layer.kind === 'token' ? (
                    <TopicIcon topic="token" size={21} />
                  ) : (
                    <TopicIcon topic="text" size={21} />
                  ),
                panel: (
                  <CustomCardLayerPanel
                    tokens={tokens}
                    tokenPicker={tokenPicker}
                    draft={draft}
                    patch={patch}
                    index={index}
                    onChapterChange={onChapterChange}
                  />
                ),
              })),
              aboutChapter(draft.about, (about) => patch({ about })),
            ]}
          />
        </div>
      </WorkbenchLayout.Chapters>
      <WorkbenchLayout.Rail>
        <CardProof draft={draft} tokens={tokens} />
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}
