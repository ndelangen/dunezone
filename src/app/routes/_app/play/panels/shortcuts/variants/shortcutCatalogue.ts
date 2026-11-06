import { PAN_LETTERS, TABLE_KEYS } from '../../../../../../widgets/tabletop/TableKeyboard';
import { SHORTCUTS } from '../../../compass/shortcuts';
import { PIN_KEYS } from '../../../compass/useOpenWindows';
import { TABLE_LABEL_OPTIONS } from '../../../tableLabels';

/*
 * Every key the table answers to, as data the shortcut sheet variants each draw their own way.
 * Each key is one cap; every letter comes from the table the key is bound with, so no variant can drift.
 * Exploration only: the variant Norbert picks keeps what it needs from here and the rest goes.
 */

/** What a key is for: the variants colour, sort and filter by it. */
export type ShortcutGroupId = 'windows' | 'view' | 'pieces' | 'bidding';

/** When a key answers: anywhere over the table, or only while something holds. */
export type Situation = 'table' | 'piece' | 'carrying' | 'bidding' | 'spice';

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
  /** The longer story, for variants with room for it. */
  detail?: string;
  /** The word whose letter the key is, so it can be shown lit: "Hand" for H. */
  word?: string;
  /** Why the key sits where it does, when no word carries its letter. */
  hook?: string;
  when: Situation;
}>;

export const GROUPS: readonly Readonly<{ id: ShortcutGroupId; title: string; short: string }>[] = [
  { id: 'windows', title: 'Compass and windows', short: 'Windows' },
  { id: 'view', title: 'Looking around', short: 'View' },
  { id: 'pieces', title: 'Pieces', short: 'Pieces' },
  { id: 'bidding', title: 'Bidding', short: 'Bidding' },
];

export const SITUATIONS: readonly Readonly<{ id: Situation; label: string }>[] = [
  { id: 'table', label: 'Anywhere over the table' },
  { id: 'piece', label: 'Pointer over a piece' },
  { id: 'carrying', label: 'Carrying a piece' },
  { id: 'bidding', label: 'Bidding' },
  { id: 'spice', label: 'Over the Spice Bank' },
];

const cap = (letter: string) => letter.toUpperCase();
const [COUNTS, NAMES] = TABLE_LABEL_OPTIONS;

