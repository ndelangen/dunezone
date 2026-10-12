import { StrongholdCardAssetInput } from '@shared/assets/schema';

import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import type { StrongholdDraft } from '@app/widgets/card-editor/StrongholdCardEditor';

export type StrongholdEditingState = { data: StrongholdDraft; baseline: StrongholdDraft };
export type StrongholdEditingEvent =
  | { kind: 'patch'; update: Partial<StrongholdDraft> }
  | { kind: 'replace'; data: StrongholdDraft }
  | { kind: 'saved'; data: StrongholdDraft };

/** Changes the draft without moving the saved baseline. */
export function editedStronghold(state: StrongholdEditingState, update: Partial<StrongholdDraft>) {
  return { ...state, data: { ...state.data, ...update } };
}

/** Loading and Reset replace the whole draft while retaining the saved baseline. */
export function replacedStronghold(state: StrongholdEditingState, data: StrongholdDraft) {
  return { data, baseline: state.baseline };
}

/** A completed save moves the baseline to the payload that was posted. */
export function savedStronghold(state: StrongholdEditingState, data: StrongholdDraft) {
  return { ...state, baseline: data };
}

/** Derives validation and dirty status for both stronghold authoring pages. */
export function strongholdEditingStatus(state: StrongholdEditingState) {
  const validation = StrongholdCardAssetInput.safeParse(state.data);
  return {
    payload: validation.success ? postedPayload(StrongholdCardAssetInput, state.data) : undefined,
    invalid: validation.success ? undefined : validation.error.issues[0]?.message,
    isDirty: JSON.stringify(state.data) !== JSON.stringify(state.baseline),
  };
}
