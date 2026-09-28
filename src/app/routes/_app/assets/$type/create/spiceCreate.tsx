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
import { INITIAL_SPICE_DRAFT, SpiceCardEditor, spiceDraftWarnings } from '@app/widgets/card-editor/SpiceCardEditor';
import type { SpiceChapter, SpiceDraft } from '@app/widgets/card-editor/SpiceCardEditor';
import { SpiceAsset } from '@game/data/objects';

import { AssetEditorMessage, SaveErrorAlert, useAssetNameField } from '../../assetEditorStates';

/**
 * This page's authoring state, and the three things that happen to it.
 * Written here rather than shared, as every editor's is (D7 on «Work the editors wave»).
 * A spice card has no background composer, so there is no session memory beside the draft.
 */
type SpiceState = { data: SpiceDraft; baseline: SpiceDraft };

type SpiceEvent =
  | { kind: 'patch'; update: Partial<SpiceDraft> }
  | { kind: 'replace'; data: SpiceDraft }
  | { kind: 'saved'; data: SpiceDraft };

function reduce(state: SpiceState, event: SpiceEvent): SpiceState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'replace':
      return { data: event.data, baseline: state.baseline };
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

/** The spice card create page. Mounted by the generic `$type/create` route when the type is `card-spice`. */
export function SpiceCreatePage() {
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const createAsset = useCreateAsset();
  const [chapter, setChapter] = useState<SpiceChapter>('head');
  const [state, dispatch] = useReducer(reduce, { data: INITIAL_SPICE_DRAFT, baseline: INITIAL_SPICE_DRAFT });
  const patch = (update: Partial<SpiceDraft>) => dispatch({ kind: 'patch', update });
  const { nameField, conflictWarnings } = useAssetNameField({
    /* The viewer is this asset's owner-to-be, so there is nobody to lock out. */
    canRename: true,
    type: 'card-spice',
    name: state.data.name,
    onName: (name) => patch({ name }),
    source: 'Head',
    chapter: 'head' as SpiceChapter,
  });
  const warnings = [...spiceDraftWarnings(state.data), ...conflictWarnings];
  const header = useEditPageHeader({
    warnings,
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
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
        <AssetEditorMessage title="New spice card" type="card-spice">
          <LoadPending title="Loading your profile">Checking whether you are signed in.</LoadPending>
        </AssetEditorMessage>
      );
    case 'signed-out':
      return (
        <AssetEditorMessage title="New spice card" type="card-spice">
          <LoginGate action="create cards" />
        </AssetEditorMessage>
      );
    default:
      break;
  }

  const save = () => {
    const payload = postedPayload(SpiceAsset, state.data);
    createAsset.mutate(
      { type: 'card-spice', data: payload },
      {
        onSuccess: ({ slug }) => {
          dispatch({ kind: 'saved', data: payload });
          void navigate({ to: '/assets/$type/$slug/edit', params: { type: 'card-spice', slug }, replace: true });
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
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'card-spice' } }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert error={createAsset.error} />
          <SpiceCardEditor
            nameField={nameField}
            draft={state.data}
            patch={patch}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={header.settle}
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
