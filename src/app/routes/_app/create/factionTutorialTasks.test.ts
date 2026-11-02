/** @vitest-environment jsdom */

import { describe, expect, test, vi } from 'vite-plus/test';

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

  test('a name counts two seconds after the last change, or once the learner leaves the box', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<input id="faction-name" value="" /><button>elsewhere</button>';
    const name = FACTION_TUTORIAL_TASKS({ pathname: () => '' }).find((task) => task.id === 'name')!;
    const watch = name.begin(view);
    const box = document.querySelector<HTMLInputElement>('#faction-name')!;
    box.focus();
    vi.advanceTimersByTime(5000);
    expect(name.done(watch, view)).toBe(false);
    box.value = 'S';
    expect(name.done(watch, view)).toBe(false);
    vi.advanceTimersByTime(1500);
    box.value = 'Sand';
    expect(name.done(watch, view)).toBe(false);
    vi.advanceTimersByTime(1500);
    expect(name.done(watch, view)).toBe(false);
    vi.advanceTimersByTime(500);
    expect(name.done(watch, view)).toBe(true);

    const again = name.begin(view);
    box.value = 'Sand Wardens';
    expect(name.done(again, view)).toBe(false);
    document.querySelector('button')!.focus();
    expect(name.done(again, view)).toBe(true);
    vi.useRealTimers();
  });

  test('a rule counts four seconds after the last change, and emptying a box never counts', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<textarea id="rules-revival"></textarea><input id="rules-spice" value="10" />';
    const tasks = FACTION_TUTORIAL_TASKS({ pathname: () => '' });
    const revival = tasks.find((task) => task.id === 'revival')!;
    const watch = revival.begin(view);
    const box = document.querySelector<HTMLTextAreaElement>('#rules-revival')!;
    box.focus();
    box.value = 'Two troops';
    expect(revival.done(watch, view)).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(revival.done(watch, view)).toBe(false);
    box.value = '   ';
    vi.advanceTimersByTime(5000);
    expect(revival.done(watch, view)).toBe(false);
    box.value = 'Two troops revive free.';
    expect(revival.done(watch, view)).toBe(false);
    vi.advanceTimersByTime(4000);
    expect(revival.done(watch, view)).toBe(true);

    const spice = tasks.find((task) => task.id === 'spice')!;
    const spiceWatch = spice.begin(view);
    vi.advanceTimersByTime(5000);
    expect(spice.done(spiceWatch, view)).toBe(false);
    document.querySelector<HTMLInputElement>('#rules-spice')!.value = '12';
    expect(spice.done(spiceWatch, view)).toBe(true);
    vi.useRealTimers();
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

test('opening a tab is a task of its own, done once that tab is selected', () => {
  document.body.innerHTML =
    '<div role="tablist" aria-label="Faction editor sections"><button role="tab" aria-selected="true">Identity</button><button role="tab" aria-selected="false">Leaders 1</button></div>';
  const open = FACTION_TUTORIAL_TASKS({ pathname: () => '' }).find((task) => task.id === 'open-leaders')!;
  const view = { camera: null };
  expect(open.done(undefined, view)).toBe(false);
  document.querySelectorAll('[role="tab"]')[1]!.setAttribute('aria-selected', 'true');
  expect(open.done(undefined, view)).toBe(true);
});
