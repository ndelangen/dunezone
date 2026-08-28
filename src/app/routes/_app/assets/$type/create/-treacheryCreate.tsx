import { useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useState } from 'react';

import { useSessionViewer } from '@db/profiles';
import { useCreateAsset } from '@app/db/assets';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useAuthoringEnvelope, useAuthoringSession } from '@app/widgets/authoring/useAuthoringSession';
import {
  INITIAL_TREACHERY_DRAFT,
  INITIAL_TREACHERY_MEMORY,
  TreacheryCardEditor,
  treacheryDraftWarnings,
} from '@app/widgets/card-editor/TreacheryCardEditor';
import type { TreacheryChapter } from '@app/widgets/card-editor/TreacheryCardEditor';
import { TreacheryAsset } from '@game/data/objects';

import { AssetEditorMessage, SaveErrorAlert, useAssetNameField } from '../../-assetEditorStates';

const VALIDATION_HEADER_ID = 'card-validation-header';

/** The treachery card create page. Mounted by the generic `$type/create` route when the type is `card-treachery`. */
export function TreacheryCreatePage() {
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const createAsset = useCreateAsset();
  const [chapter, setChapter] = useState<TreacheryChapter>('head');
  const envelope = useAuthoringEnvelope({
    initialData: INITIAL_TREACHERY_DRAFT,
    initialMemory: INITIAL_TREACHERY_MEMORY,
  });
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    type: 'card-treachery',
    name: envelope.draft.name,
    onName: (name) => envelope.patch({ name }),
    source: 'Head',
    chapter: 'head' as TreacheryChapter,
  });
  const warnings = [...treacheryDraftWarnings(envelope.draft), ...conflictWarnings];
  const session = useAuthoringSession({
    envelope,
    warnings,
    schema: TreacheryAsset,
    mutation: createAsset,
    variables: (payload) => ({ type: 'card-treachery', data: payload }),
    validationHeaderId: VALIDATION_HEADER_ID,
    onFocusWarning: (warning) => setChapter(warning.chapter),
    onSaved: ({ slug }) =>
      void navigate({ to: '/assets/$type/$slug/edit', params: { type: 'card-treachery', slug }, replace: true }),
  });

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

  return (
    <PageLayout>
      {session.band}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          status={session.status}
          copy={{
            saveLabel: 'Save card',
            nameBlankMessage: 'Add a card name before saving; it determines the card URL.',
          }}
          actions={{
            onSave: session.actions.save,
            onReset: session.actions.reset,
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'card-treachery' } }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert error={createAsset.error} />
          <TreacheryCardEditor
            nameField={nameField}
            {...session.editorProps}
            chapter={chapter}
            onChapterChange={setChapter}
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
