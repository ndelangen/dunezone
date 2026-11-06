import preview from '@sb/preview';

import { panelMeta } from '../../PanelWindow.stories.fixture';
import { PANEL_WINDOWS } from '../../panelWindows';
import { HookCardsNowShortcuts } from './HookCardsNowShortcuts';
import { KeyboardMapShortcuts } from './KeyboardMapShortcuts';
import { LiveKeyboardShortcuts } from './LiveKeyboardShortcuts';
import { MnemonicShortcuts } from './MnemonicShortcuts';
import { NowStripShortcuts } from './NowStripShortcuts';
import { RightNowHooksShortcuts } from './RightNowHooksShortcuts';
import { RightNowShortcuts } from './RightNowShortcuts';
import { ShortcutSheet } from './ShortcutSheet';
import { SituationKeyboardShortcuts } from './SituationKeyboardShortcuts';
import { SplitShortcuts } from './SplitShortcuts';

/*
 * Ways the keyboard shortcuts window could look, each its own component in the window the compass opens, to pick from.
 * Round 1 kept the keyboard map, right now and memory hooks; round 2 combines them six ways.
 * Every variant hears the keys while it is open: press one to see it answer. Most stories have the pointer over a piece,
 * the moment where keys change meaning.
 */
const frame = panelMeta(PANEL_WINDOWS.shortcuts);
const meta = preview.meta({
  ...frame,
  title: 'Play/Panels/Keyboard shortcuts/Variants',
  parameters: { ...frame.parameters, panelFrame: 'centre' },
  globals: { motion: 'on' },
});

/** Round 1 pick A: the keyboard drawn, each key lit in its group's colour. */
export const AKeyboardMap = meta.story({ render: () => <KeyboardMapShortcuts /> });

/** Round 1 pick C: what you can press right now comes first, big, while bidding. */
export const CRightNowBidding = meta.story({ render: () => <RightNowShortcuts now={['bidding']} /> });

/** Round 1 pick E: a memory hook for every key. */
export const EMemoryHooks = meta.story({ render: () => <MnemonicShortcuts /> });

/** 1: the keyboard map with each key's word for right now; now-only keys glow, the hooks show underneath. */
export const LiveKeyboard = meta.story({
  name: '1 Live keyboard',
  render: () => <LiveKeyboardShortcuts now={['piece']} />,
});

/** 1, while bidding. */
export const LiveKeyboardBidding = meta.story({
  name: '1 Live keyboard, bidding',
  render: () => <LiveKeyboardShortcuts now={['bidding']} />,
});

/** 2: the keyboard map with a switch per moment of play; switching relabels the keys in place. */
export const KeyboardByMoment = meta.story({
  name: '2 Keyboard by moment',
  render: () => <SituationKeyboardShortcuts now={['piece']} />,
});

/** 3: right now as big tiles, each with its memory hook; the window letters on one strip. */
export const RightNowWithHooks = meta.story({
  name: '3 Right now with hooks',
  render: () => <RightNowHooksShortcuts now={['bidding']} />,
});

/** 4: a small keyboard on top, the stories beneath; pointing at either lights the other. */
export const MapBesideList = meta.story({
  name: '4 Map beside list',
  render: () => <SplitShortcuts now={['piece']} />,
});

/** 5: the memory hook cards, ordered by the moment: now first, anywhere next, other moments small. */
export const MemoryCardsNowFirst = meta.story({
  name: '5 Memory cards, now first',
  render: () => <HookCardsNowShortcuts now={['piece']} />,
});

/** 6: a short window of chips for right now and the windows; the whole keyboard unfolds on demand. */
export const QuickStrip = meta.story({
  name: '6 Quick strip',
  render: () => <NowStripShortcuts now={['piece']} />,
});

/** 6, with the whole keyboard unfolded. */
export const QuickStripUnfolded = meta.story({
  name: '6 Quick strip, unfolded',
  render: () => <NowStripShortcuts now={['piece']} open />,
});

/** Norbert's layout: right now in one scrolling row, the whole keyboard with tooltips, then the colour-coded list. */
export const Sheet = meta.story({
  name: '7 Now, keyboard, list',
  render: () => <ShortcutSheet now={['piece']} />,
});

/** 7, while bidding. */
export const SheetBidding = meta.story({
  name: '7 Now, keyboard, list, bidding',
  render: () => <ShortcutSheet now={['bidding']} />,
});
