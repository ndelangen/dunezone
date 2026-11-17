/** @vitest-environment jsdom */

import { expect, test, vi } from 'vite-plus/test';

import { VARIANT_TUTORIAL_TASKS } from './variantTutorialTasks';

const view = { camera: null };
const FACTION = '/factions/house-atreides';

/* The Variants card as the faction page draws it: one row per variant, the one being read marked. */
function showVariants(reading: string, names = ['original', 'tournament', 'two-players']) {
  const rows = names.map(
    (name) => `<li><a href="${FACTION}-${name}"${name === reading ? ' aria-current="page"' : ''}>${name}</a></li>`
  );
  document.body.innerHTML = `<div data-tutorial-pages><ul>${rows.join('')}</ul></div>`;
}

function chapter(start = '/factions') {
  const page = { pathname: start };
  const tasks = VARIANT_TUTORIAL_TASKS({ pathname: () => page.pathname });
  return { page, find: (id: string) => tasks.find((task) => task.id === id)!, ids: tasks.map((task) => task.id) };
}

test('the chapter reads a faction first, then makes a variant, then edits it', () => {
  expect(chapter().ids).toEqual(['open', 'switch', 'create', 'name', 'parent', 'edit', 'custom', 'change']);
});

test('opening the faction counts at its own address or a variant of it, and at no other faction', () => {
  const { page, find } = chapter();
  const open = find('open');
  expect(open.done(undefined, view)).toBe(false);
  page.pathname = '/factions/house-atreides-of-old';
  expect(open.done(undefined, view)).toBe(true);
  page.pathname = '/factions/house-atreidesque';
  expect(open.done(undefined, view)).toBe(false);
  page.pathname = '/factions/create';
  expect(open.done(undefined, view)).toBe(false);
  page.pathname = FACTION;
  expect(open.done(undefined, view)).toBe(true);
});

test('switching counts once another variant is the one being read, not on choosing the one already open', () => {
  const { find } = chapter(FACTION);
  const change = find('switch');
  /* The task can start before the Variants card has drawn; the first variant it sees marked is where the learner started. */
  document.body.innerHTML = '';
  const watch = change.begin(view);
  expect(change.done(watch, view)).toBe(false);
  showVariants('original');
  expect(change.done(watch, view)).toBe(false);
  expect(change.anchor.kind === 'page' && change.anchor.element()?.getAttribute('href')).toBe(`${FACTION}-tournament`);
  /* The default's own address shows the same variant as the faction's address did. */
  showVariants('original');
  expect(change.done(watch, view)).toBe(false);
  showVariants('two-players');
  expect(change.done(watch, view)).toBe(true);
});

test('a name counts only while the Create variant form that holds it is open', () => {
  vi.useFakeTimers();
  const { find } = chapter(FACTION);
  document.body.innerHTML =
    '<div data-tutorial-pages><button aria-label="Create variant"></button></div><form aria-label="Create variant"><input value="" /><div role="radiogroup"><input type="radio" /></div></form>';
  const create = find('create');
  expect(create.done(undefined, view)).toBe(true);
  const name = find('name');
  const watch = name.begin(view);
  const box = document.querySelector<HTMLInputElement>('form input:not([type="radio"])')!;
  expect(name.anchor.kind === 'page' && name.anchor.element()).toBe(box);
  box.focus();
  box.value = 'Homebrew';
  expect(name.done(watch, view)).toBe(false);
  vi.advanceTimersByTime(2000);
  expect(name.done(watch, view)).toBe(true);

  /* Closing the form throws the name away, and the arrow goes back to the button that opens it. */
  const again = name.begin(view);
  box.value = 'Homebrew rules';
  document.querySelector('form')!.remove();
  vi.advanceTimersByTime(5000);
  expect(name.done(again, view)).toBe(false);
  expect(name.anchor.kind === 'page' && name.anchor.element()?.getAttribute('aria-label')).toBe('Create variant');
  expect(create.done(undefined, view)).toBe(false);
  vi.useRealTimers();
});

