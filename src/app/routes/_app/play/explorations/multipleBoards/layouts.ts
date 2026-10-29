/*
 * Four ways to put more than one board on a Play table, drawn top down in table units: a full board has radius 100.
 * Each layout is a prototype for Norbert to react to (2026-10-29), not game content: the second board reuses the
 * Arrakis map until a ruleset can carry its own.
 */

export type BoardRole = 'primary' | 'secondary';

export type LayoutBoard = {
  id: string;
  name: string;
  role: BoardRole;
  x: number;
  y: number;
  r: number;
  /** Degrees, so a second copy of the Arrakis map reads as a different place. */
  rotation?: number;
  /** Small wells on the board's rim that a piece snaps into, as in the sketch's rings around its right board. */
  rimWells?: number;
};

/** Two rim spots on different boards: a piece dropped on one comes out of the other. */
export type Gate = {
  id: string;
  label: string;
  ends: readonly [GateEnd, GateEnd];
};
export type GateEnd = { board: string; angle: number };

export type TableShape =
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number };

export type Furniture =
  | { kind: 'tray'; label: string; x: number; y: number; w: number; h: number }
  | {
      kind: 'track';
      label: string;
      x: number;
      y: number;
      radius: number;
      from: number;
      to: number;
      count: number;
      current: number;
    }
  | { kind: 'disc'; label: string; x: number; y: number; r: number };

export type PieceColor = 'green' | 'blue' | 'violet' | 'orange' | 'red';

export type PiecePlace = { board: string | null; x: number; y: number };

export type LayoutPiece = {
  id: string;
  color: PieceColor;
  kind: 'troop' | 'leader';
  /** Troops in the stack; a leader is one disc. */
  count?: number;
  at: PiecePlace;
};

export type Movement = 'drag' | 'gates' | 'send';

export type BoardLayout = {
  id: string;
  name: string;
  /** One line under the name. */
  summary: string;
  /** Where the boards come from: a ruleset that carries several, or an extra picked when the game is created. */
  source: string;
  /** How a piece gets from one board to another. */
  movement: Movement;
  movementHelp: string;
  /** All boards at once, or one board at a time in the same spot. */
  view: 'all' | 'one';
  /** Where the boards not on the table wait, in a one-at-a-time layout. */
  dock?: { x: number; y: number; r: number };
  table: readonly TableShape[];
  furniture: readonly Furniture[];
  boards: readonly LayoutBoard[];
  gates?: readonly Gate[];
  pieces: readonly LayoutPiece[];
};

const troop = (id: string, color: PieceColor, board: string | null, x: number, y: number, count = 1): LayoutPiece => ({
  id,
  color,
  kind: 'troop',
  count,
  at: { board, x, y },
});
const leader = (id: string, color: PieceColor, board: string | null, x: number, y: number): LayoutPiece => ({
  id,
  color,
  kind: 'leader',
  at: { board, x, y },
});

/* Pieces in the trays, the same in every layout so the four compare like for like. */
function trayPieces(trayX: number, trayY: number): LayoutPiece[] {
  return [
    troop('tank-1', 'green', null, trayX - 60, trayY, 3),
    troop('tank-2', 'blue', null, trayX - 30, trayY, 2),
    leader('tank-3', 'violet', null, trayX + 10, trayY),
    troop('tank-4', 'red', null, trayX + 45, trayY, 4),
  ];
}

