import { Group, NumberInput, Select, Slider, Stack, Text, TextInput } from '@mantine/core';
import type { DeckAsset } from '@shared/assets/schema';
import { TopicIcon } from '@ui/content/TopicIcon';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { MemberCountInput } from '@ui/control/MemberCountInput';
import { PreviewChoice } from '@ui/control/PreviewChoice';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useRef } from 'react';
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

/**
 * A deck's cardback as the editor holds it: composed here, or worn from another deck.
 *
 * Two members, not the stored union's three.
 * The stored shape also carries a bare untagged composition, transitional until `assets_deck_cardback_wrap_v1` has tagged every row, and the route flattens that at its parse boundary so this file never learns a shape scheduled for deletion.
 *
 * `asset_id` is nullable here and never in storage.
 * Choosing the reference tile necessarily precedes picking the deck, so the draft has to hold a reference that has not chosen its target yet;
 * the save refuses that state rather than writing it.
 */
export type DeckDraftCardback = (CardbackData & { mode: 'custom' }) | { mode: 'reference'; asset_id: string | null };

export type DeckDraft = Omit<z.infer<typeof DeckAsset>, 'cardback'> & { cardback: DeckDraftCardback };
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
  cardback: { mode: 'custom', ...STOCK_CARDBACKS[0]!.cardback },
};

const CUSTOM = 'custom';

/** The composition this draft holds, or null when the cardback is worn from another deck. */
function draftCardbackComposition(cardback: DeckDraftCardback): CardbackData | null {
  if (cardback.mode !== 'custom') {
    return null;
  }
  const { mode: _mode, ...composition } = cardback;
  return composition;
}

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
  const composition = draftCardbackComposition(draft.cardback);
  /* A worn cardback has no label of its own, so asking for one would be a warning it can never satisfy. */
  if (composition && !composition.name.trim()) {
    warnings.push({ source: 'Identity', missing: 'a back label', chapter: 'identity' });
  }
  if (draft.cardback.mode === 'reference' && draft.cardback.asset_id === null) {
    warnings.push({ source: 'Cardback', missing: 'a deck to reference', chapter: 'identity' });
  }
  if (members.length === 0) {
    warnings.push({ source: 'Cards', missing: 'any cards', chapter: 'cards' });
  }
  return warnings;
}

type CardbackTile = 'stock' | 'custom' | 'reference';

/**
 * Which tile is lit, and the one asymmetry in this control worth knowing before reading it.
 *
 * The token editors' tiles are the union's modes, one each.
 * A deck's are not: the stored union has two members, composed and reference, and **stock is not a mode**.
 * A stock back is a composition that happens to equal one of the three stock ones, which `stockKeyFor` decides by value.
 * So Stock and Composed are the same member wearing different tiles, and which of the two is lit cannot be read off the value alone: a freshly composed back that happens to match a stock one still matches.
 * That is what `customChosen` is for and why it cannot be derived, recorded on issue #571.
 */
function tileFor(cardback: DeckDraftCardback, stockKey: string | null, customChosen: boolean): CardbackTile {
  switch (true) {
    case cardback.mode === 'reference':
      return 'reference';
    case customChosen || stockKey === null:
      return 'custom';
    default:
      return 'stock';
  }
}

/**
 * The cardback a chosen tile becomes, or null when the tile changes no value.
 *
 * Composed and Stock are the same union member, so moving between them keeps the composition and only moves the tile;
 * Stock re-lands on its own composition rather than resetting to the first stock look, which would discard the author's choice of which stock back for no reason.
 */
