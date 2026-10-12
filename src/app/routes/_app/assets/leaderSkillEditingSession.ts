import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { INITIAL_LEADER_SKILL_MEMORY } from '@app/widgets/card-editor/LeaderSkillCardEditor';
import type { LeaderSkillDraft, LeaderSkillMemory } from '@app/widgets/card-editor/LeaderSkillCardEditor';
import { LeaderSkillAssetInput } from '@game/data/objects';

export type LeaderSkillState = { data: LeaderSkillDraft; memory: LeaderSkillMemory; baseline: LeaderSkillDraft };
export type LeaderSkillEvent =
  | { kind: 'patch'; update: Partial<LeaderSkillDraft> }
  | { kind: 'remember'; update: Partial<LeaderSkillMemory> }
  | { kind: 'replace'; data: LeaderSkillDraft }
  | { kind: 'saved'; data: LeaderSkillDraft };

export function openingLeaderSkillState(data: LeaderSkillDraft, baseline: LeaderSkillDraft): LeaderSkillState {
  return { data, memory: INITIAL_LEADER_SKILL_MEMORY, baseline };
}

/** Pure draft transitions shared by the two routes; each route owns its reducer and actions. */
export function reduceLeaderSkill(state: LeaderSkillState, event: LeaderSkillEvent): LeaderSkillState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'remember':
      return { ...state, memory: { ...state.memory, ...event.update } };
    /* Reset reconstructs memory while retaining the saved baseline. */
    case 'replace':
      return openingLeaderSkillState(event.data, state.baseline);
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

/** Stored data alone decides dirty state, validation and the payload; memory is never posted. */
export function leaderSkillDraftStatus(state: LeaderSkillState, overflow: boolean) {
  const validation = LeaderSkillAssetInput.safeParse(state.data);
  let invalid = validation.success ? undefined : validation.error.issues[0]?.message;
  if (overflow) {
    invalid = 'The abilities extend beyond the card. Shorten them.';
  }
  return {
    invalid,
    isDirty: JSON.stringify(state.data) !== JSON.stringify(state.baseline),
    payload: validation.success && !overflow ? postedPayload(LeaderSkillAssetInput, state.data) : null,
  };
}
