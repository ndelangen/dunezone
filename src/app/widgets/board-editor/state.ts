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
  points: string[];
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
export function boardEditorReducer(state: BoardEditorState, event: BoardEditorEvent): BoardEditorState {
  if (event.type === 'history.group-ended') {
    return { ...state, editGroup: null };
  }
  if (event.type === 'view.changed') {
    return { ...state, ...event.patch, editGroup: event.patch.selected !== undefined ? null : state.editGroup };
  }
  if (event.type === 'board.edited') {
    const name = state.selected && state.board.properties[state.selected]?.name;
    const selected =
      state.selected && event.board.properties[state.selected]
        ? state.selected
        : Object.keys(event.board.properties).find((key) => event.board.properties[key].name === name) ||
          Object.keys(event.board.properties)[0] ||
          null;
    return {
      ...state,
      board: event.board,
      past: event.group && state.editGroup === event.group ? state.past : [...state.past.slice(-29), state.board],
      editGroup: event.group || null,
      future: [],
      selected,
      message: event.message,
      dragNode: null,
      dragPoint: null,
      dragHandle: null,
    };
  }
  if (event.type === 'history.undo') {
    if (!state.past.length) {
      return state;
    }
    return {
      ...state,
      board: state.past.at(-1)!,
      past: state.past.slice(0, -1),
      future: [state.board, ...state.future],
      selected: null,
      activeNode: null,
      edge: null,
      points: [],
      dragNode: null,
      dragHandle: null,
      dragPoint: null,
      editGroup: null,
      message: 'Undid the last edit',
    };
  }
  if (!state.future.length) {
    return state;
  }
  return {
    ...state,
    board: state.future[0],
    past: [...state.past.slice(-29), state.board],
    future: state.future.slice(1),
    selected: null,
    edge: null,
    points: [],
    activeNode: null,
    dragNode: null,
    dragHandle: null,
    dragPoint: null,
    editGroup: null,
    message: 'Restored the edit',
  };
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
