import { Alert, Stack, TextInput } from '@mantine/core';
import { blankBoard, derive } from '@shared/boards/geometry';
import { BoardAsset } from '@shared/boards/schema';
import type { BoardAssetData } from '@shared/boards/schema';
import { useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Undo2, Redo2 } from 'lucide-react';
import { useReducer, useMemo } from 'react';

import { useCreateAsset } from '@db/assets';
import { useSessionViewer } from '@db/profiles';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { BoardEditor } from '@app/widgets/board-editor/BoardEditor';
import { BoardLoad } from '@app/widgets/board-editor/BoardLoad';
import { boardEditorReducer, initialBoardEditorState } from '@app/widgets/board-editor/state';
import type { BoardEditorState, BoardEditorEvent } from '@app/widgets/board-editor/state';

import { AssetEditorMessage } from '../../assetEditorStates';

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

export function BoardCreatePage() {
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const saving = useCreateAsset();
  const [state, dispatch] = useReducer(reduce, undefined, () => opening({ name: '', about: '', board: blankBoard() }));
  const parsed = useMemo(() => BoardAsset.safeParse(state.draft), [state.draft]);
  const { nodes, edges } = state.draft.board;
  const geometryError = useMemo(() => {
    try {
      const result = derive({ nodes, edges, properties: {} });
      return result.unrecoveredSegments || !result.faces.length
        ? 'A boundary could not be rendered. Undo the last edit before saving.'
        : undefined;
    } catch {
      return 'A boundary could not be rendered. Undo the last edit before saving.';
    }
  }, [nodes, edges]);
  const isDirty = useMemo(
    () => JSON.stringify(state.draft) !== JSON.stringify(state.baseline),
    [state.draft, state.baseline]
  );
  const invalid = geometryError || (!parsed.success ? parsed.error.issues[0].message : undefined);
  if (viewer.kind === 'pending') {
    return (
      <AssetEditorMessage type="board" title="New board">
        <LoadPending title="Loading your profile">Checking whether you are signed in.</LoadPending>
      </AssetEditorMessage>
    );
  }
  if (viewer.kind === 'signed-out') {
    return (
      <AssetEditorMessage type="board" title="New board">
        <LoginGate action="create boards" />
      </AssetEditorMessage>
    );
  }
  const save = () => {
    if (!parsed.success || geometryError) {
      return;
    }
    const draft = parsed.data;
    saving.mutate(
      { type: 'board', data: draft },
      {
        onSuccess: ({ slug }) => {
          dispatch({ kind: 'saved', draft });
          void navigate({ to: '/assets/$type/$slug/edit', params: { type: 'board', slug }, replace: true });
        },
      }
    );
  };
  return (
    <PageLayout>
      <PageLayout.Toolbar>
        <AuthoringToolbar
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
            onBack: () => void navigate({ to: '/assets/$type', params: { type: 'board' } }),
          }}
          navigationActions={
            <BoardLoad disabled={saving.isPending} onLoad={(draft) => dispatch({ kind: 'replace', draft })} />
          }
          auxiliaryActions={
            <>
              <IconAction
                label="Undo"
                tooltip="Undo · ⌘Z / Ctrl+Z"
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
        />
      </PageLayout.Toolbar>
      <PageLayout.Content width="viewport">
        <Stack gap="sm">
          {saving.error && (
            <Alert color="red" role="alert">
              {saving.error.message}
            </Alert>
          )}
          <BoardEditor
            state={state.editor}
            dispatch={(event) => dispatch({ kind: 'editor', event })}
            identity={
              <TextInput
                label="Board name"
                value={state.draft.name}
                onChange={(e) => dispatch({ kind: 'name', name: e.currentTarget.value })}
              />
            }
          />
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
