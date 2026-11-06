import { PAN_LETTERS, TABLE_KEYS } from '../../../../../widgets/tabletop/TableKeyboard';
import type { PieceKey } from '../../../../../widgets/tabletop/TableKeyboard';
import { SHORTCUTS } from '../../compass/shortcuts';
import type { Command } from '../../compass/shortcuts';
import { PIN_KEYS } from '../../compass/useOpenWindows';
import { TABLE_LABEL_OPTIONS } from '../../tableLabels';

/*
 * Every key the table answers to, as the keyboard shortcuts panel lists, draws and explains them.
 * Each key is one cap; every letter comes from the table the key is bound with, so the panel cannot drift.
 */

/** What a key is for: the panel colours and groups the keys by it. */
export type ShortcutGroupId = 'panels' | 'view' | 'pieces' | 'bidding';

/**
 * What holds right now, so those keys come first: a piece under the pointer, each piece key the table would act on, and each bidding command it offers, read from the same checks the key handlers and the compass run.
 */
export type Now = 'piece' | PieceKey | Command;

/**
 * When a key answers: anywhere over the table, while something the panel can see holds, or in a moment it only names: the pointer over the Spice Bank, or placing spice taken from the reserve with the keyboard.
 */
export type Situation = 'table' | Now | 'spice' | 'placing';

export type ShortcutEntry = Readonly<{
  id: string;
  group: ShortcutGroupId;
  /** One cap per key, in the order they are read. */
  keys: readonly string[];
  /** How the keys go together: pressed one at a time, held, or a run such as 1 to 9. */
  press?: 'hold' | 'range';
  /** A pointer gesture rather than a key, such as scrolling. */
  pointer?: boolean;
  /** One word for what the key does, small enough to sit on the key itself. */
  short: string;
  /** What the key does, as short as the compass would say it. */
  action: string;
  /** For a run of digits, what one digit does, said with its number: "Take 10 spice" for 0. */
  actionFor?: (count: number) => string;
  /** More on what the key does, for the list and the tooltip. */
  detail?: string;
  /** The word whose letter the key is, so it can be shown lit: "Hand" for H. */
  word?: string;
  /** Why the key sits where it does, when no word carries its letter. */
  hook?: string;
  /** When the key does this; a key that does it in several moments lists each. */
  when: Situation | readonly Situation[];
}>;

export const GROUPS: readonly Readonly<{ id: ShortcutGroupId; title: string; short: string }>[] = [
  { id: 'panels', title: 'Compass and panels', short: 'Panels' },
  { id: 'view', title: 'Looking around', short: 'View' },
  { id: 'pieces', title: 'Pieces', short: 'Pieces' },
  { id: 'bidding', title: 'Bidding', short: 'Bidding' },
];

/** The label of each situation. */
const SITUATION_LABEL: Readonly<Record<Situation, string>> = {
  table: 'Anywhere over the table',
  piece: 'Pointer over a piece',
  flip: 'On a piece you point at, select or carry',
  turn: 'On a piece you point at, select or carry',
  split: 'On a piece you point at or select',
  draw: 'Pointer over a deck you may draw from',
  shuffle: 'Pointer over a deck of two or more',
  takeMore: 'Carrying from a pile that has more',
  putBack: 'Carrying a piece',
  raise: 'Your turn to bid',
  lower: 'After you raise',
  pass: 'Bidding, while you are in',
  faceUp: 'Sitting the bidding out',
  spice: 'Over the Spice Bank',
  placing: 'Placing spice from your reserve',
};

const cap = (letter: string) => letter.toUpperCase();
const [COUNTS, NAMES] = TABLE_LABEL_OPTIONS;

