import { Stack } from '@mantine/core';
import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import { LEADER_SKILL_HEAD, LEADER_SKILL_SYMBOL } from '@shared/assets/gf9LeaderSkills';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { ScrollText } from 'lucide-react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { LeaderSkillCard } from '@game/assets/card/LeaderSkill';
import type { LeaderSkillAsset } from '@game/data/objects';
import { card as CARD_SIZE } from '@game/data/sizes';

import { cardDecalChapter } from './CardDecalChapter';
import { fixedCardHeadChapter, initialCardHeadMemory } from './CardHeadChapters';
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
  textSize: 36,
};

/* Artwork is clipped to the illustration window. */
const DECAL_OFFSET_RANGE = [370, 210] as const;

/* The rail proof. */

function FillCard({
  frontStyle,
  draft,
  onOverflow,
}: Readonly<{ frontStyle?: CardFrontStyle; draft: LeaderSkillDraft; onOverflow: (overflow: boolean) => void }>) {
  return (
    <CanvasScale
      rounded
      canvasWidth={CARD_SIZE.width}
      canvasHeight={CARD_SIZE.height}
      frameClassName={styles.proofFrame}
    >
      <LeaderSkillCard {...draft} frontStyle={frontStyle} onOverflow={onOverflow} />
    </CanvasScale>
  );
}

/* The field editors. */

type Patch = (update: Partial<LeaderSkillDraft>) => void;

export type LeaderSkillMemory = CardHeadMemory;
export const INITIAL_LEADER_SKILL_MEMORY: LeaderSkillMemory = initialCardHeadMemory();
type Remember = (update: Partial<LeaderSkillMemory>) => void;

/* The two abilities stay on either side of the illustration. */
function AbilityFields({
  draft,
  patch,
}: Readonly<{ frontStyle?: CardFrontStyle; draft: LeaderSkillDraft; patch: Patch }>) {
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
  frontStyle,
  nameField,
  draft,
  patch,
  chapter,
  onChapterChange,
  onSettle,
  onOverflow,
}: Readonly<{
  frontStyle?: CardFrontStyle;
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
}>) {
  return (
    <WorkbenchLayout.Workbench>
      <WorkbenchLayout.Chapters>
        {/* Settling on focus leaving the fields is the editors' idiom, not the layout's, so it rides an element this widget owns. */}
        <div onBlurCapture={onSettle}>
          <ConnectedTabs<LeaderSkillChapter>
            value={chapter === 'icon' ? 'head' : chapter}
            onValueChange={(next) => {
              onChapterChange(next);
              onSettle();
            }}
            ariaLabel="Card chapters"
            items={[
              fixedCardHeadChapter(nameField, 'Leader skill'),
              cardDecalChapter({
                decals: draft.decals,
                onChange: (decals) => patch({ decals }),
                offsetRange: DECAL_OFFSET_RANGE,
                defaultScale: 1,
                maximum: 16,
              }),
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
        <FillCard draft={draft} frontStyle={frontStyle} onOverflow={onOverflow} />
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}
