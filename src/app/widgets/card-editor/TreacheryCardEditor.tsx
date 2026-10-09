import { Alert, Divider, Group, Stack, Text } from '@mantine/core';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { ScrollText } from 'lucide-react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { DecalControls } from '@app/widgets/decal-editor/DecalControls';
import { decalAssetOptions } from '@app/widgets/faction-editor/factionFormAssetUtils';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { backgroundPresets } from '@game/data/backgrounds';
import type { TreacheryAsset } from '@game/data/objects';
import { card as CARD_SIZE } from '@game/data/sizes';

import styles from './CardEditor.module.css';
import { cardHeadAndSymbolChapters, initialCardHeadMemory } from './CardHeadChapters';
import type { CardHeadMemory } from './CardHeadChapters';

/* The draft model. */
/* The draft IS the stored shape: the same TreacheryAsset zod validates on save (server-side
   in assets.create/update) and drives the renderer live. Wider than the renderer's own `Treachery` props by
   exactly one field, About, which is the field that never reaches the face. */

export type TreacheryDraft = z.infer<typeof TreacheryAsset>;

export const INITIAL_TREACHERY_DRAFT: TreacheryDraft = {
  name: '',
  about: '',
  subName: '',
  head: backgroundPresets.weapon,
  icon: [backgroundPresets.stripedWeapon, '/vector/icon/projectile.svg'],
  decals: [],
  text: '',
};

/* Center-to-edge slider span: the treachery card is 900 × 1263 in card space. */
const DECAL_OFFSET_RANGE = [450, 630] as const;

/* The rail proof. */

function FillCard({ draft }: { draft: TreacheryDraft }) {
  return (
    <CanvasScale
      rounded
      canvasWidth={CARD_SIZE.width}
      canvasHeight={CARD_SIZE.height}
      frameClassName={styles.proofFrame}
    >
      <TreacheryCard {...draft} />
    </CanvasScale>
  );
}

/* The field editors. */

type Patch = (update: Partial<TreacheryDraft>) => void;

export type TreacheryMemory = CardHeadMemory;
export const INITIAL_TREACHERY_MEMORY: TreacheryMemory = initialCardHeadMemory();
type Remember = (update: Partial<TreacheryMemory>) => void;

function DecalFields({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  const decals = draft.decals;
  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text fw={700} size="sm">
          Decals
        </Text>
        <ListLengthActions
          addLabel="Add decal"
          removeLabel="Remove last decal"
          removeDisabled={decals.length === 0}
          onAdd={() =>
            patch({
              decals: [
                ...decals,
                {
                  id: (decalAssetOptions[0] ?? '') as TreacheryDraft['decals'][number]['id'],
                  muted: false,
                  outline: true,
                  scale: 1,
                  offset: [0, 0],
                },
              ],
            })
          }
          onRemove={() => patch({ decals: decals.slice(0, -1) })}
        />
      </Group>
      {decals.length === 0 ? (
        <Alert color="gray" variant="light" title="No decals">
          Decals are optional. The card remains valid without them.
        </Alert>
      ) : null}
      {decals.map((decal, index) => (
        <Stack key={index} gap="sm">
          {index > 0 ? <Divider /> : null}
          <Text size="sm" fw={600}>
            Decal {index + 1}
          </Text>
          <DecalControls
            value={decal}
            onChange={(next) => patch({ decals: decals.map((current, i) => (i === index ? next : current)) })}
            label={`decal ${index + 1}`}
            offsetRange={DECAL_OFFSET_RANGE}
          />
        </Stack>
      ))}
    </Stack>
  );
}

/* The card's body: the text under the art band. */
function BodyField({ draft, patch }: { draft: TreacheryDraft; patch: Patch }) {
  return (
    <ControlBlock
      title="Body"
      description="Line breaks become paragraphs on the card."
      input={
        <FormattedTextInput
          aria-label="Body"
          autosize
          minRows={4}
          value={draft.text}
          onChange={(text) => patch({ text })}
        />
      }
    />
  );
}

/* Validation. */

export type TreacheryChapter = 'head' | 'icon' | 'decals' | 'body' | 'about';

export type TreacheryDraftWarning = { source: string; missing: string; chapter: TreacheryChapter };

export function treacheryDraftWarnings(draft: TreacheryDraft): TreacheryDraftWarning[] {
  const warnings: TreacheryDraftWarning[] = [];
  if (!draft.name.trim()) {
    warnings.push({ source: 'Head', missing: 'a name', chapter: 'head' });
  }
  if (!draft.subName.trim()) {
    warnings.push({ source: 'Head', missing: 'a type', chapter: 'head' });
  }
  if (!draft.text.trim()) {
    warnings.push({ source: 'Body', missing: 'body text', chapter: 'body' });
  }
  return warnings;
}

/* The workbench. */

/* No padding here: ConnectedTabs' panel shell owns the panel inset (--connected-tabs-panel-padding). */
const panel = (children: ReactNode) => <Stack gap="lg">{children}</Stack>;

/**
 * The treachery card workbench both the create and edit pages install identically: chaptered fields on the left, the full-width live card proof on the right.
 * Pages own the draft, its persistence, and the surrounding authoring chrome.
 */
export function TreacheryCardEditor({
  nameField,
  draft,
  patch,
  memory,
  remember,
  chapter,
  onChapterChange,
  onSettle,
}: {
  draft: TreacheryDraft;
  /** The Name field, constructed by the route: checking a name's address is a fetch, and fetching controls are Pickers the routes own. */
  nameField: ReactNode;
  patch: Patch;
  /** The session's memory and its setter, the same value-plus-onChange membrane the draft crosses on. */
  memory: TreacheryMemory;
  remember: Remember;
  chapter: TreacheryChapter;
  onChapterChange: (chapter: TreacheryChapter) => void;
  /** Fired on field blur and chapter switches, the signals that let an emptied warning list close the validation header. */
  onSettle: () => void;
}) {
  return (
    <WorkbenchLayout.Workbench>
      <WorkbenchLayout.Chapters>
        {/* Settling on focus leaving the fields is the editors' idiom, not the layout's, so it rides an element this widget owns. */}
        <div onBlurCapture={onSettle}>
          <ConnectedTabs<TreacheryChapter>
            value={chapter}
            onValueChange={(next) => {
              onChapterChange(next);
              onSettle();
            }}
            ariaLabel="Card chapters"
            items={[
              ...cardHeadAndSymbolChapters({ draft, patch, memory, remember, nameField }),
              {
                value: 'decals',
                label: 'Decals',
                icon: <TopicIcon topic="decals" size={21} />,
                panel: panel(<DecalFields draft={draft} patch={patch} />),
              },
              {
                value: 'body',
                label: 'Body',
                icon: <ScrollText size={21} aria-hidden />,
                panel: panel(<BodyField draft={draft} patch={patch} />),
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
