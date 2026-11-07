import { expect, test } from 'vite-plus/test';

import { readCameraFollowsPhase } from '../../../../widgets/tabletop/cameraFollowsPhase';
import { PANEL_WINDOWS } from '../panels/panelWindows';
import { commandsOf } from './shortcuts';
import { candidatesOf, fuzzy, rankSuggestions } from './suggestions';

const candidate = (label: string, weight = 0) => ({
  key: label,
  label,
  hint: '',
  icon: null,
  run: () => {},
  text: label,
  weight,
});

test('letters in order anywhere in the text match, and adjacent or word-starting letters score higher', () => {
  expect(fuzzy('Shared table inventory', 'shinv')).not.toBeNull();
  expect(fuzzy('Shared table inventory', 'vni')).toBeNull();
  expect(fuzzy('Hand & spice', 'hand')!).toBeGreaterThan(fuzzy('Hidden zone and more', 'hand')!);
  expect(fuzzy('Table chat', 'tc')!).toBeGreaterThan(fuzzy('Battle act', 'tc')!);
});

test('with nothing typed the heaviest lead, six at most; typed, the best eight matches', () => {
  const all = [
    candidate('Phase', 5),
    candidate('Table chat', 10),
    ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((letter) => candidate(`Window ${letter}`)),
  ];
  expect(rankSuggestions(all, '  ').map((entry) => entry.label)).toEqual([
    'Table chat',
    'Phase',
    'Window a',
    'Window b',
    'Window c',
    'Window d',
  ]);
  expect(rankSuggestions(all, 'win')).toHaveLength(7);
  expect(rankSuggestions(all, 'w').map((entry) => entry.label)).toHaveLength(7);
  expect(rankSuggestions(all, 'tab').map((entry) => entry.label)).toEqual(['Table chat']);
  expect(rankSuggestions(all, 'zz')).toEqual([]);
});

type Token = { faceUp: boolean; flip: () => void; inBidding?: boolean } | null;
type Bidding = { raise: () => void; lower: (() => void) | null; pass: () => void } | null;

const actions = (token: Token, close = () => {}, bidding: Bidding = null) => ({
  open: () => {},
  players: [],
  nextPhase: null,
  token,
  commands: commandsOf({ token, bidding }),
  shortcuts: {},
  view: () => {},
  close,
});

const commandLabels = (token: Token, bidding: Bidding = null) =>
  candidatesOf([], actions(token, undefined, bidding))
    .filter((entry) => entry.key.startsWith('cmd:') && !entry.key.startsWith('cmd:camera'))
    .map((entry) => `${entry.label}${entry.shortcut ? ` (${entry.shortcut})` : ''}`);

test('the token commands appear only with a token: Pass while it shows its face, Flip faction token up while it does not', () => {
  expect(commandLabels(null)).toEqual([]);
  expect(commandLabels({ faceUp: true, flip: () => {}, inBidding: true })).toEqual(['Pass (P)', 'Flip faction token']);
  expect(commandLabels({ faceUp: false, flip: () => {}, inBidding: true })).toEqual([
    'Flip faction token up (U)',
    'Flip faction token',
  ]);
  /* Outside the Bidding phase a token neither sits out nor comes back in, so only the plain flip is offered. */
  expect(commandLabels({ faceUp: true, flip: () => {} })).toEqual(['Flip faction token']);
});

test('while the bidder points at the viewer, Pass hands it on, and the bid goes up, or down after a raise', () => {
  const bidding = { raise: () => {}, lower: null, pass: () => {} };
  expect(commandLabels({ faceUp: true, flip: () => {}, inBidding: true }, bidding)).toEqual([
    'Pass (P)',
    'Up the bid by 1 (I)',
    'Flip faction token',
  ]);
  expect(commandLabels(null, { ...bidding, lower: () => {} })).toEqual([
    'Pass (P)',
    'Up the bid by 1 (I)',
    'Lower the bid (O)',
  ]);
  const calls: string[] = [];
  const all = candidatesOf(
    [],
    actions(null, () => calls.push('close'), { ...bidding, pass: () => calls.push('pass') })
  );
  rankSuggestions(all, 'pass')[0]!.run();
  expect(calls).toEqual(['close', 'pass']);
});

