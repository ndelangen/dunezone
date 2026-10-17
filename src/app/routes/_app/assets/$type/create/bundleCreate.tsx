import { Text } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { useReducer, useState } from 'react';

import { useSessionViewer } from '@db/profiles';
import { useCreateAsset } from '@app/db/assets';
import { assetLoadSource, clonedMembersOf } from '@app/pickers/assetLoadSource';
import type { ClonedMembers } from '@app/pickers/assetLoadSource';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { LoadExisting } from '@app/widgets/authoring/LoadExisting';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import {
  bundleDraftWarnings,
  BundleEditor,
  INITIAL_BUNDLE_DRAFT,
  INITIAL_BUNDLE_MEMORY,
} from '@app/widgets/bundle-editor/BundleEditor';
import type { BundleChapter, BundleDraft, BundleMemory } from '@app/widgets/bundle-editor/BundleEditor';
import { BundleAsset } from '@game/data/objects';

import { AssetEditorMessage, SaveErrorAlert, assetNameField } from '../../assetEditorStates';

/**
 * This page's authoring state, and the four things that happen to it.
 *
 * Written here rather than shared, per D7 on «Work the editors wave»: the pattern repeats across the editors and that repetition is the design, because the generic version cost more than the duplication it removed.
 * `memory` is what the session needs and the stored bundle has no room for (D3), and `baseline` is what a reset returns to.
 * `clonedFrom` is the bundle loaded as this one's starting point, whose tokens the save copies.
 */
type BundleState = { data: BundleDraft; memory: BundleMemory; baseline: BundleDraft; clonedFrom: ClonedMembers | null };

type BundleEvent =
  | { kind: 'patch'; update: Partial<BundleDraft> }
  | { kind: 'remember'; update: Partial<BundleMemory> }
  | { kind: 'replace'; data: BundleDraft; clonedFrom: ClonedMembers | null }
  | { kind: 'saved'; data: BundleDraft };

function openingState(data: BundleDraft, baseline: BundleDraft, clonedFrom: ClonedMembers | null): BundleState {
  return { data, memory: INITIAL_BUNDLE_MEMORY, baseline, clonedFrom };
}

function reduce(state: BundleState, event: BundleEvent): BundleState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'remember':
      return { ...state, memory: { ...state.memory, ...event.update } };
    /* A reset rebuilds the whole state rather than assigning a field at a time, so a piece added here later cannot be the one a reset forgets. */
    case 'replace':
      return openingState(event.data, state.baseline, event.clonedFrom);
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

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
  const [state, dispatch] = useReducer(reduce, undefined, () =>
    openingState(INITIAL_BUNDLE_DRAFT, INITIAL_BUNDLE_DRAFT, null)
  );
  const patch = (update: Partial<BundleDraft>) => dispatch({ kind: 'patch', update });
  const nameField = assetNameField({
    /* The viewer is this asset's owner-to-be, so there is nobody to lock out. */
    canRename: true,
    name: state.data.name,
    onName: (name) => patch({ name }),
  });
  const warnings: (
    | ReturnType<typeof bundleDraftWarnings>[number]
    | { source: string; complaint: string; chapter: BundleChapter }
  )[] = bundleDraftWarnings(state.data, []).filter((warning) => warning.chapter !== 'tokens');
  /* Dirty reads the draft alone and never the memory beside it (D6): memory is never posted, so counting it would arm a Save that writes an identical payload. */
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);
  const isNameBlank = !state.data.name.trim();
  const saveState: AuthoringSaveState = createAsset.isPending
    ? 'saving'
    : createAsset.error
      ? 'error'
      : createAsset.data !== undefined
        ? 'saved'
        : 'idle';
  const header = useEditPageHeader({
    warnings,
    onFocusWarning: (warning) => setChapter(warning.chapter),
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

  const save = () => {
    /* The stored schema's own keys decide what is posted, so the session's memory can never ride along (D3). */
    const payload = postedPayload(BundleAsset, state.data);
    createAsset.mutate(
      { type: 'bundle', data: payload, members_from: state.clonedFrom?.id },
      {
        onSuccess: ({ slug }) => {
          dispatch({ kind: 'saved', data: payload });
          void navigate({ to: '/assets/$type/$slug/edit', params: { type: 'bundle', slug }, replace: true });
        },
      }
    );
  };

  const loadSource = assetLoadSource({ type: 'bundle', schema: BundleAsset });
  return (
    <PageLayout>
      {header.slot}
      <PageLayout.Toolbar>
        <LoadExisting
          noun="bundle"
          mode="create"
          disabled={saveState === 'saving'}
          source={loadSource}
          onLoaded={header.releasing((loaded) =>
            dispatch({ kind: 'replace', data: loaded.data, clonedFrom: clonedMembersOf(loaded) })
          )}
        >
          {(loadAction) => (
            <AuthoringToolbar
              status={{ isDirty, isNameBlank, saveState }}
              copy={{
                saveLabel: 'Save bundle',
                nameBlankMessage: 'Add a bundle name before saving; it determines the bundle URL.',
                /* No publication copy anywhere on this page: a bundle publishes nothing, and its members publish themselves. */
              }}
              actions={{
                onSave: save,
                onReset: header.releasing(() => dispatch({ kind: 'replace', data: state.baseline, clonedFrom: null })),
                onBack: () => void navigate({ to: '/assets/$type', params: { type: 'bundle' } }),
              }}
              auxiliaryActions={loadAction}
            />
          )}
        </LoadExisting>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert error={createAsset.error} />
          <BundleEditor
            nameField={nameField}
            draft={state.data}
            patch={patch}
            memory={state.memory}
            remember={(update) => dispatch({ kind: 'remember', update })}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={header.settle}
            members={(state.clonedFrom?.members ?? []).map((entry) => ({ token: entry.member, count: entry.count }))}
            onCountChange={null}
            tokenPicker={
              <Text size="xs" c="dimmed">
                {state.clonedFrom
                  ? `These tokens are copied from ${state.clonedFrom.name} when you save. Change them after saving.`
                  : 'Tokens can be added once the bundle has been saved.'}
              </Text>
            }
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
