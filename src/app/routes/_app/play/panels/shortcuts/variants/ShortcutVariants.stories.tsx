import preview from '@sb/preview';

import { panelMeta } from '../../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../../panelWindows';
import { CompassMapShortcuts } from './CompassMapShortcuts';
import { FindShortcuts } from './FindShortcuts';
import { KeyboardMapShortcuts } from './KeyboardMapShortcuts';
import { LetterIndexShortcuts } from './LetterIndexShortcuts';
import { MnemonicShortcuts } from './MnemonicShortcuts';
import { PracticeShortcuts } from './PracticeShortcuts';
import { RightNowShortcuts } from './RightNowShortcuts';
import { TriedShortcuts } from './TriedShortcuts';

/*
 * Eight ways the keyboard shortcuts window could look, each its own component in the window the compass opens, to pick from.
 * Every variant hears the keys while it is open: press one to see it answer.
 */
const frame = panelMeta(PANEL_WINDOWS.shortcuts);
const meta = preview.meta({
  ...frame,
  title: 'Play/Panels/Keyboard shortcuts/Variants',
  parameters: { ...frame.parameters, panelFrame: 'centre' },
  globals: { motion: 'on' },
});

/** A: the keyboard drawn, each key lit in its group's colour with what it does under it. Point at or press a key. */
export const AKeyboardMap = meta.story({ render: () => <KeyboardMapShortcuts /> });

/** B: one search field. Type what you want to do, or a single key to see what it does. */
export const BFind = meta.story({ render: () => <FindShortcuts /> });

/** C: what you can press right now comes first, big. Here, nothing is happening. */
export const CRightNowAtRest = meta.story({ render: () => <RightNowShortcuts now={[]} /> });

/** C: what you can press right now, while bidding. */
export const CRightNowBidding = meta.story({ render: () => <RightNowShortcuts now={['bidding']} /> });

/** C: what you can press right now, with the pointer over a piece. */
export const CRightNowOverAPiece = meta.story({ render: () => <RightNowShortcuts now={['piece']} /> });

/** D: the compass drawn, arrows and letters as one picture, the table's keys below. */
export const DCompassMap = meta.story({ render: () => <CompassMapShortcuts /> });

/** E: a memory hook for every key: H for Hand, F for Friend, Q and E either side of W. */
export const EMemoryHooks = meta.story({ render: () => <MnemonicShortcuts /> });

/** F: flash cards. Press the key the card asks for; two right in a row and it is learnt. */
export const FPractice = meta.story({ render: () => <PracticeShortcuts learnt={['compass', 'hand', 'table']} /> });

/** G: every key once, A to Z, with what it does in each situation side by side. Press a key to jump to its row. */
export const GKeyIndex = meta.story({ render: () => <LetterIndexShortcuts /> });

/** H: the keys you have not used yet come first; the ones you use fold away. Press a key to tick it off. */
export const HLearnAsYouPlay = meta.story({
  render: () => <TriedShortcuts used={{ compass: 41, hand: 17, table: 9, flip: 22, take: 12, pan: 30, close: 8 }} />,
});
