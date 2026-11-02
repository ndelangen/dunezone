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

  test('a name counts once it has two letters and the learner has left the box; Enter in an empty box does not', () => {
    document.body.innerHTML = '<input id="faction-name" value="" />';
    const name = FACTION_TUTORIAL_TASKS({ pathname: () => '' }).find((task) => task.id === 'name')!;
    const watch = name.begin(view);
    const box = document.querySelector<HTMLInputElement>('#faction-name')!;
    const enter = () => box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    box.focus();
    enter();
    expect(name.done(watch, view)).toBe(false);
    box.focus();
    box.value = ' S ';
    enter();
    expect(name.done(watch, view)).toBe(false);
    box.focus();
    box.value = 'Sand Wardens';
    expect(name.done(watch, view)).toBe(false);
    enter();
    expect(document.activeElement).not.toBe(box);
    expect(name.done(watch, view)).toBe(true);
    name.finish?.(watch);
  });

  test('a rule needs three words', () => {
    document.body.innerHTML = '<textarea id="rules-alliance"></textarea>';
    const alliance = FACTION_TUTORIAL_TASKS({ pathname: () => '' }).find((task) => task.id === 'alliance')!;
    const watch = alliance.begin(view);
    const box = document.querySelector<HTMLTextAreaElement>('#rules-alliance')!;
    box.value = 'ok';
    expect(alliance.done(watch, view)).toBe(false);
    box.value = 'Your ally moves further.';
    expect(alliance.done(watch, view)).toBe(true);
    alliance.finish?.(watch);
  });

  test('a logo picked before the task first looks still counts', () => {
    document.body.innerHTML = '<input id="faction-logo" value="Atreides" />';
    const logo = FACTION_TUTORIAL_TASKS({ pathname: () => '' }).find((task) => task.id === 'logo')!;
    const watch = logo.begin(view);
    document.querySelector<HTMLInputElement>('#faction-logo')!.value = 'Harkonnen';
    expect(logo.done(watch, view)).toBe(true);
  });
});

test('opening a picker, which shows the search in its box, is not a pick, nor is closing it unchanged', () => {
  document.body.innerHTML = '<input id="faction-logo" value="Antler Tower" />';
  const logo = FACTION_TUTORIAL_TASKS({ pathname: () => '' }).find((task) => task.id === 'logo')!;
  const view = { camera: null };
  const watch = logo.begin(view);
  const picker = document.querySelector<HTMLInputElement>('#faction-logo')!;
  const list = document.createElement('div');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Artwork');
  document.body.append(list);
  picker.value = '';
  expect(logo.done(watch, view)).toBe(false);
  picker.value = 'Ixian';
  expect(logo.done(watch, view)).toBe(false);
  list.remove();
  picker.value = 'Antler Tower';
  expect(logo.done(watch, view)).toBe(false);
  picker.value = 'Ixian';
  expect(logo.done(watch, view)).toBe(true);
});