test('Pass closes the compass and turns the token over', () => {
  const calls: string[] = [];
  const all = candidatesOf(
    [],
    actions({ faceUp: true, flip: () => calls.push('flip'), inBidding: true }, () => calls.push('close'))
  );
  rankSuggestions(all, 'pass')[0]!.run();
  expect(calls).toEqual(['close', 'flip']);
});

test('a window an arm of the compass opens carries its letter', () => {
  const hand = {
    key: 'hand',
    label: 'Hand & spice',
    group: 'Hand',
    topic: 'hand',
    content: null,
    layout: 'stack',
  } as const;
  const [entry] = candidatesOf([hand], { ...actions(null), shortcuts: { hand: 'H' } });
  expect(entry).toMatchObject({ label: 'Hand & spice', shortcut: 'H' });
});

test('"top-down" finds the camera command, which closes the compass and turns the camera straight down', () => {
  const calls: string[] = [];
  const all = candidatesOf([], {
    ...actions(null, () => calls.push('close')),
    view: (view) => calls.push(`view:${view}`),
  });
  const [command] = rankSuggestions(all, 'top-down');
  expect(command?.label).toBe('Camera: top-down');
  command!.run();
  expect(calls).toEqual(['close', 'view:top']);
});

test('Camera: top-down carries U, unless U flips the viewer’s token up just now', () => {
  const topDown = (token: Token) =>
    candidatesOf([], actions(token)).find((entry) => entry.key === 'cmd:camera:top')?.shortcut;
  expect(topDown(null)).toBe('U');
  expect(topDown({ faceUp: false, flip: () => {}, inBidding: true })).toBeUndefined();
});

test('with nothing typed, Pass leads beside the raise while the bidder points at the viewer, and not while it does not', () => {
  const token = { faceUp: true, flip: () => {}, inBidding: true };
  const bidding = { raise: () => {}, lower: null, pass: () => {} };
  const suggested = (turn: Bidding) => rankSuggestions(candidatesOf([], actions(token, undefined, turn)), '');
  expect(
    suggested(bidding)
      .map((entry) => entry.label)
      .slice(0, 2)
  ).toEqual(['Pass', 'Up the bid by 1']);
  /* Off its turn, Pass turns the token face down to sit the bidding out: no reason to lead. */
  const weight = (turn: Bidding) =>
    candidatesOf([], actions(token, undefined, turn)).find((entry) => entry.key === 'cmd:pass')?.weight;
  expect(weight(null)).toBe(0);
  expect(weight(bidding)).toBe(6);
});

test('Next phase is offered only while the table takes it', () => {
  const next = (nextPhase: (() => void) | null) =>
    candidatesOf([], { ...actions(null), nextPhase }).some((entry) => entry.key === 'cmd:next');
  expect(next(null)).toBe(false);
  expect(next(() => {})).toBe(true);
});

test('the search switches this viewer’s board skin and planet shading, ranked below everything else until typed for', () => {
  const all = candidatesOf([], actions(null));
  expect(rankSuggestions(all, 'fancy').map((entry) => entry.label)).toContain('Board skin: Fancy');
  expect(rankSuggestions(all, 'skin').map((entry) => entry.label)).toEqual(
    expect.arrayContaining(['Board skin: Fancy', 'Planet shading: on', 'Planet shading: off'])
  );
  expect(rankSuggestions(all, 'planet').map((entry) => entry.label)).toEqual([
    'Planet shading: on',
    'Planet shading: off',
  ]);
  /* They sit below every window and command, so they surface only once typed for. */
  expect(all.filter((entry) => entry.key.startsWith('look:')).every((entry) => entry.weight < 0)).toBe(true);
  expect(rankSuggestions(all, 'treachery')[0]?.label).toBe('Board skin: Treachery Online');
});

