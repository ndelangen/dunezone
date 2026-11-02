import { describe, expect, test } from 'vite-plus/test';

import { SAVE_TASK } from './factionTutorialSteps';
import { FACTION_TUTORIAL_TASKS } from './factionTutorialTasks';

describe('the faction tutorial', () => {
  test('`?step` stops at the Save task, the last one a fresh practice copy can open at', () => {
    const tasks = FACTION_TUTORIAL_TASKS({ pathname: () => '/factions/create' });
    expect(tasks[SAVE_TASK - 1]?.id).toBe('save');
    expect(tasks.slice(SAVE_TASK).map((task) => task.id)).toEqual(['page']);
  });

  test('Save counts once the practice copy opens the new faction in its editor, and the last task on its page', () => {
    let pathname = '/factions/create';
    const tasks = FACTION_TUTORIAL_TASKS({ pathname: () => pathname });
    const save = tasks.find((task) => task.id === 'save')!;
    const visit = tasks.find((task) => task.id === 'page')!;
    const view = { camera: null };
    expect(save.done(undefined, view)).toBe(false);
    pathname = '/factions/sand-wardens/edit';
    expect(save.done(undefined, view)).toBe(true);
    expect(visit.done(undefined, view)).toBe(false);
    pathname = '/factions/create';
    expect(visit.done(undefined, view)).toBe(false);
    pathname = '/factions/sand-wardens';
    expect(visit.done(undefined, view)).toBe(true);
  });
});
