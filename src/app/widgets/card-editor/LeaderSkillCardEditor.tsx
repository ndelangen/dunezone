import { Alert, Divider, Group, NumberInput, Stack, Text } from '@mantine/core';
import { LEADER_SKILL_HEAD, LEADER_SKILL_SYMBOL } from '@shared/assets/gf9LeaderSkills';
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
import { LeaderSkillCard } from '@game/assets/card/LeaderSkill';
import type { LeaderSkillAsset } from '@game/data/objects';
import { card as CARD_SIZE } from '@game/data/sizes';

import { cardHeadAndSymbolChapters, initialCardHeadMemory } from './CardHeadChapters';
import type { CardHeadMemory } from './CardHeadChapters';
import styles from './LeaderSkillCardEditor.module.css';

/** The page passes the stored card draft and owns every edit. */
export type LeaderSkillDraft = z.infer<typeof LeaderSkillAsset>;

export const INITIAL_LEADER_SKILL_DRAFT: LeaderSkillDraft = {
  name: '',
  about: '',
  subName: 'Leader skill',
  head: LEADER_SKILL_HEAD,
  icon: LEADER_SKILL_SYMBOL,
  decals: [],
  generalText: '',
  battleText: '',
  textSize: 32,
};

/* Artwork is clipped to the illustration window. */
const DECAL_OFFSET_RANGE = [370, 165] as const;

/* The rail proof. */

function FillCard({ draft, onOverflow }: { draft: LeaderSkillDraft; onOverflow: (overflow: boolean) => void }) {
  return (
    <CanvasScale
      rounded
      canvasWidth={CARD_SIZE.width}
      canvasHeight={CARD_SIZE.height}
      frameClassName={styles.proofFrame}
    >
      <LeaderSkillCard {...draft} onOverflow={onOverflow} />
    </CanvasScale>
  );
}

/* The field editors. */

type Patch = (update: Partial<LeaderSkillDraft>) => void;

export type LeaderSkillMemory = CardHeadMemory;
export const INITIAL_LEADER_SKILL_MEMORY: LeaderSkillMemory = initialCardHeadMemory();
type Remember = (update: Partial<LeaderSkillMemory>) => void;

function DecalFields({ draft, patch }: { draft: LeaderSkillDraft; patch: Patch }) {
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
          addDisabled={decals.length >= 16}
          onAdd={() =>
            patch({
              decals: [
                ...decals,
                {
                  id: (decalAssetOptions[0] ?? '') as LeaderSkillDraft['decals'][number]['id'],
                  muted: false,
                  outline: true,
                  scale: 0.75,
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

/* The two abilities stay on either side of the illustration. */
function AbilityFields({ draft, patch }: { draft: LeaderSkillDraft; patch: Patch }) {
  return (
    <Stack gap="md">
      <ControlBlock
        title="General ability"
        description="Applies while the skilled leader is alive and the card is face up."
        input={
          <FormattedTextInput
            aria-label="General ability"
            autosize
            minRows={4}
            value={draft.generalText}
            onChange={(generalText) => patch({ generalText })}
          />
        }
      />
      <ControlBlock
        title="Battle ability"
        description="The card adds the words This leader in battle before this ability."
        input={
          <FormattedTextInput
            aria-label="Battle ability"
            autosize
            minRows={4}
            value={draft.battleText}
            onChange={(battleText) => patch({ battleText })}
          />
        }
      />
      <ControlBlock
        title="Text size"
        description="Keep both abilities within the printed frame."
        input={
          <NumberInput
            aria-label="Text size"
            min={24}
            max={40}
            value={draft.textSize}
            onChange={(value) => {
              if (typeof value === 'number') {
                patch({ textSize: value });
              }
            }}
          />
        }
      />
    </Stack>
  );
}

/* Validation. */

export type LeaderSkillChapter = 'head' | 'icon' | 'decals' | 'abilities' | 'about';

export type LeaderSkillDraftWarning = { source: string; missing: string; chapter: LeaderSkillChapter };

export function leaderSkillDraftWarnings(draft: LeaderSkillDraft): LeaderSkillDraftWarning[] {
  const warnings: LeaderSkillDraftWarning[] = [];
  if (!draft.name.trim()) {
    warnings.push({ source: 'Head', missing: 'a name', chapter: 'head' });
  }
  if (!draft.subName.trim()) {
    warnings.push({ source: 'Head', missing: 'a type', chapter: 'head' });
  }
  if (!draft.generalText.trim()) {
    warnings.push({ source: 'Abilities', missing: 'a general ability', chapter: 'abilities' });
  }
  if (!draft.battleText.trim()) {
    warnings.push({ source: 'Abilities', missing: 'a battle ability', chapter: 'abilities' });
  }
  return warnings;
}

/* The workbench. */

/* No padding here: ConnectedTabs' panel shell owns the panel inset (--connected-tabs-panel-padding). */
const panel = (children: ReactNode) => <Stack gap="lg">{children}</Stack>;

/**
 * The leader skill card workbench both the create and edit pages install identically: chaptered fields on the left, the full-width live card proof on the right.
 * Pages own the draft, its persistence, and the surrounding authoring chrome.
 */
export function LeaderSkillCardEditor({
  nameField,
  draft,
  patch,
  memory,
  remember,
  chapter,
  onChapterChange,
  onSettle,
  onOverflow,
}: {
  draft: LeaderSkillDraft;
  /** The Name field, constructed by the route: checking a name's address is a fetch, and fetching controls are Pickers the routes own. */
  nameField: ReactNode;
  patch: Patch;
  /** The session's memory and its setter, the same value-plus-onChange membrane the draft crosses on. */
  memory: LeaderSkillMemory;
  remember: Remember;
  chapter: LeaderSkillChapter;
  onChapterChange: (chapter: LeaderSkillChapter) => void;
  /** Fired on field blur and chapter switches, the signals that let an emptied warning list close the validation header. */
  onSettle: () => void;
  onOverflow: (overflow: boolean) => void;
}) {
  return (
    <WorkbenchLayout.Workbench>
      <WorkbenchLayout.Chapters>
        {/* Settling on focus leaving the fields is the editors' idiom, not the layout's, so it rides an element this widget owns. */}
        <div onBlurCapture={onSettle}>
          <ConnectedTabs<LeaderSkillChapter>
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
                value: 'abilities',
                label: 'Abilities',
                icon: <ScrollText size={21} aria-hidden />,
                panel: panel(<AbilityFields draft={draft} patch={patch} />),
              },
              aboutChapter(draft.about, (about) => patch({ about })),
            ]}
          />
        </div>
      </WorkbenchLayout.Chapters>
      <WorkbenchLayout.Rail>
        <FillCard draft={draft} onOverflow={onOverflow} />
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}
