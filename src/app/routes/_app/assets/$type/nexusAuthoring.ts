import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { INITIAL_NEXUS_MEMORY } from '@app/widgets/card-editor/NexusCardEditor';
import type { NexusDraft, NexusMemory } from '@app/widgets/card-editor/NexusCardEditor';
import { NexusCardAssetInput } from '@game/data/objects';

/* The page owns the saved baseline, draft and temporary background choices. */
type NexusState = { data: NexusDraft; memory: NexusMemory; baseline: NexusDraft };

type NexusEvent =
  | { kind: 'patch'; update: Partial<NexusDraft> }
  | { kind: 'remember'; update: Partial<NexusMemory> }
  | { kind: 'replace'; data: NexusDraft }
  | { kind: 'saved'; data: NexusDraft };

export function openingNexusState(data: NexusDraft, baseline: NexusDraft): NexusState {
  return { data, memory: INITIAL_NEXUS_MEMORY, baseline };
}

export function reduceNexusDraft(state: NexusState, event: NexusEvent): NexusState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'remember':
      return { ...state, memory: { ...state.memory, ...event.update } };
    /* A reset rebuilds the whole state rather than assigning a field at a time, so a piece added here later cannot be the one a reset forgets. */
    case 'replace':
      return openingNexusState(event.data, state.baseline);
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

/* Both pages own their reducer state; these rules keep reset and validation consistent. */
export function nexusDraftStatus(state: NexusState, requireFaction = false) {
  const validation = NexusCardAssetInput.safeParse(state.data);
  return {
    isDirty: JSON.stringify(state.data) !== JSON.stringify(state.baseline),
    invalid:
      requireFaction && !state.data.factionLink
        ? 'Choose a faction'
        : validation.success
          ? undefined
          : validation.error.issues[0]?.message,
    payload:
      validation.success && (!requireFaction || state.data.factionLink)
        ? postedPayload(NexusCardAssetInput, state.data)
        : null,
  };
}
