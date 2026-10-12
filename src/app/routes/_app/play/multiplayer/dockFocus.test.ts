import { describe, expect, test } from 'vitest';

import { initialDockFocus, nextDockFocus } from './dockFocus';
import type { DockFocusInput, DockFocusState } from './dockFocus';

const TABS: Record<string, string | null> = {
  storm: 'phase',
  choam: 'spice',
  bidding: 'hand',
  blow: null,
  battle: 'battle',
};

/* Plays renders through the reducer, as the hook does, and returns the focus after each one. */
function play(state: DockFocusState, renders: readonly Partial<DockFocusInput>[]) {
  const seen: (string | null)[] = [];
  for (const render of renders) {
    const phase = render.phase ?? 'play:1:storm';
    state = nextDockFocus(state, {
      playback: false,
      phase,
      phaseTab: TABS[phase.split(':')[2] ?? ''] ?? null,
      events: [],
      ...render,
    });
    seen.push(state.focus?.token ?? null);
  }
  return seen;
}

describe('the dock follows the live table', () => {
  test('the phase the table loaded on keeps the player’s tab, and a later return to it opens its tab', () => {
    const tokens = play(initialDockFocus('play:1:choam', true), [
      { phase: 'play:1:choam' },
      { phase: 'play:1:bidding' },
      { phase: 'play:1:choam' },
    ]);
    expect(tokens[0]).toBeNull();
    expect(tokens[1]).toMatch(/^phase:play:1:bidding#/);
    expect(tokens[2]).toMatch(/^phase:play:1:choam#/);
  });

  test('a table loaded during setup opens the first phase’s tab when play begins', () => {
    const [token] = play(initialDockFocus('setup:1:storm', false), [{ phase: 'play:1:storm' }]);
    expect(token).toMatch(/^phase:play:1:storm#/);
  });

  test('returning to a phase whose tab was the last one opened opens it again', () => {
    const tokens = play(initialDockFocus('play:1:mentat', true), [
      { phase: 'play:1:storm' },
      { phase: 'play:1:blow' },
      { phase: 'play:1:storm' },
    ]);
    expect(tokens[0]).toMatch(/^phase:play:1:storm#/);
    expect(tokens[1]).toBe(tokens[0]);
    expect(tokens[2]).toMatch(/^phase:play:1:storm#/);
    expect(tokens[2]).not.toBe(tokens[0]);
  });

  test('browsing a replay and coming back to live opens nothing', () => {
    const result = { key: 'result', token: 'ending-1' };
    const tokens = play(initialDockFocus('play:1:mentat', true), [
      { phase: 'play:1:battle', events: [result] },
      { phase: 'play:1:storm', playback: true, events: [null] },
      { phase: 'play:1:battle', events: [result] },
    ]);
    expect(tokens[0]).toMatch(/^ending-1#/);
    expect(tokens[2]).toBe(tokens[0]);
  });

  test('a live game that moved on during a replay opens nothing on return, and the next change does', () => {
    const tokens = play(initialDockFocus('play:1:mentat', true), [
      { phase: 'play:1:storm' },
      { phase: 'play:1:storm', playback: true },
      { phase: 'play:1:bidding' },
      { phase: 'play:1:battle', events: [{ key: 'battle', token: 'battle-2' }] },
    ]);
    expect(tokens[2]).toBe(tokens[0]);
    expect(tokens[3]).toMatch(/^battle-2#/);
  });

  test('an event wins over the phase change it arrives with, and goes again only when it comes back', () => {
    const battle = { key: 'battle', token: 'battle-7' };
    const tokens = play(initialDockFocus('play:1:blow', true), [
      { phase: 'play:1:battle', events: [battle] },
      { phase: 'play:1:battle', events: [battle] },
      { phase: 'play:1:battle', events: [null] },
      { phase: 'play:1:battle', events: [battle] },
    ]);
    expect(tokens[0]).toMatch(/^battle-7#/);
    expect(tokens[1]).toBe(tokens[0]);
    expect(tokens[2]).toBe(tokens[0]);
    expect(tokens[3]).toMatch(/^battle-7#/);
    expect(tokens[3]).not.toBe(tokens[0]);
  });
});
