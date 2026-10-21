import { LeaderTokenAssetInput } from '@shared/assets/schema';

import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { emptyBackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import type { LeaderTokenDraft, LeaderTokenMemory } from '@app/widgets/token-editor/LeaderTokenEditor';

type State = { data: LeaderTokenDraft; baseline: LeaderTokenDraft; memory: LeaderTokenMemory };
type Event =
  | { kind: 'patch'; update: Partial<LeaderTokenDraft> }
  | { kind: 'remember'; update: Partial<LeaderTokenMemory> }
  | { kind: 'replace'; data: LeaderTokenDraft }
  | { kind: 'saved'; data: LeaderTokenDraft };

export function openingLeaderTokenState(data: LeaderTokenDraft, baseline: LeaderTokenDraft): State {
  return { data, baseline, memory: { declaredCustom: false, backgroundMode: emptyBackgroundModeMemory() } };
}

export function reduceLeaderTokenDraft(state: State, event: Event): State {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'remember':
      return { ...state, memory: { ...state.memory, ...event.update } };
    case 'replace':
      return openingLeaderTokenState(event.data, state.baseline);
    case 'saved':
      return { ...state, data: event.data, baseline: event.data };
  }
}

export function leaderTokenDraftStatus(state: State) {
  const result = LeaderTokenAssetInput.safeParse(state.data);
  return {
    isDirty: JSON.stringify(state.data) !== JSON.stringify(state.baseline),
    invalid: result.success ? undefined : result.error.issues[0]?.message,
    payload: result.success ? postedPayload(LeaderTokenAssetInput, state.data) : null,
  };
}