/** A: Norbert's sketch. Two full boards side by side on one table, the tanks shared beneath both. */
export const twinBoards: BoardLayout = {
  id: 'twin',
  name: 'Twin boards',
  summary: 'Two full boards side by side on one table, from the sketch. The left one is primary.',
  source: 'A ruleset lists two boards; the first is primary.',
  movement: 'drag',
  movementHelp: 'Drag a piece from one board to the other. Pieces snap into the rings on the right board’s rim.',
  view: 'all',
  table: [
    { kind: 'circle', x: -115, y: 0, r: 132 },
    { kind: 'circle', x: 115, y: 0, r: 132 },
    { kind: 'circle', x: 30, y: -150, r: 32 },
    { kind: 'rect', x: -60, y: -40, w: 120, h: 140, rx: 0 },
    { kind: 'rect', x: -130, y: 80, w: 260, h: 95, rx: 10 },
    { kind: 'rect', x: -255, y: 90, w: 62, h: 95, rx: 10 },
    { kind: 'rect', x: 193, y: 90, w: 62, h: 95, rx: 10 },
  ],
  furniture: [
    { kind: 'tray', label: 'Tleilaxu Tanks', x: -110, y: 130, w: 220, h: 38 },
    { kind: 'tray', label: 'Decks', x: -248, y: 128, w: 48, h: 50 },
    { kind: 'tray', label: 'Spice', x: 200, y: 128, w: 48, h: 50 },
    { kind: 'disc', label: 'Phase', x: 30, y: -150, r: 24 },
    { kind: 'track', label: 'Turn', x: 115, y: 0, radius: 122, from: -116, to: -44, count: 9, current: 7 },
  ],
  boards: [
    { id: 'arrakis', name: 'Arrakis', role: 'primary', x: -115, y: 0, r: 100 },
    { id: 'second', name: 'Second Arrakis', role: 'secondary', x: 115, y: 0, r: 100, rotation: 180, rimWells: 7 },
  ],
  pieces: [
    troop('a-1', 'green', 'arrakis', -30, -40, 5),
    troop('a-2', 'blue', 'arrakis', 25, 35, 3),
    leader('a-3', 'orange', 'arrakis', 50, -20),
    troop('b-1', 'violet', 'second', -20, 30, 4),
    troop('b-2', 'red', 'second', 40, -35, 2),
    ...trayPieces(0, 150),
  ],
};

/** B: the primary board full size in the middle, a smaller second board docked beside it, joined by numbered gates. */
export const satelliteBoard: BoardLayout = {
  id: 'satellite',
  name: 'Satellite board',
  summary: 'The primary board stays where it is today; a smaller second board docks top right, joined by gates.',
  source: 'Create game, Advanced: “Additional board”. The ruleset’s own board stays primary.',
  movement: 'gates',
  movementHelp: 'Drop a piece on a numbered gate and it comes out of the gate with the same number on the other board.',
  view: 'all',
  table: [
    { kind: 'circle', x: 0, y: 0, r: 137 },
    { kind: 'circle', x: 172, y: -108, r: 80 },
    { kind: 'rect', x: -115, y: 110, w: 230, h: 82, rx: 10 },
  ],
  furniture: [
    { kind: 'tray', label: 'Tleilaxu Tanks', x: -100, y: 146, w: 200, h: 38 },
    { kind: 'track', label: 'Turn', x: 0, y: 0, radius: 120, from: -160, to: -110, count: 9, current: 7 },
  ],
  boards: [
    { id: 'arrakis', name: 'Arrakis', role: 'primary', x: 0, y: 0, r: 100 },
    { id: 'second', name: 'Second Arrakis', role: 'secondary', x: 172, y: -108, r: 60, rotation: 120 },
  ],
  gates: [
    {
      id: 'g1',
      label: '1',
      ends: [
        { board: 'arrakis', angle: -60 },
        { board: 'second', angle: 150 },
      ],
    },
    {
      id: 'g2',
      label: '2',
      ends: [
        { board: 'arrakis', angle: -15 },
        { board: 'second', angle: 200 },
      ],
    },
    {
      id: 'g3',
      label: '3',
      ends: [
        { board: 'arrakis', angle: 160 },
        { board: 'second', angle: 30 },
      ],
    },
  ],
  pieces: [
    troop('a-1', 'green', 'arrakis', -30, -40, 5),
    troop('a-2', 'blue', 'arrakis', 25, 35, 3),
    leader('a-3', 'orange', 'arrakis', 50, -20),
    troop('b-1', 'violet', 'second', -15, 15, 4),
    troop('b-2', 'red', 'second', 20, -20, 2),
    ...trayPieces(0, 165),
  ],
};

