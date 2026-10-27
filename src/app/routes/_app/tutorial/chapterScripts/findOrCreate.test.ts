import { describe, expect, it } from 'vitest';

import { findOrCreate } from './findOrCreate';

describe('findOrCreate.start', () => {
  it('opens the first four tasks on the lobby, with Create a game still closed', () => {
    for (const firstTask of [0, 1, 2, 3]) {
      expect(findOrCreate.start(firstTask)).toEqual({ view: 'lobby', createOpen: false, ruleset: null, created: null });
    }
  });

  it('opens Choose a ruleset on the create page with no ruleset chosen', () => {
    expect(findOrCreate.start(4)).toEqual({ view: 'create', createOpen: true, ruleset: null, created: null });
  });

  it('opens Create the game with Dreamrules chosen', () => {
    expect(findOrCreate.start(5)).toEqual({ view: 'create', createOpen: true, ruleset: 'Dreamrules', created: null });
  });

  it('opens Copy its link on a created game', () => {
    const state = findOrCreate.start(6);
    expect(state.view).toBe('created');
    expect(state.created?.name).toBeTruthy();
    expect(state.created?.address).toMatch(/^[a-z0-9-]+$/);
  });
});