export const SHORTCUT_ENTRIES: readonly ShortcutEntry[] = [
  {
    id: 'compass',
    short: 'Compass',
    group: 'panels',
    keys: ['Space'],
    action: 'Open the compass',
    detail: 'Steer with the arrows, open with Space or Enter, or type to search for any panel or command.',
    hook: 'The biggest key opens everything.',
    when: 'table',
  },
  {
    id: 'hand',
    short: 'Hand',
    group: 'panels',
    keys: [cap(SHORTCUTS.hand)],
    action: 'Hand & spice',
    word: 'Hand',
    when: 'table',
  },
  {
    id: 'hidden',
    short: 'Side',
    group: 'panels',
    keys: [cap(SHORTCUTS.hidden)],
    action: 'Private side-table',
    hook: 'Right beside H: your other private place.',
    when: 'table',
  },
  {
    id: 'battle',
    short: 'Battle',
    group: 'panels',
    keys: [cap(SHORTCUTS.battle)],
    action: 'Battle plan',
    detail: 'Seats & spectators instead, while a seat request waits.',
    word: 'Battle',
    when: 'table',
  },
  {
    id: 'table',
    short: 'Chat',
    group: 'panels',
    keys: [cap(SHORTCUTS.table)],
    action: 'Table chat',
    word: 'Group',
    hook: 'G for the whole group.',
    when: 'table',
  },
  {
    id: 'ally',
    short: 'Ally',
    group: 'panels',
    keys: [cap(SHORTCUTS.ally)],
    action: 'Ally chat',
    word: 'Friend',
    hook: 'F for your friend at the table.',
    when: 'table',
  },
  {
    id: 'pin',
    short: 'Pin',
    group: 'panels',
    keys: [PIN_KEYS.left, PIN_KEYS.right],
    action: 'Pin the panel left or right',
    hook: 'The brackets point at the side.',
    when: 'table',
  },
  { id: 'close', short: 'Close', group: 'panels', keys: ['Esc'], action: 'Close the centre panel', when: 'table' },
  {
    id: 'help',
    short: 'Help',
    group: 'panels',
    keys: [SHORTCUTS.help],
    action: 'These shortcuts',
    hook: 'A question: what does what?',
    when: 'table',
  },
  {
    id: 'pan',
    short: 'Pan',
    group: 'view',
    keys: ['←', '↑', '→', '↓'],
    action: 'Slide the view',
    when: 'table',
  },
  {
    id: 'pan-letters',
    short: 'Pan',
    group: 'view',
    keys: PAN_LETTERS.map(cap),
    action: 'Slide the view, as the arrows do',
    when: 'table',
  },
  {
    id: 'top-down',
    short: 'Top',
    group: 'view',
    keys: [cap(SHORTCUTS.faceUp)],
    action: 'Look straight down, and back',
    word: 'Up',
    hook: 'Up above the board.',
    when: 'table',
  },
  {
    id: 'zoom',
    short: 'Zoom',
    group: 'view',
    keys: ['Scroll'],
    pointer: true,
    action: 'Zoom toward the pointer',
    when: 'table',
  },
  {
    id: 'counts',
    short: 'Close-up',
    group: 'view',
    keys: [COUNTS.key],
    press: 'hold',
    action: 'Close-up and stack counts',
    detail: 'Read the piece under the pointer up close.',
    when: 'table',
  },
  {
    id: 'names',
    short: 'Names',
    group: 'view',
    keys: [NAMES.key],
    press: 'hold',
    action: 'Piece names and owners',
    when: 'table',
  },
  {
    id: 'ping',
    short: 'Ping',
    group: 'view',
    keys: ['Tab'],
    action: 'Ping the spot for everyone',
    hook: 'Tap the table with Tab.',
    when: 'table',
  },
  {
    id: 'flip',
    short: 'Flip',
    group: 'pieces',
    keys: [cap(TABLE_KEYS.flip)],
    action: 'Flip it',
    word: 'Flip',
    when: 'flip',
  },
  {
    id: 'turn',
    short: 'Turn',
    group: 'pieces',
    keys: [cap(TABLE_KEYS.turnLeft), cap(TABLE_KEYS.turnRight)],
    action: 'Turn it left or right',
    hook: 'Q and E sit left and right of W.',
    when: 'turn',
  },
  {
    id: 'take',
    short: 'Take',
    group: 'pieces',
    keys: [cap(TABLE_KEYS.take)],
    action: 'Draw from the deck',
    word: 'Take',
    when: 'draw',
  },
  {
    id: 'take-more',
    short: 'Take',
    group: 'pieces',
    keys: [cap(TABLE_KEYS.take)],
    action: 'Take one more',
    detail: 'Adds the next one from the pile to what you carry.',
    word: 'Take',
    when: 'takeMore',
  },
  {
    id: 'shuffle',
    short: 'Riffle',
    group: 'pieces',
    keys: [cap(TABLE_KEYS.shuffle)],
    action: 'Shuffle the deck',
    word: 'Riffle',
    when: 'shuffle',
  },
  {
    id: 'split',
    short: 'Split',
    group: 'pieces',
    keys: ['1', '9'],
    press: 'range',
    action: 'Split that many into a pile',
    actionFor: (count) => `Split ${count} into a pile`,
    detail: 'Hold the digit a second.',
    when: 'split',
  },
  {
    id: 'menu',
    short: 'Menu',
    group: 'pieces',
    keys: ['Right-click'],
    pointer: true,
    action: 'The piece’s menu',
    when: 'piece',
  },
  {
    id: 'put-back',
    short: 'Put back',
    group: 'pieces',
    keys: ['Esc'],
    action: 'Put back what you carry',
    when: 'putBack',
  },
  {
    id: 'spice-take',
    short: 'Spice',
    group: 'pieces',
    keys: ['1', '9'],
    press: 'range',
    action: 'Take that much spice',
    actionFor: (count) => `Take ${count} spice`,
    when: 'spice',
  },
  {
    id: 'spice-place',
    short: 'Move',
    group: 'pieces',
    keys: ['←', '↑', '→', '↓'],
    action: 'Move spice you are placing',
    detail: 'Shift for small steps, Enter to put it down.',
    when: 'placing',
  },
  {
    id: 'raise',
    short: 'Raise',
    group: 'bidding',
    keys: [cap(SHORTCUTS.raise)],
    action: 'Raise your bid by one',
    hook: 'I and O side by side: I goes up first.',
    when: 'raise',
  },
  {
    id: 'lower',
    short: 'Undo',
    group: 'bidding',
    keys: [cap(SHORTCUTS.lower)],
    action: 'Take back your last raise',
    hook: 'O, beside I, undoes it.',
    when: 'lower',
  },
  {
    id: 'pass',
    short: 'Pass',
    group: 'bidding',
    keys: [cap(SHORTCUTS.pass)],
    action: 'Pass',
    detail: 'Between your turns, sit the bidding out.',
    word: 'Pass',
    when: 'pass',
  },
  {
    id: 'rejoin',
    short: 'Rejoin',
    group: 'bidding',
    keys: [cap(SHORTCUTS.faceUp)],
    action: 'Rejoin the bidding',
    word: 'Up',
    hook: 'Your token face up again.',
    when: 'faceUp',
  },
];

