import { Stack, TextInput } from '@mantine/core';
import { derive } from '@shared/boards/geometry';
import { BoardAsset } from '@shared/boards/schema';
import type { BoardAssetData } from '@shared/boards/schema';
import { useNavigate } from '@tanstack/react-router';
import { ActionError } from '@ui/block/ActionError';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Undo2, Redo2 } from 'lucide-react';
import { useReducer, useMemo } from 'react';
import { Fragment } from 'react';

import { useAssetPage, useUpdateAsset } from '@db/assets';
import type { AssetPublicPage } from '@db/assets';
import { useAuthoringAccountKey } from '@db/authoring';
import { assetLoad } from '@app/pickers/assetLoadSource';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { BoardEditor } from '@app/widgets/board-editor/BoardEditor';
import { boardLoadSource } from '@app/widgets/board-editor/boardLoadSource';
import { boardEditorReducer, initialBoardEditorState } from '@app/widgets/board-editor/state';
import type { BoardEditorState, BoardEditorEvent } from '@app/widgets/board-editor/state';

import { AssetEditChecks, useAssetDeletion, useAssetGroupActions } from '../../../assetEditorStates';
import type { AssetEditSessionProps } from '../../../assetEditorStates';

type Draft = Omit<BoardAssetData, 'name'> & { name: string };
type State = { draft: Draft; baseline: Draft; editor: BoardEditorState };
type Event =
  | { kind: 'editor'; event: BoardEditorEvent }
  | { kind: 'name'; name: string }
  | { kind: 'replace'; draft: Draft }
  | { kind: 'saved'; draft: Draft };
function opening(draft: Draft, baseline = draft): State {
  return { draft, baseline, editor: initialBoardEditorState(draft.board) };
}
function reduce(state: State, event: Event): State {
  switch (event.kind) {
    case 'name':
      return { ...state, draft: { ...state.draft, name: event.name } };
    case 'replace':
      return opening(event.draft, state.baseline);
    case 'saved':
      return { ...state, baseline: event.draft };
    case 'editor': {
      const editor = boardEditorReducer(state.editor, event.event);
      return {
        ...state,
        editor,
        draft: editor.board === state.draft.board ? state.draft : { ...state.draft, board: editor.board },
      };
    }
  }
}

export function BoardEditPage({ slug, loaderData }: { slug: string; loaderData: AssetPublicPage }) {
  const query = useAssetPage('board', slug, { initialData: loaderData });
  return (
    <AssetEditChecks
      type="board"
      noun="board"
      schemaName="board"
      schema={BoardAsset}
      data={query.data}
      session={(props) => (
        <Fragment key={props.asset.id}>
          <BoardSession {...props} />
        </Fragment>
      )}
    />
  );
}
function BoardSession({ asset, initialDraft, access }: AssetEditSessionProps<BoardAssetData>) {
  const authoringAccountKey = useAuthoringAccountKey();
  const navigate = useNavigate();
  const saving = useUpdateAsset();
  const deletion = useAssetDeletion(asset);
  const group = useAssetGroupActions({ asset, access });
  const [state, dispatch] = useReducer(reduce, initialDraft, opening);
  const parsed = useMemo(() => BoardAsset.safeParse(state.draft), [state.draft]);
  const { nodes, edges } = state.draft.board;
  const geometryError = useMemo(() => {
    let result: ReturnType<typeof derive>;
    try {
      result = derive({ nodes, edges, properties: {} });
    } catch {
      return 'A boundary could not be rendered. Undo the last edit before saving.';
    }
    return result.unrecoveredSegments || !result.faces.length
      ? 'A boundary could not be rendered. Undo the last edit before saving.'
      : undefined;
  }, [nodes, edges]);
  const isDirty = useMemo(
    () => JSON.stringify(state.draft) !== JSON.stringify(state.baseline),
    [state.draft, state.baseline]
  );
  const invalid = geometryError || (!parsed.success ? parsed.error.issues[0].message : undefined);
  const save = () => {
    if (!parsed.success || geometryError) {
      return;
    }
    const draft = parsed.data;
    saving.mutate(
      { id: asset.id, data: draft },
      {
        onSuccess: ({ slug }) => {
          dispatch({ kind: 'saved', draft });
          if (slug !== asset.slug) {
            void navigate({ to: '/assets/$type/$slug/edit', params: { type: 'board', slug }, replace: true });
          }
        },
      }
    );
  };
  return (
    <PageLayout>
      <PageLayout.Toolbar>
        <AuthoringToolbar
          scopeKey={authoringAccountKey}
          load={{
            noun: 'board',
            scopeKey: asset.id,
            mode: 'replace',
            disabled: saving.isPending,
            raw: assetLoad({
              noun: 'board',
              type: 'board',
              schema: BoardAsset,
              editing: asset,
              canRename: access.viewerAccess.capabilities.rename,
              disabled: saving.isPending,
              onLoaded: () => {},
            }).raw,
            source: boardLoadSource(asset.id),
            onLoaded: (loaded) =>
              dispatch({
                kind: 'replace',
                draft: { ...loaded.data, name: loaded.raw ? loaded.data.name : state.draft.name },
              }),
          }}
          status={{
            isDirty,
            isNameBlank: !state.draft.name.trim(),
            saveState: saving.isPending ? 'saving' : saving.error ? 'error' : saving.data ? 'saved' : 'idle',
            invalid,
          }}
          copy={{ saveLabel: 'Save board', nameBlankMessage: 'Add a board name before saving.' }}
          actions={{
            onSave: save,
            onReset: () => dispatch({ kind: 'replace', draft: state.baseline }),
            onBack: () => void navigate({ to: '/assets/$type/$slug', params: { type: 'board', slug: asset.slug } }),
          }}
          auxiliaryActions={
            <>
              <IconAction
                label="Undo"
                emphasis="standard"
                size="lg"
                icon={<Undo2 size={17} />}
                disabled={!state.editor.past.length}
                onClick={() => dispatch({ kind: 'editor', event: { type: 'history.undo' } })}
              />
              <IconAction
                label="Redo"
                emphasis="standard"
                size="lg"
                icon={<Redo2 size={17} />}
                disabled={!state.editor.future.length}
                onClick={() => dispatch({ kind: 'editor', event: { type: 'history.redo' } })}
              />
            </>
          }
          accessActions={group.accessActions}
          statuses={[group.status]}
          destructiveActions={
            access.viewerAccess.capabilities.delete ? (
              <ConfirmDeleteAction label="Delete board" pending={deletion.pending} onConfirm={deletion.confirm} />
            ) : null
          }
        />
      </PageLayout.Toolbar>
      <PageLayout.Content width="viewport">
        <Stack gap="sm">
          {saving.error && (
            <ActionError subject="Board" verb="save">
              {saving.error.message}
            </ActionError>
          )}
          {deletion.error && (
            <ActionError subject="Board" verb="delete">
              {deletion.error.message}
            </ActionError>
          )}
          {group.error}
          <BoardEditor
            state={state.editor}
            dispatch={(event) => dispatch({ kind: 'editor', event })}
            identity={
              <ControlBlock
                title="Board name"
                input={(fieldProps) => (
                  <TextInput
                    {...fieldProps}
                    disabled={!access.viewerAccess.capabilities.rename}
                    value={state.draft.name}
                    onChange={(e) => dispatch({ kind: 'name', name: e.currentTarget.value })}
                  />
                )}
              />
            }
          />
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
