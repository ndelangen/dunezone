import { HomeworldCardAssetInput } from '@shared/assets/schema';

import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import type { HomeworldDraft } from '@app/widgets/card-editor/HomeworldCardEditor';

type HomeworldState = { data: HomeworldDraft; baseline: HomeworldDraft };
type HomeworldEvent =
  | { kind: 'patch'; update: Partial<HomeworldDraft> }
  | { kind: 'replace'; data: HomeworldDraft }
  | { kind: 'saved'; data: HomeworldDraft };

export function openingHomeworldState(data: HomeworldDraft, baseline: HomeworldDraft): HomeworldState {
  return { data, baseline };
}

export function reduceHomeworldDraft(state: HomeworldState, event: HomeworldEvent): HomeworldState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'replace':
      return openingHomeworldState(event.data, state.baseline);
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

export function homeworldDraftStatus(state: HomeworldState) {
  const validation = HomeworldCardAssetInput.safeParse(state.data);
  return {
    isDirty: JSON.stringify(state.data) !== JSON.stringify(state.baseline),
    invalid: validation.success ? undefined : validation.error.issues[0]?.message,
    payload: validation.success ? postedPayload(HomeworldCardAssetInput, state.data) : null,
  };
}