/** Every cap a range stands for: 1 to 9 stands for the nine digits and 0. */
export function capsOf(entry: ShortcutEntry): readonly string[] {
  if (entry.press === 'range') {
    return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  }
  return entry.keys;
}

/** How many a digit cap stands for: 0 is ten. */
function countOf(key: string) {
  return key === '0' ? 10 : Number(key);
}

/** What an entry does when this cap is pressed: a digit says its own number. */
export function actionOf(entry: ShortcutEntry, key: string) {
  return entry.actionFor && /^\d$/.test(key) ? entry.actionFor(countOf(key)) : entry.action;
}

/** The cap any key is drawn as, in the catalogue's spelling: Escape is Esc, an arrow its arrow, a letter upper case. */
function capOfKey(event: Pick<KeyboardEvent, 'key'>): string {
  const named: Record<string, string> = {
    ' ': 'Space',
    Escape: 'Esc',
    ArrowLeft: '←',
    ArrowUp: '↑',
    ArrowRight: '→',
    ArrowDown: '↓',
    Control: 'Ctrl',
  };
  return named[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
}

/* Each cap's entries, worked out once. */
const BY_CAP = new Map<string, ShortcutEntry[]>();
for (const entry of SHORTCUT_ENTRIES) {
  for (const key of capsOf(entry)) {
    BY_CAP.set(key, [...(BY_CAP.get(key) ?? []), entry]);
  }
}

/** The cap a keyboard event stands for, or null for a key the sheet does not list. */
export function capOfEvent(event: Pick<KeyboardEvent, 'key'>): string | null {
  const key = capOfKey(event);
  return BY_CAP.has(key) ? key : null;
}

/** The entries a cap stands in. */
export function entriesForCap(key: string): readonly ShortcutEntry[] {
  return BY_CAP.get(key) ?? [];
}

/* Every moment an entry answers in. */
function situationsOf(entry: ShortcutEntry): readonly Situation[] {
  return typeof entry.when === 'string' ? [entry.when] : entry.when;
}

/** Whether an entry belongs to a situation that holds right now, rather than to the table at large. */
export function isNow(entry: ShortcutEntry, now: readonly Now[]) {
  return situationsOf(entry).some((situation) => (now as readonly Situation[]).includes(situation));
}

/** When an entry answers, in words: "Pointer over a piece or Carrying a piece". */
export function whenLabel(entry: ShortcutEntry) {
  return situationsOf(entry)
    .map((situation) => SITUATION_LABEL[situation])
    .join(' or ');
}

/* The moments as the panel's heading names them: the bidding commands read as the phase they belong to. */
const ON_A_PIECE = 'On a piece';
const MOMENT_LABEL: Readonly<Record<Now, string>> = {
  piece: ON_A_PIECE,
  flip: ON_A_PIECE,
  turn: ON_A_PIECE,
  split: ON_A_PIECE,
  draw: ON_A_PIECE,
  shuffle: ON_A_PIECE,
  takeMore: SITUATION_LABEL.putBack,
  putBack: SITUATION_LABEL.putBack,
  raise: 'Bidding',
  lower: 'Bidding',
  pass: 'Bidding',
  faceUp: SITUATION_LABEL.faceUp,
};

/** What holds right now in words, for the panel's heading: "Carrying a piece, Bidding". */
export function momentLabel(now: readonly Now[]) {
  const labels = new Set(now.map((each) => MOMENT_LABEL[each]));
  /* The piece keys that answer a carry belong to the carry. */
  if (labels.has(SITUATION_LABEL.putBack)) {
    labels.delete(ON_A_PIECE);
  }
  return [...labels].join(', ') || 'At the table';
}

/**
 * What a key does at this moment: what it does in a situation that holds wins, as a piece's own keys do over the table's;
 * otherwise what it does anywhere.
 * Null for a key that does nothing now.
 */
export function meaningNow(key: string, now: readonly Now[]): ShortcutEntry | null {
  const entries = entriesForCap(key);
  return entries.find((entry) => isNow(entry, now)) ?? entries.find((entry) => entry.when === 'table') ?? null;
}
