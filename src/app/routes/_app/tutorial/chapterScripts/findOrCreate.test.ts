import { describe, expect, it } from 'vitest';

import { findOrCreate } from './findOrCreate';

describe('findOrCreate.start', () => {
  it('opens the first two tasks on the lobby with an empty search, and Create a game still closed', () => {
    for (const firstTask of [0, 1]) {
      expect(findOrCreate.start(firstTask)).toEqual({
        view: 'lobby',
        query: '',
        shown: 'ongoing',
        createOpen: false,
        ruleset: null,
        created: null,
      });
    }
  });

  it('opens Open seats and Create a game with Thialfi already searched for', () => {
    for (const firstTask of [2, 3]) {
      expect(findOrCreate.start(firstTask)).toMatchObject({ view: 'lobby', query: 'Thialfi', createOpen: false });
    }
  });

  it('opens Choose a ruleset on the create page with no ruleset chosen', () => {
    expect(findOrCreate.start(4)).toMatchObject({ view: 'create', createOpen: true, ruleset: null, created: null });
  });

  it('opens Create the game with Dreamrules chosen', () => {
    expect(findOrCreate.start(5)).toMatchObject({
      view: 'create',
      createOpen: true,
      ruleset: 'Dreamrules',
      created: null,
    });
  });

  it('opens Copy its link on a created game', () => {
    const state = findOrCreate.start(6);
    expect(state.view).toBe('created');
    expect(state.created?.name).toBeTruthy();
    expect(state.created?.address).toMatch(/^[a-z0-9-]+$/);
  });
});
