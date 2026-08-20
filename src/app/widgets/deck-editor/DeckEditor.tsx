import { Group, NumberInput, Select, Slider, Stack, Text, TextInput } from '@mantine/core';
import type { DeckAsset } from '@shared/assets/schema';
import { TopicIcon } from '@ui/content/TopicIcon';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { assetFaceAspect } from '@app/widgets/asset-face/AssetFace';
import { AssetFace } from '@app/widgets/asset-face/AssetFace';
import { BackgroundPresetControl } from '@app/widgets/background-composer/BackgroundPresetControl';
import {
  assetOptionToPreviewSrc,
  decalAssetOptionToLabel,
  decalAssetOptions,
} from '@app/widgets/faction-editor/factionFormAssetUtils';
import { backgroundPresets } from '@game/data/backgrounds';

import { STOCK_CARDBACKS, stockKeyFor } from './stockCardbacks';
import type { CardbackData } from './stockCardbacks';

/**
 * The size the rail's proof is drawn at before `CanvasScale` fits it to the rail.
 * Any number does.
 * This one matches the detail page, so a proof and the page it previews scale off the same canvas.
 */
const PROOF_CANVAS = 900;

export type DeckDraft = z.infer<typeof DeckAsset>;
export type DeckChapter = 'identity' | 'cards' | 'about';

/** One member of a deck as the editor sees it: the card itself, and how many copies. */
export type DeckMember = { card: { id: string; name: string; type: string; data: unknown }; count: number };

const emblemOptions = decalAssetOptions.map((value) => ({ value, label: decalAssetOptionToLabel(value) }));

const BACK_PRESETS = [
  { key: 'weapon', label: 'Weapon', background: backgroundPresets.weapon },
  { key: 'defense', label: 'Defense', background: backgroundPresets.defense },
  { key: 'special', label: 'Special', background: backgroundPresets.special },
  { key: 'worthless', label: 'Worthless', background: backgroundPresets.worthless },
];

/* A deck without a back does not exist, so a fresh one starts on the first stock option rather than on nothing. */
export const INITIAL_DECK_DRAFT: DeckDraft = {
  name: '',
  about: '',
  cardback: STOCK_CARDBACKS[0]!.cardback,
};

const CUSTOM = 'custom';

/** The cardback at whatever width it is given. This is the face the deck publishes, stock or authored alike. */
function CardbackProof({ cardback, width }: { cardback: CardbackData; width: number }) {
  return <AssetFace type="deck" data={{ cardback }} name={cardback.name} width={width} />;
}

