import { Text } from '@mantine/core';
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
  bundleDraftWarnings,
  BundleEditor,
  INITIAL_BUNDLE_DRAFT,
  INITIAL_BUNDLE_MEMORY,
} from '@app/widgets/bundle-editor/BundleEditor';
import type { BundleChapter } from '@app/widgets/bundle-editor/BundleEditor';
import { BundleAsset } from '@game/data/objects';

import { AssetEditorMessage, SaveErrorAlert, useAssetNameField } from '../../-assetEditorStates';

const VALIDATION_HEADER_ID = 'bundle-validation-header';

/**
 * The bundle create page.
 * Tokens cannot be added here: membership is `asset_relations` rows keyed on the bundle's id, and there is no id until the first save.
 * The Tokens chapter says so rather than offering steppers that cannot write.
 */
export function BundleCreatePage() {
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const createAsset = useCreateAsset();
  const [chapter, setChapter] = useState<BundleChapter>('identity');
  const envelope = useAuthoringEnvelope({ initialData: INITIAL_BUNDLE_DRAFT, initialMemory: INITIAL_BUNDLE_MEMORY });
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    type: 'bundle',
    name: envelope.draft.name,
    onName: (name) => envelope.patch({ name }),
    source: 'Identity',
    chapter: 'identity' as BundleChapter,
  });
  const warnings = [
    ...bundleDraftWarnings(envelope.draft, []).filter((warning) => warning.chapter !== 'tokens'),
    ...conflictWarnings,
  ];
  const session = useAuthoringSession({
    envelope,
    warnings,
    schema: BundleAsset,
    mutation: createAsset,
    variables: (payload) => ({ type: 'bundle', data: payload }),
    validationHeaderId: VALIDATION_HEADER_ID,
    onFocusWarning: (warning) => setChapter(warning.chapter),
    onSaved: ({ slug }) =>
      void navigate({ to: '/assets/$type/$slug/edit', params: { type: 'bundle', slug }, replace: true }),
  });

  switch (viewer.kind) {
    case 'pending':
      return (
        <AssetEditorMessage title="New bundle" type="bundle">
          <LoadPending title="Loading your profile">Checking whether you are signed in.</LoadPending>
        </AssetEditorMessage>
      );
    case 'signed-out':
      return (
        <AssetEditorMessage title="New bundle" type="bundle">
          <LoginGate action="create bundles" />
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
            saveLabel: 'Save bundle',
            nameBlankMessage: 'Add a bundle name before saving; it determines the bundle URL.',
            /* No publication copy anywhere on this page: a bundle publishes nothing, and its members publish themselves. */
          }}
          actions={{
            onSave: session.actions.save,
            onReset: session.actions.reset,
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'bundle' } }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert error={createAsset.error} />
          <BundleEditor
            nameField={nameField}
            {...session.editorProps}
            chapter={chapter}
            onChapterChange={setChapter}
            members={[]}
            onCountChange={null}
            tokenPicker={
              <Text size="xs" c="dimmed">
                Tokens can be added once the bundle has been saved.
              </Text>
            }
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
