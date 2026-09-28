import { MultiSelect, NumberInput, SegmentedControl, Stack, TextInput } from '@mantine/core';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Map as MapIcon, ScrollText } from 'lucide-react';
import { useReducer } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { SpiceCard } from '@game/assets/card/Spice';
import { Spice } from '@game/data/objects';
import type { SpiceAsset } from '@game/data/objects';
import { card as CARD_SIZE } from '@game/data/sizes';

import styles from './CardEditor.module.css';

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

const ICON_OPTIONS: { value: SpiceIcon; label: string }[] = [
  { value: 'spice', label: 'Spice blow' },
  { value: 'spice-mine', label: 'Spice mine' },
];

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

/* The rail proof, at the renderer's own 900 by 1263. */
function FillCard({ draft }: { draft: SpiceDraft }) {
  return (
    <CanvasScale
      rounded
      canvasWidth={CARD_SIZE.width}
      canvasHeight={CARD_SIZE.height}
      frameClassName={styles.proofFrame}
    >
      <SpiceCard {...draft} />
    </CanvasScale>
  );
}

/* The card's head: its name, its type line, and the icon in the top-right disc. */
function HeadFields({ draft, patch, nameField }: { draft: SpiceDraft; patch: Patch; nameField: ReactNode }) {
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
          <SegmentedControl
            aria-label="Icon"
            data={ICON_OPTIONS}
            value={draft.icon}
            onChange={(value) => patch({ icon: value as SpiceIcon })}
          />
        }
      />
    </Stack>
  );
}

/* The territories the card's map highlights. */
function MapFields({ draft, patch }: { draft: SpiceDraft; patch: Patch }) {
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
        description="Leave it empty to print the standard sentence built from the name and the amount."
        input={
          <FormattedTextInput
            aria-label="Body"
            autosize
            minRows={3}
            value={draft.text ?? ''}
            onChange={(text) => patch({ text: text || undefined })}
          />
        }
      />
    </Stack>
  );
}

/* Validation. */

export type SpiceChapter = 'head' | 'map' | 'body' | 'about';

export type SpiceDraftWarning = { source: string; missing: string; chapter: SpiceChapter };

export function spiceDraftWarnings(draft: SpiceDraft): SpiceDraftWarning[] {
  const warnings: SpiceDraftWarning[] = [];
  if (!draft.name.trim()) {
    warnings.push({ source: 'Head', missing: 'a name', chapter: 'head' });
  }
  if (!draft.subName.trim()) {
    warnings.push({ source: 'Head', missing: 'a type', chapter: 'head' });
  }
  if (draft.highlights.length === 0) {
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
}: {
  draft: SpiceDraft;
  /** The Name field, constructed by the route: checking a name's address is a fetch, and fetching controls are Pickers the routes own. */
  nameField: ReactNode;
  patch: Patch;
  chapter: SpiceChapter;
  onChapterChange: (chapter: SpiceChapter) => void;
  /** Fired on field blur and chapter switches, the signals that let an emptied warning list close the validation header. */
  onSettle: () => void;
}) {
  return (
    <WorkbenchLayout.Workbench>
      <WorkbenchLayout.Chapters>
        {/* Settling on focus leaving the fields is the editors' idiom, not the layout's, so it rides an element this widget owns. */}
        <div onBlurCapture={onSettle}>
          <ConnectedTabs<SpiceChapter>
            value={chapter}
            onValueChange={(next) => {
              onChapterChange(next);
              onSettle();
            }}
            ariaLabel="Card chapters"
            items={[
              {
                value: 'head',
                label: 'Head',
                icon: <TopicIcon topic="text" size={21} />,
                panel: panel(<HeadFields draft={draft} patch={patch} nameField={nameField} />),
              },
              {
                value: 'map',
                label: 'Map',
                icon: <MapIcon size={21} aria-hidden />,
                panel: panel(<MapFields draft={draft} patch={patch} />),
              },
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
        <FillCard draft={draft} />
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}
