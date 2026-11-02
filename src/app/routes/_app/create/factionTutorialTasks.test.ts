/** @vitest-environment jsdom */

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

describe('the faction tutorial reading the page', () => {
  const view = { camera: null };

  test('a name typed before the task first looks still counts once the learner leaves the box', () => {
    document.body.innerHTML = '<input id="faction-name" value="New faction" />';
    const name = FACTION_TUTORIAL_TASKS({ pathname: () => '' }).find((task) => task.id === 'name')!;
    const watch = name.begin(view);
    const box = document.querySelector<HTMLInputElement>('#faction-name')!;
    box.focus();
    box.value = 'New faction';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement).not.toBe(box);
    expect(name.done(watch, view)).toBe(true);
    name.finish?.(watch);
  });

  test('a logo picked before the task first looks still counts', () => {
    document.body.innerHTML = '<input id="faction-logo" value="Atreides" />';
    const logo = FACTION_TUTORIAL_TASKS({ pathname: () => '' }).find((task) => task.id === 'logo')!;
    const watch = logo.begin(view);
    document.querySelector<HTMLInputElement>('#faction-logo')!.value = 'Harkonnen';
    expect(logo.done(watch, view)).toBe(true);
  });
});

test('opening a picker, which shows the search in its box, is not a pick', () => {
  document.body.innerHTML = '<input id="faction-logo" value="Atreides" aria-expanded="false" />';
  const logo = FACTION_TUTORIAL_TASKS({ pathname: () => '' }).find((task) => task.id === 'logo')!;
  const view = { camera: null };
  const watch = logo.begin(view);
  const picker = document.querySelector<HTMLInputElement>('#faction-logo')!;
  picker.setAttribute('aria-expanded', 'true');
  picker.value = '';
  expect(logo.done(watch, view)).toBe(false);
  picker.setAttribute('aria-expanded', 'false');
  picker.value = 'Atreides';
  expect(logo.done(watch, view)).toBe(false);
});
