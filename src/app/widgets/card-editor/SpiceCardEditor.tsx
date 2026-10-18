import { MultiSelect, NumberInput, Stack, TextInput } from '@mantine/core';
import type { Board } from '@shared/boards/schema';
import { territoryId } from '@shared/boards/schema';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { TopicIcon } from '@ui/content/TopicIcon';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Coins, Map as MapIcon, Palette, ScrollText } from 'lucide-react';
import { useEffect, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { assetOptionToPreviewSrc, vectorDecalAssetOptions } from '@app/widgets/faction-editor/factionFormAssetUtils';
import { SpiceCard } from '@game/assets/card/Spice';
import { spiceIconSrc, standardSpiceText } from '@game/assets/card/spiceText';
import { Spice } from '@game/data/objects';
import type { SpiceAsset } from '@game/data/objects';
import { card as CARD_SIZE } from '@game/data/sizes';

import styles from './CardEditor.module.css';
import { SpiceLookFields, SpiceMapFields, SpiceTokenFields } from './SpiceBoardFields';
import type { AssetPick, SpiceBoardRead, SpiceLookPreview, SpiceMapFocus } from './SpiceBoardFields';

/*
 * The draft IS the stored shape: the same SpiceAsset zod validates on save and drives the renderer live.
 * `overlays` has no control here, so a stored card that carries some keeps them through every save untouched.
 */
export type SpiceDraft = z.infer<typeof SpiceAsset>;

type SpiceIcon = SpiceDraft['icon'];
type SpiceHighlight = SpiceDraft['highlights'][number];

export const INITIAL_SPICE_DRAFT: SpiceDraft = {
  name: '',
  about: '',
  subName: 'Spice blow',
  icon: 'spice',
  highlights: [],
  amount: 6,
};

const iconOptions = stockAssetOptions(vectorDecalAssetOptions);

/* The three whole regions highlight a group of territories at once, so they are offered apart from the single territories. */
const REGIONS: readonly SpiceHighlight[] = ['sand', 'rock', 'strongholds'];

/* Names the slug alone cannot spell. Everything else reads as its slug in title case. */
const HIGHLIGHT_LABELS: Partial<Record<SpiceHighlight, string>> = {
  sand: 'All sand',
  rock: 'All rock',
  strongholds: 'All strongholds',
  tueks: "Tuek's Sietch",
  tabr: 'Sietch Tabr',
  polar: 'Polar Sink',
  habbanya: 'Habbanya Sietch',
};

function highlightLabel(highlight: SpiceHighlight): string {
  return (
    HIGHLIGHT_LABELS[highlight] ??
    highlight
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

const HIGHLIGHTS = Spice.shape.highlights.element.options;

const HIGHLIGHT_OPTIONS = [
  {
    group: 'Regions',
    items: REGIONS.map((value) => ({ value, label: highlightLabel(value) })),
  },
  {
    group: 'Territories',
    items: HIGHLIGHTS.filter((value) => !REGIONS.includes(value))
      .map((value) => ({ value, label: highlightLabel(value) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  },
];

type Patch = (update: Partial<SpiceDraft>) => void;

/**
 * The draft's link with one tint's territory added or taken away: what the proof's brush asks for.
 * A tint carried over from a classic card's region names territory types;
 * painting by hand spells those out as the board's territories first, so the brush can take any of them away.
 */
function paintTerritory(
  link: NonNullable<SpiceDraft['board']>,
  board: Board | undefined,
  tintId: string,
  territory: string
) {
  return {
    ...link,
    tints: link.tints.map((tint) => {
      if (tint.id !== tintId) {
        return tint;
      }
      const types = new Set<string>(tint.types ?? []);
      const covered = [
        ...new Set([
          ...tint.territories,
          ...(board && types.size
            ? Object.values(board.properties)
                .filter((property) => types.has(property.type))
                .map((property) => territoryId(property.name))
            : []),
        ]),
      ];
      const { types: _types, ...rest } = tint;
      return {
        ...(board ? rest : tint),
        territories: covered.includes(territory) ? covered.filter((id) => id !== territory) : [...covered, territory],
      };
    }),
  };
}

/* The rail proof, at the renderer's own 900 by 1263. On a saved board it is also where tints are painted and tokens dragged. */
function FillCard({
  draft,
  patch,
  read,
  focus,
  placing,
}: {
  draft: SpiceDraft;
  patch: Patch;
  read: SpiceBoardRead;
  focus: SpiceMapFocus;
  /** On the Tokens chapter the proof drags tokens; elsewhere they stay put. */
  placing: boolean;
}) {
  const link = draft.board;
  const brush = focus.brush;
  return (
    <CanvasScale
      rounded
      canvasWidth={CARD_SIZE.width}
      canvasHeight={CARD_SIZE.height}
      frameClassName={styles.proofFrame}
    >
      <SpiceCard
        {...draft}
        boardDefinition={read?.board}
        boardTokens={read?.tokens}
        mapEditing={
          link
            ? {
                onTerritory: brush
                  ? (territory) => patch({ board: paintTerritory(link, read?.board ?? undefined, brush, territory) })
                  : undefined,
                onTokenMove: placing
                  ? (layerId, x, y) =>
                      patch({
                        board: {
                          ...link,
                          tokens: link.tokens.map((token) => (token.layerId === layerId ? { ...token, x, y } : token)),
                        },
                      })
                  : undefined,
                selectedToken: placing ? focus.token : null,
                onSelectToken: focus.setToken,
              }
            : undefined
        }
      />
    </CanvasScale>
  );
}

/* The card's identity: its name, its type line, and the icon in the top-right disc. */
function IdentityFields({ draft, patch, nameField }: { draft: SpiceDraft; patch: Patch; nameField: ReactNode }) {
  return (
    <Stack gap="md">
      <ControlBlock title="Name" description="Names the card and determines its URL." input={nameField} />
      <ControlBlock
        title="Type"
        description="Shown under the name, e.g. “Spice blow”."
        input={
          <TextInput
            aria-label="Type"
            value={draft.subName}
            onChange={(event) => patch({ subName: event.currentTarget.value })}
          />
        }
      />
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
            value={spiceIconSrc(draft.icon)}
            onChange={(value) => {
              if (value) {
                patch({ icon: value as SpiceIcon });
              }
            }}
          />
        }
      />
    </Stack>
  );
}

/* The territories the classic map highlights. */
function ClassicHighlights({ draft, patch }: { draft: SpiceDraft; patch: Patch }) {
  return (
    <ControlBlock
      title="Highlighted territories"
      description="Outlined on the card's map. A region highlights every territory in it."
      input={
        <MultiSelect
          aria-label="Highlighted territories"
          searchable
          data={HIGHLIGHT_OPTIONS}
          value={draft.highlights}
          onChange={(values) => patch({ highlights: values as SpiceHighlight[] })}
        />
      }
    />
  );
}

/* A card adds a whole number of spice, at least one. */
function isAmount(value: number | string): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

/* The card's body: the amount in the corner and the text above it. */
function BodyFields({ draft, patch }: { draft: SpiceDraft; patch: Patch }) {
  /* An amount left empty or below one is not kept, so leaving the field remounts it on the amount the card still holds. */
  const [amountField, resetAmountField] = useReducer((count: number) => count + 1, 0);
  return (
    <Stack gap="md">
      <ControlBlock
        title="Amount"
        description="The spice this card adds, shown in its corner."
        input={
          <NumberInput
            key={amountField}
            aria-label="Amount"
            min={1}
            step={1}
            allowDecimal={false}
            allowNegative={false}
            value={draft.amount}
            onChange={(value) => {
              if (isAmount(value)) {
                patch({ amount: value });
              }
            }}
            onBlur={resetAmountField}
          />
        }
      />
      <ControlBlock
        title="Body"
        description="The card's text. It starts as the standard sentence for its name and amount, and follows them until you edit it; an emptied body prints that sentence again."
        input={
          <FormattedTextInput
            aria-label="Body"
            autosize
            minRows={3}
            value={spiceDraftText(draft)}
            onChange={(text) => patch({ text })}
          />
        }
      />
    </Stack>
  );
}

/**
 * The Body field's text: the card's own once the author has typed, even emptied, or until then the standard sentence for its icon, amount and name.
 * An emptied body still prints that sentence on the card.
 */
const spiceDraftText = (draft: SpiceDraft) => draft.text ?? standardSpiceText(draft);

/* Validation. */

export type SpiceChapter = 'identity' | 'map' | 'look' | 'tokens' | 'body' | 'about';

export type SpiceDraftWarning = { source: string; missing: string; chapter: SpiceChapter };

export function spiceDraftWarnings(draft: SpiceDraft): SpiceDraftWarning[] {
  const warnings: SpiceDraftWarning[] = [];
  if (!draft.name.trim()) {
    warnings.push({ source: 'Identity', missing: 'a name', chapter: 'identity' });
  }
  if (!draft.subName.trim()) {
    warnings.push({ source: 'Identity', missing: 'a type', chapter: 'identity' });
  }
  if (!draft.board && draft.highlights.length === 0) {
    warnings.push({ source: 'Map', missing: 'a highlighted territory', chapter: 'map' });
  }
  return warnings;
}

/* No padding here: ConnectedTabs' panel shell owns the panel inset (--connected-tabs-panel-padding). */
const panel = (children: ReactNode) => <Stack gap="lg">{children}</Stack>;

/**
 * The spice card workbench both the create and edit pages install identically: chaptered fields on the left, the full-width live card proof on the right.
 * Pages own the draft, its persistence, and the surrounding authoring chrome.
 */
export function SpiceCardEditor({
  nameField,
  draft,
  patch,
  chapter,
  onChapterChange,
  onSettle,
  boardRead,
  boardPicker,
  tokenPicker,
}: {
  draft: SpiceDraft;
  /** The linked board and token fronts, read by the route while the draft links a board. */
  boardRead?: SpiceBoardRead;
  /** Pickers for a board and a token asset; fetching controls are Pickers the routes own. */
  boardPicker: AssetPick;
  tokenPicker: AssetPick;
  /** The Name field, constructed by the route: checking a name's address is a fetch, and fetching controls are Pickers the routes own. */
  nameField: ReactNode;
  patch: Patch;
  chapter: SpiceChapter;
  onChapterChange: (chapter: SpiceChapter) => void;
  /** Fired on field blur and chapter switches, the signals that let an emptied warning list close the validation header. */
  onSettle: () => void;
}) {
  const [brush, setBrush] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const focus: SpiceMapFocus = { brush, setBrush, token, setToken };
  /* The brush is for the Map chapter and a tint that still exists; Escape puts it down. */
  const brushing = chapter === 'map' && !!draft.board?.tints.some((tint) => tint.id === brush) && !!boardRead?.board;
  useEffect(() => {
    if (!brushing) {
      return;
    }
    const stop = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBrush(null);
      }
    };
    window.addEventListener('keydown', stop);
    return () => window.removeEventListener('keydown', stop);
  }, [brushing]);
  const proofFocus: SpiceMapFocus = { ...focus, brush: brushing ? brush : null };
  const link = draft.board;
  const lookPreview: SpiceLookPreview = {
    canvas: CARD_SIZE,
    render: (look) => (
      <SpiceCard
        {...draft}
        board={link && { ...link, look }}
        boardDefinition={boardRead?.board}
        boardTokens={boardRead?.tokens}
      />
    ),
  };
  /* A card back on the classic map has no Look or Tokens chapter, so one left open on them falls back to the Map. */
  const shown = !link && (chapter === 'look' || chapter === 'tokens') ? 'map' : chapter;
  return (
    <WorkbenchLayout.Workbench>
      <WorkbenchLayout.Chapters>
        {/* Settling on focus leaving the fields is the editors' idiom, not the layout's, so it rides an element this widget owns. */}
        <div onBlurCapture={onSettle}>
          <ConnectedTabs<SpiceChapter>
            value={shown}
            onValueChange={(next) => {
              onChapterChange(next);
              onSettle();
            }}
            ariaLabel="Card chapters"
            items={[
              {
                value: 'identity',
                label: 'Identity',
                icon: <TopicIcon topic="head" size={21} />,
                panel: panel(<IdentityFields draft={draft} patch={patch} nameField={nameField} />),
              },
              {
                value: 'map',
                label: 'Map',
                icon: <MapIcon size={21} aria-hidden />,
                panel: panel(
                  <SpiceMapFields
                    draft={draft}
                    onLink={(board) => patch({ board })}
                    read={boardRead}
                    focus={proofFocus}
                    boardPicker={boardPicker}
                    classic={<ClassicHighlights draft={draft} patch={patch} />}
                  />
                ),
              },
              ...(link
                ? [
                    {
                      value: 'look' as const,
                      label: 'Look',
                      icon: <Palette size={21} aria-hidden />,
                      panel: panel(
                        <SpiceLookFields link={link} onLink={(board) => patch({ board })} preview={lookPreview} />
                      ),
                    },
                    {
                      value: 'tokens' as const,
                      label: 'Tokens',
                      icon: <Coins size={21} aria-hidden />,
                      panel: panel(
                        <SpiceTokenFields
                          link={link}
                          onLink={(board) => patch({ board })}
                          read={boardRead}
                          focus={proofFocus}
                          tokenPicker={tokenPicker}
                        />
                      ),
                    },
                  ]
                : []),
              {
                value: 'body',
                label: 'Body',
                icon: <ScrollText size={21} aria-hidden />,
                panel: panel(<BodyFields draft={draft} patch={patch} />),
              },
              aboutChapter(draft.about, (about) => patch({ about })),
            ]}
          />
        </div>
      </WorkbenchLayout.Chapters>
      <WorkbenchLayout.Rail>
        <FillCard draft={draft} patch={patch} read={boardRead} focus={proofFocus} placing={shown === 'tokens'} />
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}