export const SHORTCUT_ENTRIES: readonly ShortcutEntry[] = [
  {
    id: 'compass',
    short: 'Compass',
    group: 'windows',
    keys: ['Space'],
    action: 'Open the compass',
    detail: 'Steer with the arrows, open with Space or Enter, or type to search for any window or command.',
    hook: 'The biggest key opens everything.',
    when: 'table',
  },
  {
    id: 'hand',
    short: 'Hand',
    group: 'windows',
    keys: [cap(SHORTCUTS.hand)],
    action: 'Hand & spice',
    word: 'Hand',
    when: 'table',
  },
  {
    id: 'hidden',
    short: 'Side',
    group: 'windows',
    keys: [cap(SHORTCUTS.hidden)],
    action: 'Private side-table',
    hook: 'Right beside H: your other private place.',
    when: 'table',
  },
  {
    id: 'battle',
    short: 'Battle',
    group: 'windows',
    keys: [cap(SHORTCUTS.battle)],
    action: 'Battle plan',
    detail: 'Seats & spectators instead, while a seat request waits.',
    word: 'Battle',
    when: 'table',
  },
  {
    id: 'table',
    short: 'Chat',
    group: 'windows',
    keys: [cap(SHORTCUTS.table)],
    action: 'Table chat',
    word: 'Group',
    hook: 'G for the whole group.',
    when: 'table',
  },
  {
    id: 'ally',
    short: 'Ally',
    group: 'windows',
    keys: [cap(SHORTCUTS.ally)],
    action: 'Ally chat',
    word: 'Friend',
    hook: 'F for your friend at the table.',
    when: 'table',
  },
  {
    id: 'pin',
    short: 'Pin',
    group: 'windows',
    keys: [PIN_KEYS.left, PIN_KEYS.right],
    action: 'Pin the window left or right',
    hook: 'The brackets point at the side.',
    when: 'table',
  },
  { id: 'close', short: 'Close', group: 'windows', keys: ['Esc'], action: 'Close the centre window', when: 'table' },
  {
    id: 'help',
    short: 'Help',
    group: 'windows',
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
    detail: `${PAN_LETTERS.map(cap).join(' ')} slide it too.`,
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
    when: 'piece',
  },
  {
    id: 'turn',
    short: 'Turn',
    group: 'pieces',
    keys: [cap(TABLE_KEYS.turnLeft), cap(TABLE_KEYS.turnRight)],
    action: 'Turn it left or right',
    hook: 'Q and E sit left and right of W.',
    when: 'piece',
  },
  {
    id: 'stack',
    short: 'Stack',
    group: 'pieces',
    keys: [cap(TABLE_KEYS.stack)],
    action: 'Stack the pieces there',
    word: 'Gather',
    when: 'piece',
  },
  {
    id: 'lock',
    short: 'Lock',
    group: 'pieces',
    keys: [cap(TABLE_KEYS.lock)],
    action: 'Lock or unlock it',
    word: 'Lock',
    when: 'piece',
  },
  {
    id: 'take',
    short: 'Take',
    group: 'pieces',
    keys: [cap(TABLE_KEYS.take)],
    action: 'Draw from the deck',
    detail: 'While carrying, take one more.',
    word: 'Take',
    when: 'piece',
  },
  {
    id: 'shuffle',
    short: 'Riffle',
    group: 'pieces',
    keys: [cap(TABLE_KEYS.shuffle)],
    action: 'Shuffle the deck',
    word: 'Riffle',
    when: 'piece',
  },
  {
    id: 'split',
    short: 'Split',
    group: 'pieces',
    keys: ['1', '9'],
    press: 'range',
    action: 'Split that many into a pile',
    detail: 'Hold the digit a second. 0 for ten.',
    when: 'piece',
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
    when: 'carrying',
  },
  {
    id: 'spice-take',
    short: 'Spice',
    group: 'pieces',
    keys: ['1', '9'],
    press: 'range',
    action: 'Take that much spice',
    detail: '0 for ten.',
    when: 'spice',
  },
  {
    id: 'spice-place',
    short: 'Move',
    group: 'pieces',
    keys: ['←', '↑', '→', '↓'],
    action: 'Move spice you are placing',
    detail: 'Shift for small steps, Enter to put it down.',
    when: 'carrying',
  },
  {
    id: 'raise',
    short: 'Raise',
    group: 'bidding',
    keys: [cap(SHORTCUTS.raise)],
    action: 'Raise your bid by one',
    hook: 'I and O side by side: I goes up first.',
    when: 'bidding',
  },
  {
    id: 'lower',
    short: 'Undo',
    group: 'bidding',
    keys: [cap(SHORTCUTS.lower)],
    action: 'Take back your last raise',
    hook: 'O, beside I, undoes it.',
    when: 'bidding',
  },
  {
    id: 'pass',
    short: 'Pass',
    group: 'bidding',
    keys: [cap(SHORTCUTS.pass)],
    action: 'Pass',
    detail: 'Between your turns, sit the bidding out.',
    word: 'Pass',
    when: 'bidding',
  },
  {
    id: 'rejoin',
    short: 'Rejoin',
    group: 'bidding',
    keys: [cap(SHORTCUTS.faceUp)],
    action: 'Rejoin the bidding',
    word: 'Up',
    hook: 'Your token face up again.',
    when: 'bidding',
  },
];

/** The entries of one group, in the sheet's order. */
export function entriesOf(group: ShortcutGroupId) {
  return SHORTCUT_ENTRIES.filter((entry) => entry.group === group);
}

/** Every cap a range stands for: 1 to 9 stands for the nine digits and 0. */
export function capsOf(entry: ShortcutEntry): readonly string[] {
  if (entry.press === 'range') {
    return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  }
  return entry.keys;
}

/** The cap any key is drawn as, in the catalogue's spelling: Escape is Esc, an arrow its arrow, a letter upper case. */
export function capOfKey(event: Pick<KeyboardEvent, 'key'>): string {
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

/** The cap a keyboard event stands for, or null for a key the sheet does not list. */
export function capOfEvent(event: Pick<KeyboardEvent, 'key'>): string | null {
  const key = capOfKey(event);
  return SHORTCUT_ENTRIES.some((entry) => capsOf(entry).includes(key)) ? key : null;
}

/** The entries a cap stands in. */
export function entriesForCap(key: string) {
  return SHORTCUT_ENTRIES.filter((entry) => capsOf(entry).includes(key));
}

/** What holds besides the table itself. */
export type Now = Exclude<Situation, 'table'>;

/**
 * What a key does at this moment: what it does in a situation that holds wins, as a piece's own keys do over the table's;
 * otherwise what it does anywhere.
 * Null for a key that does nothing now.
 */
export function meaningNow(key: string, now: readonly Now[]): ShortcutEntry | null {
  const entries = entriesForCap(key);
  return (
    entries.find((entry) => entry.when !== 'table' && now.includes(entry.when)) ??
    entries.find((entry) => entry.when === 'table') ??
    null
  );
}

/** Whether an entry belongs to a situation that holds right now, rather than to the table at large. */
export function isNow(entry: ShortcutEntry, now: readonly Now[]) {
  return entry.when !== 'table' && now.includes(entry.when);
}

/** The label of each situation. */
export const SITUATION_LABEL: Readonly<Record<Situation, string>> = Object.fromEntries(
  SITUATIONS.map((situation) => [situation.id, situation.label])
) as Record<Situation, string>;
