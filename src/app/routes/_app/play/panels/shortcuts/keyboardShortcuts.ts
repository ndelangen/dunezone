import { SHORTCUTS } from '../../compass/shortcuts';
import { PIN_KEYS } from '../../compass/useOpenWindows';
import { TABLE_LABEL_OPTIONS } from '../../tableLabels';

/*
 * Every key the table answers to, as the cheat sheet lists them. Keys are written in braces, as `KeyedText` reads them:
 * each `{Key}` shows as a key cap. The letters come from the same tables the keys are bound with, so the sheet cannot drift.
 */

export type ShortcutRow = Readonly<{
  /** The keys, each in braces; any words between them stay plain, as in "{Q} or {E}". */
  keys: string;
  /** What the keys do, which may name further keys in braces. */
  action: string;
}>;

export type ShortcutGroup = Readonly<{
  title: string;
  /** One line on when these keys answer. */
  description?: string;
  rows: readonly ShortcutRow[];
}>;

const key = (letter: string) => `{${letter}}`;
const [COUNTS, NAMES] = TABLE_LABEL_OPTIONS;

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Compass and windows',
    description: 'With the pointer over a piece, the piece’s own keys win.',
    rows: [
      {
        keys: '{Space}',
        action: 'Open the compass: steer with the arrows, open with {Space} or {Enter}, or type to search',
      },
      { keys: key(SHORTCUTS.hand), action: 'Hand & spice' },
      { keys: key(SHORTCUTS.hidden), action: 'Private side-table' },
      { keys: key(SHORTCUTS.battle), action: 'Battle plan' },
      { keys: key(SHORTCUTS.table), action: 'Table chat' },
      { keys: key(SHORTCUTS.ally), action: 'Ally chat' },
      { keys: `${key(PIN_KEYS.left)} ${key(PIN_KEYS.right)}`, action: 'Pin the open window to the left or right' },
      { keys: '{Esc}', action: 'Close the open window' },
      { keys: key(SHORTCUTS.help), action: 'Show or hide these shortcuts' },
    ],
  },
  {
    title: 'Looking around',
    rows: [
      { keys: '{←} {↑} {→} {↓}', action: 'Slide the view; {W} {A} {S} {D} do too' },
      { keys: key(SHORTCUTS.faceUp), action: 'Look straight down at the board, and back' },
      { keys: 'Scroll', action: 'Zoom in toward the pointer' },
      { keys: `Hold ${key(COUNTS.key)}`, action: 'Read the piece under the pointer up close, and show stack counts' },
      { keys: `Hold ${key(NAMES.key)}`, action: 'Show each piece’s name and owner' },
      { keys: '{Tab}', action: 'Ping the spot under the pointer for everyone' },
    ],
  },
  {
    title: 'Pieces under the pointer',
    rows: [
      { keys: '{F}', action: 'Flip it' },
      { keys: '{Q} {E}', action: 'Turn it left or right' },
      { keys: '{G}', action: 'Stack the pieces there' },
      { keys: '{L}', action: 'Lock or unlock it' },
      { keys: '{T}', action: 'Draw a card from a deck; while carrying, take one more' },
      { keys: '{R}', action: 'Shuffle a deck' },
      { keys: 'Hold {1}–{9}', action: 'Held a second: split that many off the top into a pile, {0} for ten' },
      { keys: 'Right-click', action: 'The piece’s menu' },
      { keys: '{Esc}', action: 'Put back what you are carrying' },
      { keys: '{1}–{9}', action: 'Over the Spice Bank: take that much spice, {0} for ten' },
    ],
  },
  {
    title: 'Bidding',
    rows: [
      { keys: key(SHORTCUTS.raise), action: 'Raise your bid by one' },
      { keys: key(SHORTCUTS.lower), action: 'Take back your last raise' },
      { keys: key(SHORTCUTS.pass), action: 'Pass; between your turns, sit the bidding out' },
      { keys: key(SHORTCUTS.faceUp), action: 'Rejoin the bidding' },
    ],
  },
];