test('creating counts on the page of a variant that was not there before, whatever the learner named it', () => {
  const { page, find } = chapter(`${FACTION}-tournament`);
  showVariants('tournament');
  const parent = find('parent');
  const watch = parent.begin(view);
  expect(parent.done(watch, view)).toBe(false);
  page.pathname = `${FACTION}-two-players`;
  expect(parent.done(watch, view)).toBe(false);
  page.pathname = `${FACTION}-desert-power/edit`;
  expect(parent.done(watch, view)).toBe(false);
  page.pathname = `${FACTION}-desert-power`;
  expect(parent.done(watch, view)).toBe(true);
});

test('a variant made before the name step saw its name counts for the name and the parent', () => {
  const { page, find } = chapter(`${FACTION}-tournament`);
  showVariants('tournament');
  const name = find('name');
  const watch = name.begin(view);
  expect(name.done(watch, view)).toBe(false);
  /* Create variant closed the form and opened the new variant, whose row is now in the Variants card too. */
  page.pathname = `${FACTION}-homebrew`;
  showVariants('homebrew', ['original', 'tournament', 'two-players', 'homebrew']);
  expect(name.done(watch, view)).toBe(true);
  const parent = find('parent');
  expect(parent.done(parent.begin(view), view)).toBe(true);
});

test("the editor counts on the new variant's edit page", () => {
  const { page, find } = chapter(`${FACTION}-homebrew`);
  const edit = find('edit');
  expect(edit.done(undefined, view)).toBe(false);
  page.pathname = '/factions/create';
  expect(edit.done(undefined, view)).toBe(false);
  page.pathname = `${FACTION}-homebrew/edit`;
  expect(edit.done(undefined, view)).toBe(true);
});

const TABS =
  '<div role="tablist" aria-label="Faction editor sections"><button role="tab">Identity</button><button role="tab">Rules 1</button></div>';
const USE_PARENT = '<input type="checkbox" aria-label="Use parent variant for Revival instructions" checked />';

test("a field is the variant's own once Use parent variant is unticked on Revival instructions", () => {
  const { find } = chapter();
  const custom = find('custom');
  const anchor = () => (custom.anchor.kind === 'page' ? custom.anchor.element() : null);
  /* The Rules tab is not open yet, so the arrow is on the tab. */
  document.body.innerHTML = TABS;
  expect(custom.done(undefined, view)).toBe(false);
  expect(anchor()?.textContent).toBe('Rules 1');
  document.body.innerHTML = `${TABS}<input type="checkbox" aria-label="Use parent variant for Starting spice" />${USE_PARENT}`;
  const choice = document.querySelector<HTMLInputElement>('[aria-label$="Revival instructions"]')!;
  expect(anchor()).toBe(choice);
  expect(custom.done(undefined, view)).toBe(false);
  choice.checked = false;
  expect(custom.done(undefined, view)).toBe(true);
});

test('a variant made without a parent has no checkbox, so its open Rules tab is enough', () => {
  const custom = chapter().find('custom');
  document.body.innerHTML = TABS;
  expect(custom.done(undefined, view)).toBe(false);
  document.body.innerHTML = `${TABS}<textarea id="rules-revival">2 troops free.</textarea>`;
  expect(custom.done(undefined, view)).toBe(true);
});

test("the change counts once the learner pauses on a revival rule that differs from the parent's", () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="rules-revival" contenteditable="true" tabindex="0">2 troops free.</div>';
  const change = chapter().find('change');
  const watch = change.begin(view);
  const box = document.querySelector<HTMLElement>('#rules-revival')!;
  box.focus();
  vi.advanceTimersByTime(5000);
  expect(change.done(watch, view)).toBe(false);
  box.textContent = '2 troops free. 3';
  expect(change.done(watch, view)).toBe(false);
  vi.advanceTimersByTime(1500);
  box.textContent = '2 troops free. 3 when you hold Arrakeen.';
  expect(change.done(watch, view)).toBe(false);
  vi.advanceTimersByTime(1500);
  expect(change.done(watch, view)).toBe(false);
  vi.advanceTimersByTime(500);
  expect(change.done(watch, view)).toBe(true);
  vi.useRealTimers();
});