function CardbackFields({ cardback, onChange }: { cardback: CardbackData; onChange: (next: CardbackData) => void }) {
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
        usedOn="this deck's back"
        presets={BACK_PRESETS}
        value={cardback.background}
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

export type DeckWarning = { source: string; missing: string; chapter: DeckChapter };

export function deckDraftWarnings(draft: DeckDraft, members: DeckMember[]): DeckWarning[] {
  const warnings: DeckWarning[] = [];
  if (!draft.cardback.name.trim()) {
    warnings.push({ source: 'Identity', missing: 'a back label', chapter: 'identity' });
  }
  if (members.length === 0) {
    warnings.push({ source: 'Cards', missing: 'any cards', chapter: 'cards' });
  }
  return warnings;
}

/* No padding here: ConnectedTabs' panel shell owns the panel inset. */
const panel = (children: ReactNode) => <Stack gap="lg">{children}</Stack>;

/**
 * The deck workbench.
 *
 * Two chapters, because a deck is only two things: what it is, and what is in it.
 *
 * Membership is not draft state.
 * Each count change writes an `asset_relations` row immediately, the way a token's referenced backside does, because relations do not travel through the asset's `data`.
 */
export function DeckEditor({
  draft,
  patch,
  chapter,
  onChapterChange,
  onSettle,
  members,
  onCountChange,
  cardPicker,
}: {
  draft: DeckDraft;
  patch: (update: Partial<DeckDraft>) => void;
  chapter: DeckChapter;
  onChapterChange: (chapter: DeckChapter) => void;
  onSettle: () => void;
  /** Saved membership, straight from the server. Empty while the deck has never been saved. */
  members: DeckMember[];
  /** Zero removes the card. Null while the deck has no id yet, which disables the steppers. */
  onCountChange: ((cardId: string, count: number) => void) | null;
  cardPicker: ReactNode;
}) {
  const stockKey = stockKeyFor(draft.cardback);
  /*
   * Whether Custom was picked, held here because it cannot be derived.
   * `stockKey` answers "does this composition match a stock one", which is not the same question as
   * "did the author ask to compose their own": a stock composition matches a stock key, so deriving
   * `selected` from it alone made Custom unselectable. The control snapped back and the fields never
   * mounted, so a stock deck or bundle could never become an authored one (#571).
   * `BackgroundPresetControl` already holds the same flag for the same reason.
   */
  const [customChosen, setCustomChosen] = useState(stockKey === null);
  const selected = customChosen || stockKey === null ? CUSTOM : stockKey;
  const totalCards = members.reduce((sum, member) => sum + member.count, 0);

  return (
    <WorkbenchLayout.Workbench onBlurCapture={onSettle}>
      <WorkbenchLayout.Chapters>
        <ConnectedTabs<DeckChapter>
          value={chapter}
          onValueChange={(next) => {
            onChapterChange(next);
            onSettle();
          }}
          ariaLabel="Deck chapters"
          items={[
            {
              value: 'identity',
              label: 'Identity',
              icon: <TopicIcon topic="identity" size={21} />,
              panel: panel(
                <>
                  <ControlBlock
                    title="Name"
                    description="Determines the deck's URL."
                    input={
                      <TextInput
                        aria-label="Name"
                        value={draft.name}
                        onChange={(event) => patch({ name: event.currentTarget.value })}
                      />
                    }
                  />
                  <ControlBlock
                    title="Card back"
                    description="Every deck wears exactly one. The deck publishes its own image either way, so a stock back only supplies the artwork."
                    input={
                      <Select
                        aria-label="Card back"
                        allowDeselect={false}
                        data={[
                          ...STOCK_CARDBACKS.map((stock) => ({ value: stock.key, label: `${stock.label} card back` })),
                          { value: CUSTOM, label: 'Custom…' },
                        ]}
                        value={selected}
                        onChange={(next) => {
                          if (next === CUSTOM) {
                            /* Custom keeps the current composition and simply reveals the creator below. */
                            setCustomChosen(true);
                            return;
                          }
                          const stock = STOCK_CARDBACKS.find((candidate) => candidate.key === next);
                          if (stock) {
                            setCustomChosen(false);
                            patch({ cardback: stock.cardback });
                          }
                        }}
                      />
                    }
                  />
                  {selected === CUSTOM ? (
                    <CardbackFields cardback={draft.cardback} onChange={(cardback) => patch({ cardback })} />
                  ) : null}
                </>
              ),
            },
            {
              value: 'cards',
              label: 'Cards',
              icon: <TopicIcon topic="contents" size={21} />,
              panel: panel(
                <>
                  <ControlBlock
                    title="Composition"
                    description="How many of each card this deck holds, from any community card whoever made it. Duplicates are a count, not repeated rows."
                    tool={cardPicker}
                    input={
                      members.length === 0 ? (
                        <Text size="sm" c="dimmed">
                          No cards yet.
                        </Text>
                      ) : (
                        <Stack gap="xs">
                          {members.map((member) => (
                            <Group key={member.card.id} gap="sm" wrap="nowrap" align="center">
                              <AssetFace
                                type={member.card.type}
                                data={member.card.data}
                                name={member.card.name}
                                width={34}
                              />
                              <Text size="sm" style={{ flex: 1, minWidth: 0 }}>
                                {member.card.name}
                              </Text>
                              <NumberInput
                                aria-label={`Copies of ${member.card.name}`}
                                min={1}
                                max={99}
                                w={90}
                                disabled={onCountChange === null}
                                value={member.count}
                                onChange={(value) => onCountChange?.(member.card.id, Number(value) || 1)}
                              />
                              <IconAction
                                label={`Remove ${member.card.name}`}
                                variant="light"
                                color="red"
                                size="lg"
                                disabled={onCountChange === null}
                                onClick={() => onCountChange?.(member.card.id, 0)}
                                icon={<Trash2 size={17} aria-hidden />}
                              />
                            </Group>
                          ))}
                        </Stack>
                      )
                    }
                  />
                </>
              ),
            },
            aboutChapter(draft.about, (about) => patch({ about })),
          ]}
        />
      </WorkbenchLayout.Chapters>
      <WorkbenchLayout.Rail>
        <Stack gap="md" align="center">
          <CanvasScale canvasWidth={PROOF_CANVAS} canvasHeight={PROOF_CANVAS * assetFaceAspect('deck')}>
            <CardbackProof cardback={draft.cardback} width={PROOF_CANVAS} />
          </CanvasScale>
          <Text size="xs" c="dimmed">
            The deck's publication
          </Text>
          <Text size="sm">
            {totalCards} {totalCards === 1 ? 'card' : 'cards'} across {members.length}{' '}
            {members.length === 1 ? 'title' : 'titles'}
          </Text>
        </Stack>
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}
