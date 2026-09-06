import { Alert, Text } from '@mantine/core';
import { TokenAsset } from '@shared/assets/schema';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
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
  initialTokenMemory,
  initialTokenDraft,
  TokenEditor,
  tokenDraftWarnings,
} from '@app/widgets/token-editor/TokenEditor';
import type { TokenChapter, TokenDraft, TokenMemory } from '@app/widgets/token-editor/TokenEditor';

import { AssetEditorMessage, SaveErrorAlert, useAssetNameField } from '../../assetEditorStates';

/**
 * This page's authoring state, and the four things that happen to it.
 *
 * Written here rather than shared, per D7 on «Work the editors wave»: the pattern repeats across the editors and that repetition is the design.
 * `memory` is what the session needs and the stored token has no room for (D3): the face and target kept across mode flips, the declared Custom intents, and whether a save has already complained.
 * `baseline` is what a reset returns to, and rebuilding the whole state on `replace` is what makes a discarded pick actually discarded.
 */
type PageMemory = TokenMemory & { pickedBack: { name: string; data: unknown } | null; pickBlocked: boolean };

type PageState = { data: TokenDraft; memory: PageMemory; baseline: TokenDraft };

type PageEvent =
  | { kind: 'patch'; update: Partial<TokenDraft> }
  | { kind: 'remember'; update: Partial<PageMemory> }
  | { kind: 'replace'; data: TokenDraft; pick: { name: string; data: unknown } | null }
  | { kind: 'saved'; data: TokenDraft };

function openingState(data: TokenDraft, baseline: TokenDraft, pick: { name: string; data: unknown } | null): PageState {
  return { data, memory: { ...initialTokenMemory(data.back), pickedBack: pick, pickBlocked: false }, baseline };
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

/**
 * The create page for every token shape.
 * A referenced backside cannot be set here: the relation needs an asset id, and there is none until the first save, so creation always starts from a custom back and the edit page offers the choice.
 */
export function TokenCreatePage({ type }: { type: string }) {
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const createAsset = useCreateAsset();
  const initialDraft = initialTokenDraft(type);
  const [chapter, setChapter] = useState<TokenChapter>('identity');
  const label = isAssetType(type) ? ASSET_TYPES[type].shortLabel.toLowerCase() : 'token';
  const [state, dispatch] = useReducer(reduce, undefined, () => openingState(initialDraft, initialDraft, null));
  const patch = (update: Partial<TokenDraft>) => dispatch({ kind: 'patch', update });
  const pickless = state.data.back.mode === 'reference' && state.data.back.asset_id === null;
  /* The save guard's rule, live while the author types: a colliding name warns here instead of dying as a save error (finding 19). */
  const { nameField, conflictWarnings } = useAssetNameField({
    /* The viewer is this asset's owner-to-be, so there is nobody to lock out. */
    canRename: true,
    type,
    name: state.data.name,
    onName: (name) => patch({ name }),
    source: 'Identity',
    chapter: 'identity' as TokenChapter,
  });
  const warnings: (
    | ReturnType<typeof tokenDraftWarnings>[number]
    | { source: string; complaint: string; chapter: TokenChapter }
  )[] = [...tokenDraftWarnings(state.data), ...conflictWarnings];
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
        <AssetEditorMessage title={`New ${label} token`} type={type}>
          <LoadPending title="Loading your profile">Checking whether you are signed in.</LoadPending>
        </AssetEditorMessage>
      );
    case 'signed-out':
      return (
        <AssetEditorMessage title={`New ${label} token`} type={type}>
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
    /* The stored schema's own keys decide what is posted, so the session's memory can never ride along (D3). */
    const payload = postedPayload(TokenAsset, state.data);
    createAsset.mutate(
      { type, data: payload },
      {
        onSuccess: ({ slug }) => {
          dispatch({ kind: 'saved', data: payload });
          void navigate({ to: '/assets/$type/$slug/edit', params: { type, slug }, replace: true });
        },
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
            onBack: () => void navigate({ to: '/assets/$type', params: { type } }),
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
          <TokenEditor
            nameField={nameField}
            draft={state.data}
            patch={patch}
            memory={state.memory}
            remember={(update) => dispatch({ kind: 'remember', update })}
            type={type}
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
