import type { Board, Point } from '@shared/boards/schema';
type Tool = 'select' | 'line' | 'cubic' | 'arc' | 'pan' | 'add-point' | 'remove-point' | 'remove-edge';
export type BoardEditorState = {
  board: Board;
  past: Board[];
  editGroup: string | null;
  future: Board[];
  selected: string | null;
  edge: string | null;
  tool: Tool;
  points: { node?: string; point: Point }[];
  guide: boolean;
  snap: boolean;
  ghosts: boolean;
  compare: boolean;
  zoom: number;
  pan: Point;
  hover: Point | null;
  message: string;

  activeNode: string | null;
  dragNode: string | null;
  dragHandle: 'c1' | 'c2' | null;
  dragPoint: Point | null;
};
export type BoardEditorEvent =
  | { type: 'board.edited'; board: Board; message: string; group?: string }
  | { type: 'history.undo' | 'history.redo' }
  | { type: 'history.group-ended' }
  | { type: 'view.changed'; patch: Partial<Omit<BoardEditorState, 'board' | 'past' | 'future' | 'editGroup'>> };
function selectedAfterEdit(state: BoardEditorState, board: Board) {
  if (state.selected && board.properties[state.selected]) {
    return state.selected;
  }
  const name = state.selected && state.board.properties[state.selected]?.name;
  return (
    Object.keys(board.properties).find((key) => board.properties[key].name === name) ||
    Object.keys(board.properties)[0] ||
    null
  );
}
function editedState(
  state: BoardEditorState,
  event: Extract<BoardEditorEvent, { type: 'board.edited' }>
): BoardEditorState {
  return {
    ...state,
    board: event.board,
    past: event.group && state.editGroup === event.group ? state.past : [...state.past.slice(-29), state.board],
    editGroup: event.group || null,
    future: [],
    selected: selectedAfterEdit(state, event.board),
    message: event.message,
    dragNode: null,
    dragPoint: null,
    dragHandle: null,
  };
}
function restoredState(state: BoardEditorState, undo: boolean): BoardEditorState {
  const available = undo ? state.past : state.future;
  if (!available.length) {
    return state;
  }
  return {
    ...state,
    board: undo ? available.at(-1)! : available[0],
    past: undo ? state.past.slice(0, -1) : [...state.past.slice(-29), state.board],
    future: undo ? [state.board, ...state.future] : state.future.slice(1),
    selected: null,
    activeNode: null,
    edge: null,
    points: [],
    dragNode: null,
    dragHandle: null,
    dragPoint: null,
    editGroup: null,
    message: undo ? 'Undid the last edit' : 'Restored the edit',
  };
}
export function boardEditorReducer(state: BoardEditorState, event: BoardEditorEvent): BoardEditorState {
  switch (event.type) {
    case 'history.group-ended':
      return { ...state, editGroup: null };
    case 'view.changed':
      return { ...state, ...event.patch, editGroup: event.patch.selected !== undefined ? null : state.editGroup };
    case 'board.edited':
      return editedState(state, event);
    case 'history.undo':
      return restoredState(state, true);
    case 'history.redo':
      return restoredState(state, false);
  }
}

export function initialBoardEditorState(board: Board): BoardEditorState {
  return {
    board,
    past: [],
    editGroup: null,
    future: [],
    selected:
      Object.keys(board.properties).find((key) => board.properties[key].type === 'stronghold') ||
      Object.keys(board.properties)[0] ||
      null,
    edge: null,
    tool: 'select',
    points: [],
    guide: true,
    snap: true,
    ghosts: false,
    compare: false,
    zoom: 1,
    pan: [0, 0],
    hover: null,
    message: 'Select a territory, or choose a drawing tool',

    activeNode: null,
    dragNode: null,
    dragHandle: null,
    dragPoint: null,
  };
}
