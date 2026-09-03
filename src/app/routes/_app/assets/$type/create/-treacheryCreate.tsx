import { useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useReducer, useState } from 'react';

import { useSessionViewer } from '@db/profiles';
import { useCreateAsset } from '@app/db/assets';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import {
  INITIAL_TREACHERY_DRAFT,
  INITIAL_TREACHERY_MEMORY,
  TreacheryCardEditor,
  treacheryDraftWarnings,
} from '@app/widgets/card-editor/TreacheryCardEditor';
import type { TreacheryChapter, TreacheryDraft, TreacheryMemory } from '@app/widgets/card-editor/TreacheryCardEditor';
import { TreacheryAsset } from '@game/data/objects';

import { AssetEditorMessage, SaveErrorAlert, useAssetNameField } from '../../-assetEditorStates';

/**
 * This page's authoring state, and the four things that happen to it.
 *
 * Written here rather than shared, per D7 on «Work the editors wave»: the pattern repeats across the editors and that repetition is the design, because the generic version cost more than the duplication it removed.
 * `memory` is what the session needs and the stored card has no room for (D3), and `baseline` is what a reset returns to.
 */
type TreacheryState = { data: TreacheryDraft; memory: TreacheryMemory; baseline: TreacheryDraft };

type TreacheryEvent =
  | { kind: 'patch'; update: Partial<TreacheryDraft> }
  | { kind: 'remember'; update: Partial<TreacheryMemory> }
  | { kind: 'replace'; data: TreacheryDraft }
  | { kind: 'saved'; data: TreacheryDraft };

function openingState(data: TreacheryDraft, baseline: TreacheryDraft): TreacheryState {
  return { data, memory: INITIAL_TREACHERY_MEMORY, baseline };
}

function reduce(state: TreacheryState, event: TreacheryEvent): TreacheryState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'remember':
      return { ...state, memory: { ...state.memory, ...event.update } };
    /* A reset rebuilds the whole state rather than assigning a field at a time, so a piece added here later cannot be the one a reset forgets. */
    case 'replace':
      return openingState(event.data, state.baseline);
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

/** The treachery card create page. Mounted by the generic `$type/create` route when the type is `card-treachery`. */
export function TreacheryCreatePage() {
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const createAsset = useCreateAsset();
  const [chapter, setChapter] = useState<TreacheryChapter>('head');
  const [state, dispatch] = useReducer(reduce, undefined, () =>
    openingState(INITIAL_TREACHERY_DRAFT, INITIAL_TREACHERY_DRAFT)
  );
  const patch = (update: Partial<TreacheryDraft>) => dispatch({ kind: 'patch', update });
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    /* The viewer is this asset's owner-to-be, so there is nobody to lock out. */
    canRename: true,
    type: 'card-treachery',
    name: state.data.name,
    onName: (name) => patch({ name }),
    source: 'Head',
    chapter: 'head' as TreacheryChapter,
  });
  const warnings = [...treacheryDraftWarnings(state.data), ...conflictWarnings];
  const header = useEditPageHeader({
    warnings,
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  /* Dirty reads the draft alone and never the memory beside it (D6): memory is never posted, so counting it would arm a Save that writes an identical payload. */
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);
  const saveState: AuthoringSaveState = createAsset.isPending
    ? 'saving'
    : createAsset.error
      ? 'error'
      : createAsset.data !== undefined
        ? 'saved'
        : 'idle';

  switch (viewer.kind) {
    case 'pending':
      return (
        <AssetEditorMessage title="New treachery card" type="card-treachery">
          <LoadPending title="Loading your profile">Checking whether you are signed in.</LoadPending>
        </AssetEditorMessage>
      );
    case 'signed-out':
      return (
        <AssetEditorMessage title="New treachery card" type="card-treachery">
          <LoginGate action="create cards" />
        </AssetEditorMessage>
      );
    default:
      break;
  }

  const save = () => {
    /* The stored schema's own keys decide what is posted, so the session's memory can never ride along (D3). */
    const payload = postedPayload(TreacheryAsset, state.data);
    createAsset.mutate(
      { type: 'card-treachery', data: payload },
      {
        onSuccess: ({ slug }) => {
          dispatch({ kind: 'saved', data: payload });
          void navigate({ to: '/assets/$type/$slug/edit', params: { type: 'card-treachery', slug }, replace: true });
        },
      }
    );
  };

  return (
    <PageLayout>
      {header.slot}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState }}
          copy={{
            saveLabel: 'Save card',
            nameBlankMessage: 'Add a card name before saving; it determines the card URL.',
          }}
          actions={{
            onSave: save,
            onReset: header.releasing(() => dispatch({ kind: 'replace', data: state.baseline })),
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'card-treachery' } }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert error={createAsset.error} />
          <TreacheryCardEditor
            nameField={nameField}
            draft={state.data}
            patch={patch}
            memory={state.memory}
            remember={(update) => dispatch({ kind: 'remember', update })}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={header.settle}
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