function cardbackForTile(
  tile: CardbackTile,
  current: DeckDraftCardback,
  stockKey: string | null,
  remembered: CardbackData | null
): DeckDraftCardback | null {
  switch (tile) {
    case 'reference':
      return current.mode === 'reference' ? null : { mode: 'reference', asset_id: null };
    case 'stock': {
      if (current.mode === 'custom') {
        return stockKey === null ? { mode: 'custom', ...STOCK_CARDBACKS[0]!.cardback } : null;
      }
      return { mode: 'custom', ...STOCK_CARDBACKS[0]!.cardback };
    }
    case 'custom':
      if (current.mode === 'custom') {
        return null;
      }
      /* Storage is strict and the draft remembers, the same promise the token editors keep: coming
         back from a reference restores the composition the author left, not the first stock look. */
      return { mode: 'custom', ...(remembered ?? STOCK_CARDBACKS[0]!.cardback) };
  }
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
  backPicker,
  backProof,
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
  /** Chooses which deck's cardback this one wears, rendered inside the reference tile. */
  backPicker: ReactNode;
  /** The referenced deck's cardback, drawn on the reference tile and in the rail in place of a composed one. */
  backProof: ReactNode;
}) {
  const composition = draftCardbackComposition(draft.cardback);
  const stockKey = composition ? stockKeyFor(composition) : null;
  /* The composition the author last had, kept across mode flips; the stored union cannot hold it. */
  const composedCardback = useRef<CardbackData | null>(composition);
  /* The stock tile shows the stock look this deck wears; with none chosen yet it stands in with the first. */
  const stockPreview = (STOCK_CARDBACKS.find((stock) => stock.key === stockKey) ?? STOCK_CARDBACKS[0]!).cardback;
  /*
   * Whether Custom was picked, held here because it cannot be derived.
   * `stockKey` answers "does this composition match a stock one", which is not the same question as
   * "did the author ask to compose their own": a stock composition matches a stock key, so deriving
   * `selected` from it alone made Custom unselectable. The control snapped back and the fields never
   * mounted, so a stock deck or bundle could never become an authored one (#571).
   * `BackgroundPresetControl` already holds the same flag for the same reason.
   */
  const [customChosen, setCustomChosen] = useState(stockKey === null);
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
                      <PreviewChoice
                        label="Card back"
                        value={tileFor(draft.cardback, stockKey, customChosen)}
                        aspectRatio={String(1 / assetFaceAspect('deck'))}
                        onChange={(tile) => {
                          setCustomChosen(tile === CUSTOM);
                          /* Captured on the way out, so returning to Composed finds the composition as it was left. */
                          if (composition) {
                            composedCardback.current = composition;
                          }
                          const next = cardbackForTile(tile, draft.cardback, stockKey, composedCardback.current);
                          if (next) {
                            patch({ cardback: next });
                          }
                        }}
                        options={[
                          {
                            value: 'stock',
                            label: 'Stock',
                            /* Always drawable: the stock look this deck wears, or the first standing in. */
                            preview: <CardbackProof cardback={stockPreview} width={PROOF_CANVAS} />,
                            detail: (
                              <Select
                                aria-label="Which stock back"
                                size="xs"
                                allowDeselect={false}
                                data={STOCK_CARDBACKS.map((stock) => ({ value: stock.key, label: stock.label }))}
                                value={stockKey ?? STOCK_CARDBACKS[0]!.key}
                                onChange={(next) => {
                                  const stock = STOCK_CARDBACKS.find((candidate) => candidate.key === next);
                                  if (stock) {
                                    patch({ cardback: { mode: 'custom', ...stock.cardback } });
                                  }
                                }}
                              />
                            ),
                          },
                          {
                            value: CUSTOM,
                            label: 'Composed here',
                            preview: composition ? (
                              <CardbackProof cardback={composition} width={PROOF_CANVAS} />
                            ) : undefined,
                            emptyHint: <Text size="xs">Not composed yet</Text>,
                          },
                          {
                            value: 'reference',
                            label: "Another deck's back",
                            preview: backProof ?? undefined,
                            emptyHint: <Text size="xs">No deck chosen</Text>,
                            detail: backPicker,
                          },
                        ]}
                      />
                    }
                  />
                  {composition && customChosen ? (
                    <CardbackFields
                      cardback={composition}
                      onChange={(next) => patch({ cardback: { mode: 'custom', ...next } })}
                    />
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
                              <MemberCountInput
                                label={`Copies of ${member.card.name}`}
                                min={1}
                                max={99}
                                disabled={onCountChange === null}
                                value={member.count}
                                onCommit={(count) => onCountChange?.(member.card.id, count)}
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
            {composition ? <CardbackProof cardback={composition} width={PROOF_CANVAS} /> : backProof}
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
