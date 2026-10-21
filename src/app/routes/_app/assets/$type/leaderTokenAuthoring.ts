import { LeaderTokenAssetInput } from '@shared/assets/schema';
import { useReducer, useState } from 'react';

import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { emptyBackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import { leaderTokenDraftWarnings } from '@app/widgets/token-editor/LeaderTokenEditor';
import type {
  LeaderTokenChapter,
  LeaderTokenDraft,
  LeaderTokenMemory,
} from '@app/widgets/token-editor/LeaderTokenEditor';

type State = { data: LeaderTokenDraft; baseline: LeaderTokenDraft; memory: LeaderTokenMemory };
type Event =
  | { kind: 'patch'; update: Partial<LeaderTokenDraft> }
  | { kind: 'remember'; update: Partial<LeaderTokenMemory> }
  | { kind: 'replace'; data: LeaderTokenDraft }
  | { kind: 'saved'; data: LeaderTokenDraft };

function openingLeaderTokenState(data: LeaderTokenDraft, baseline: LeaderTokenDraft): State {
  return { data, baseline, memory: { declaredCustom: false, backgroundMode: emptyBackgroundModeMemory() } };
}

function reduceLeaderTokenDraft(state: State, event: Event): State {
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

function leaderTokenDraftStatus(state: State) {
  const result = LeaderTokenAssetInput.safeParse(state.data);
  return {
    isDirty: JSON.stringify(state.data) !== JSON.stringify(state.baseline),
    invalid: result.success ? undefined : result.error.issues[0]?.message,
    payload: result.success ? postedPayload(LeaderTokenAssetInput, state.data) : null,
  };
}

/** The two leader routes own this draft session; the native save remains a caller-supplied action. */
export function useLeaderTokenAuthoring(
  initialDraft: LeaderTokenDraft,
  savePayload: (data: object, onSaved: () => void) => void
) {
  const [chapter, setChapter] = useState<LeaderTokenChapter>('identity');
  const [state, dispatch] = useReducer(reduceLeaderTokenDraft, undefined, () =>
    openingLeaderTokenState(initialDraft, initialDraft)
  );
  const patch = (update: Partial<LeaderTokenDraft>) => dispatch({ kind: 'patch', update });
  const header = useEditPageHeader({
    warnings: leaderTokenDraftWarnings(state.data),
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const { isDirty, invalid, payload } = leaderTokenDraftStatus(state);
  const save = () => {
    if (payload) {
      savePayload(payload, () => dispatch({ kind: 'saved', data: payload }));
    }
  };
  return { state, dispatch, patch, header, chapter, setChapter, isDirty, invalid, save };
}