test('the search turns the camera following phases on or off, matching each side by its own words', () => {
  const all = candidatesOf([], actions(null));
  expect(rankSuggestions(all, 'camera follows').map((entry) => entry.label)).toEqual(
    expect.arrayContaining(['Camera follows phase: on', 'Camera follows phase: off'])
  );
  expect(rankSuggestions(all, 'keep my view')[0]?.label).toBe('Camera follows phase: off');
  for (const side of ['on', 'off'] as const) {
    all.find((entry) => entry.key === `look:camera-follows-phase:${side}`)!.run();
    expect(readCameraFollowsPhase()).toBe(side === 'on');
  }
});

const player = (seat: string, name: string, factionName: string | null, own = false) => ({
  seat,
  name,
  factionName,
  token: null,
  unread: 0,
  own,
  canConverse: !own,
  attention: false,
  ally: false,
});

test('"atreides" finds the Atreides faction information ahead of the chat with its player, and opens it on their seat', () => {
  const players = [
    player('seat-1', 'Dana', 'Harkonnen', true),
    player('seat-2', 'Paul', 'Atreides'),
    player('seat-3', 'Ada', 'Fremen'),
  ];
  const window = (key: string, label: string, extra = {}) =>
    ({ key, label, group: 'Players', topic: 'factions', content: null, layout: 'stack', ...extra }) as const;
  const windows = [window('player:seat-2', 'Paul', { player: players[1] }), window('faction-info', 'Faction info')];
  const opened: string[] = [];
  const all = candidatesOf(windows, {
    ...actions(null),
    players,
    open: (key, seat) => opened.push(`${key}@${seat}`),
  });
  const found = rankSuggestions(all, 'atreides');
  expect(found.map((entry) => `${entry.label} · ${entry.hint}`)).toEqual([
    'Atreides · Faction info · Paul',
    'Paul · Atreides',
  ]);
  found[0]!.run();
  expect(opened).toEqual(['faction-info@seat-2']);
  /* The viewer's own faction is found too, and "faction info" finds the window itself and every seat's. */
  expect(rankSuggestions(all, 'harkonnen')[0]).toMatchObject({
    label: 'Harkonnen',
    hint: 'Faction info · You',
  });
  expect(rankSuggestions(all, 'faction info').map((entry) => entry.label)).toEqual(
    expect.arrayContaining(['Faction info', 'Harkonnen', 'Atreides', 'Fremen'])
  );
  /* With nothing typed, the factions wait to be looked up. */
  const suggested = rankSuggestions(all, '').map((entry) => entry.label);
  expect(suggested).toContain('Paul');
  expect(suggested).not.toContain('Atreides');
});

test('"clear" finds Clear all chats only while a chat has messages to clear, and never suggests it unasked', () => {
  let cleared = 0;
  const all = candidatesOf([], { ...actions(null), clearChats: () => cleared++ });
  const found = rankSuggestions(all, 'clear');
  expect(found[0]).toMatchObject({
    label: 'Clear all chats',
    hint: 'Hold to clear; others keep theirs',
    held: 'Clearing',
  });
  found[0]!.run();
  expect(cleared).toBe(1);
  /* It sits below every window and command, so it surfaces only once typed for. */
  expect(found[0]!).toMatchObject({ key: 'cmd:clear-chats' });
  expect(all.find((entry) => entry.key === 'cmd:clear-chats')!.weight).toBeLessThan(0);
  expect(rankSuggestions(all, '').map((entry) => entry.key)).not.toContain('cmd:clear-chats');
  expect(candidatesOf([], { ...actions(null), clearChats: null }).map((entry) => entry.label)).not.toContain(
    'Clear all chats'
  );
});

test('the keyboard shortcuts cheat sheet is found by its name and by its keywords, with ? beside it', () => {
  const sheet = {
    ...PANEL_WINDOWS.shortcuts,
    group: PANEL_WINDOWS.shortcuts.label,
    content: null,
    layout: 'stack' as const,
  };
  const all = candidatesOf([sheet], { ...actions(null), shortcuts: { [sheet.key]: '?' } });
  for (const query of ['keyboard', 'shortcuts', 'help', 'cheat sheet', 'hotkeys']) {
    expect(rankSuggestions(all, query)[0]).toMatchObject({ label: 'Keyboard shortcuts', shortcut: '?' });
  }
});