/** C: the boards share one spot and the table turns between them; the others wait as small discs at the table's edge. */
export const turntable: BoardLayout = {
  id: 'turntable',
  name: 'Turntable',
  summary:
    'One board on the table at a time, in today’s spot. The other board waits as a small disc you can switch to.',
  source: 'Either source works: the table looks the same as today until a game has a second board.',
  movement: 'send',
  movementHelp: 'Drop a piece on the small disc of the other board to send it there, to the same spot on that map.',
  view: 'one',
  dock: { x: 150, y: -110, r: 30 },
  table: [
    { kind: 'circle', x: 0, y: 0, r: 137 },
    { kind: 'circle', x: 150, y: -110, r: 40 },
    { kind: 'rect', x: -115, y: 110, w: 230, h: 82, rx: 10 },
  ],
  furniture: [{ kind: 'tray', label: 'Tleilaxu Tanks', x: -100, y: 146, w: 200, h: 38 }],
  boards: [
    { id: 'arrakis', name: 'Arrakis', role: 'primary', x: 0, y: 0, r: 100 },
    { id: 'second', name: 'Second Arrakis', role: 'secondary', x: 0, y: 0, r: 100, rotation: 180 },
  ],
  pieces: [
    troop('a-1', 'green', 'arrakis', -30, -40, 5),
    troop('a-2', 'blue', 'arrakis', 25, 35, 3),
    leader('a-3', 'orange', 'arrakis', 50, -20),
    troop('b-1', 'violet', 'second', -20, 30, 4),
    troop('b-2', 'red', 'second', 40, -35, 2),
    ...trayPieces(0, 165),
  ],
};

/** D: the primary board in the middle and up to four small boards round it, one per corner of the table. */
export const homeworlds: BoardLayout = {
  id: 'homeworlds',
  name: 'Homeworlds',
  summary: 'The primary board in the middle with small boards in the table’s corners, for rulesets with many places.',
  source: 'A ruleset lists any number of boards: one primary, the rest small. Create game can switch extras off.',
  movement: 'drag',
  movementHelp:
    'Drag a piece between any boards. Each small board is a quarter of the size, so its areas are few and big.',
  view: 'all',
  table: [{ kind: 'rect', x: -235, y: -170, w: 470, h: 340, rx: 60 }],
  furniture: [
    { kind: 'tray', label: 'Tleilaxu Tanks', x: -70, y: 126, w: 140, h: 36 },
    { kind: 'track', label: 'Turn', x: 0, y: 0, radius: 122, from: -122, to: -58, count: 9, current: 7 },
  ],
  boards: [
    { id: 'arrakis', name: 'Arrakis', role: 'primary', x: 0, y: -10, r: 100 },
    { id: 'caladan', name: 'Caladan', role: 'secondary', x: -175, y: -105, r: 48, rotation: 45 },
    { id: 'giedi', name: 'Giedi Prime', role: 'secondary', x: 175, y: -105, r: 48, rotation: 135 },
    { id: 'kaitain', name: 'Kaitain', role: 'secondary', x: -175, y: 95, r: 48, rotation: 225 },
    { id: 'ix', name: 'Ix', role: 'secondary', x: 175, y: 95, r: 48, rotation: 315 },
  ],
  pieces: [
    troop('a-1', 'green', 'arrakis', -30, -40, 5),
    troop('a-2', 'blue', 'arrakis', 25, 35, 3),
    leader('a-3', 'orange', 'arrakis', 50, -20),
    troop('b-1', 'violet', 'giedi', -10, 10, 4),
    troop('b-2', 'red', 'caladan', 10, -5, 2),
    leader('b-3', 'green', 'kaitain', 0, 0),
    troop('tank-1', 'green', null, -45, 144, 3),
    troop('tank-2', 'blue', null, -15, 144, 2),
    leader('tank-3', 'violet', null, 20, 144),
  ],
};

export const BOARD_LAYOUTS = [twinBoards, satelliteBoard, turntable, homeworlds] as const;
