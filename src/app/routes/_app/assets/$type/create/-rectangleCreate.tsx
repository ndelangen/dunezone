import { Alert, Text } from '@mantine/core';
import { RectangleTokenAsset } from '@shared/assets/schema';
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
  INITIAL_RECTANGLE_DRAFT,
  RectangleTokenEditor,
  rectangleDraftWarnings,
  initialRectangleMemory,
} from '@app/widgets/token-editor/RectangleTokenEditor';
import type { RectangleChapter, RectangleDraft, RectangleMemory } from '@app/widgets/token-editor/RectangleTokenEditor';

import { AssetEditorMessage, SaveErrorAlert, useAssetNameField } from '../../-assetEditorStates';

const TYPE = 'token-enhance';
/**
 * The create page for an enhance token.
 * A referenced backside cannot be set here for the same reason as the round shapes: the relation needs an asset id, and there is none until the first save.
 */
/**
 * This page's authoring state, and the four things that happen to it.
 *
 * Written here rather than shared, per D7 on «Work the editors wave»: the pattern repeats across the editors and that repetition is the design.
 * `memory` is what the session needs and the stored token has no room for (D3): the face and target kept across mode flips, the declared Custom intents,  and whether a save has already complained.
 * Rebuilding the whole state on `replace` is what makes a discarded pick actually discarded: while the face and target were refs in the widget, a Reset left them standing and the next save could write a reference the page never showed.
 */
type PageMemory = RectangleMemory & { pickedBack: { name: string; data: unknown } | null; pickBlocked: boolean };

type PageState = { data: RectangleDraft; memory: PageMemory; baseline: RectangleDraft };

type PageEvent =
  | { kind: 'patch'; update: Partial<RectangleDraft> }
  | { kind: 'remember'; update: Partial<PageMemory> }
  | { kind: 'replace'; data: RectangleDraft; pick: { name: string; data: unknown } | null }
  | { kind: 'saved'; data: RectangleDraft };

function openingState(
  data: RectangleDraft,
  baseline: RectangleDraft,
  pick: { name: string; data: unknown } | null
): PageState {
  return { data, memory: { ...initialRectangleMemory(data.back), pickedBack: pick, pickBlocked: false }, baseline };
}

function reduce(state: PageState, event: PageEvent): PageState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'remember':
      return { ...state, memory: { ...state.memory, ...event.update } };
    /* A reset rebuilds the whole state rather than assigning a field at a time, so a piece added here later cannot be the one a reset forgets; the seed pick rides on the event because the reducer holds no closure. */
    case 'replace':
      return openingState(event.data, state.baseline, event.pick);
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

export function RectangleCreatePage() {
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const createAsset = useCreateAsset();
  const [chapter, setChapter] = useState<RectangleChapter>('identity');
  const [state, dispatch] = useReducer(reduce, undefined, () =>
    openingState(INITIAL_RECTANGLE_DRAFT, INITIAL_RECTANGLE_DRAFT, null)
  );
  const patch = (update: Partial<RectangleDraft>) => dispatch({ kind: 'patch', update });
  const pickless = state.data.back.mode === 'reference' && state.data.back.asset_id === null;
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    /* The viewer is this asset's owner-to-be, so there is nobody to lock out. */
    canRename: true,
    type: TYPE,
    name: state.data.name,
    onName: (name) => patch({ name }),
    source: 'Identity',
    chapter: 'identity' as RectangleChapter,
  });
  const warnings: (
    | ReturnType<typeof rectangleDraftWarnings>[number]
    | { source: string; complaint: string; chapter: RectangleChapter }
  )[] = [...rectangleDraftWarnings(state.data), ...conflictWarnings];
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
        <AssetEditorMessage title="New enhance token" type={TYPE}>
          <LoadPending title="Loading your profile">Checking whether you are signed in.</LoadPending>
        </AssetEditorMessage>
      );
    case 'signed-out':
      return (
        <AssetEditorMessage title="New enhance token" type={TYPE}>
          <LoginGate action="create tokens" />
        </AssetEditorMessage>
      );
    default:
      break;
  }

  const save = () => {
    /* The reference tile can be chosen here but not filled (picking waits for the edit page), so the save says so with words rather than a Zod error. */
    dispatch({ kind: 'remember', update: { pickBlocked: pickless } });
    if (pickless) {
      return;
    }
    createAsset.mutate(
      { type: TYPE, data: postedPayload(RectangleTokenAsset, state.data) },
      {
        onSuccess: ({ slug }) =>
          void navigate({ to: '/assets/$type/$slug/edit', params: { type: TYPE, slug }, replace: true }),
      }
    );
  };

  return (
    <PageLayout>
      {header.slot}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          status={{ isDirty, isNameBlank, saveState }}
          copy={{
            saveLabel: 'Save token',
            nameBlankMessage: 'Add a token name before saving; it determines the token URL.',
          }}
          actions={{
            onSave: save,
            onReset: header.releasing(() => dispatch({ kind: 'replace', data: state.baseline, pick: null })),
            onBack: () => void navigate({ to: '/assets/$type', params: { type: TYPE } }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <SaveErrorAlert error={createAsset.error} />
          {state.memory.pickBlocked && pickless ? (
            <Alert color="yellow" variant="light" role="alert" title="No token picked">
              Picking a token's back happens on the edit page; save with another back mode first.
            </Alert>
          ) : null}
          <RectangleTokenEditor
            nameField={nameField}
            draft={state.data}
            patch={patch}
            memory={state.memory}
            remember={(update) => dispatch({ kind: 'remember', update })}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={header.settle}
            backPicker={() => (
              <Text size="xs" c="dimmed">
                A token can point at an existing token only once it has been saved.
              </Text>
            )}
            backProof={null}
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
