import { task } from '../tutorial/chapterScripts/guideChecks';
import type { GuideTask } from '../tutorial/TutorialGuide';

/*
 * The faction tutorial at /create/faction: the real faction creator, on a practice copy of the site whose database lives in the browser,
 * beside the Play tutorial's rail, one task at a time, moving on when the page shows the learner did it (Norbert, 2026-11-02).
 * Saving works and opens the new faction's own pages, and none of it reaches the site's database.
 */

/** Where the practice copy of the site is, for the tasks that move between its pages. */
export type FactionChapterPage = Readonly<{ pathname: () => string }>;

const TABS = '[role="tablist"][aria-label="Faction editor sections"]';

/** A field of the creator, and the tab it sits on when it is not on the first. */
type Field = Readonly<{ selector: string; tab?: string }>;

const find = (field: Field) => document.querySelector(field.selector);

/** The creator's tab that holds the field, which a task points at until the field is on screen. */
const tabOf = (field: Field): Element | null =>
  [...document.querySelectorAll(`${TABS} [role="tab"]`)].find((tab) => tab.textContent?.trim() === field.tab) ?? null;

/** The field when its tab is open, otherwise the tab that opens it. */
const fieldOrTab = (field: Field) => () => find(field) ?? (field.tab ? tabOf(field) : null);

const valueOf = (element: Element | null): string | null =>
  element === null
    ? null
    : element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.value
      : (element.textContent ?? '');

/** A button of the page whose words or label are exactly `name`. */
const pageButton = (name: string) => (): Element | null =>
  [...document.querySelectorAll('[data-tutorial-pages] button, [data-tutorial-pages] a')].find(
    (button) => button.getAttribute('aria-label') === name || button.textContent?.trim() === name
  ) ?? null;

type Typed = { was: string | null; last: string | null; edited: boolean; release: () => void };

/*
 * A text task is done once the text differs from what it was when the learner first saw the box, and they have left it,
 * so the chapter does not move on while they are still typing. Leaving includes opening another tab, which takes the box away,
 * so the task remembers the last text it saw.
 * In a one-line box Enter leaves it too, as it does in Create your own game.
 * Typing in the box counts as changing it even before the task has read it once, so a learner who types at once is not missed.
 */
/* The one-line box of `field` that Enter was pressed in, if it was. */
function enteredIn(field: Field, event: KeyboardEvent): HTMLInputElement | null {
  if (event.key !== 'Enter') {
    return null;
  }
  const target = event.target;
  return target instanceof HTMLInputElement && target.matches(field.selector) ? target : null;
}

/* Watches the box of `field`: typing in it marks it edited, and Enter in a one-line box leaves it. Returns what stops watching. */
function watchBox(field: Field, watch: Typed): () => void {
  const leave = (event: KeyboardEvent) => {
    const box = enteredIn(field, event);
    if (box) {
      event.preventDefault();
      box.blur();
    }
  };
  const edit = (event: Event) => {
    if (event.target instanceof Element && event.target.matches(field.selector)) {
      watch.edited = true;
    }
  };
  document.addEventListener('keydown', leave, true);
  document.addEventListener('input', edit, true);
  return () => {
    document.removeEventListener('keydown', leave, true);
    document.removeEventListener('input', edit, true);
  };
}

/* Remembers the text the box first showed and the last it showed, so a box another tab took away still counts. */
function readBox(watch: Typed, box: Element | null) {
  const value = valueOf(box);
  if (value !== null) {
    watch.was ??= value;
    watch.last = value;
  }
}

const left = (box: Element | null) => box === null || document.activeElement !== box;

const typed = (field: Field) => ({
  anchor: { kind: 'page' as const, element: fieldOrTab(field) },
  begin: (): Typed => {
    const watch: Typed = { was: null, last: null, edited: false, release: () => undefined };
    readBox(watch, find(field));
    watch.release = watchBox(field, watch);
    return watch;
  },
  done: (watch: Typed) => {
    const box = find(field);
    readBox(watch, box);
    const now = watch.last?.trim() ?? '';
    return now.length > 0 && (watch.edited || now !== watch.was?.trim()) && left(box);
  },
  finish: (watch: Typed) => watch.release(),
});

/* What a picker has chosen, or null while it is open: an open picker shows the learner's search in its box instead. */
const committed = (field: Field): string | null => {
  const picker = find(field);
  return picker?.getAttribute('aria-expanded') === 'true' ? null : valueOf(picker);
};

/** A choice is done once it differs from what it showed as the task began, or when the learner first saw it, and the picker is closed. */
const chosen = (field: Field) => ({
  anchor: { kind: 'page' as const, element: fieldOrTab(field) },
  begin: () => ({ was: committed(field) }),
  done: (watch: { was: string | null }) => {
    const value = committed(field);
    if (value === null) {
      return false;
    }
    watch.was ??= value;
    return value !== watch.was;
  },
});

const ADD_LEADER: Field = { selector: 'button[aria-label="Add supporting leader"]', tab: 'Leaders' };
const LEADERS = '[role="list"][aria-label="Ordered supporting leaders"] > [role="listitem"]';
const EDIT_PAGE = /^\/factions\/[^/]+\/edit\/?$/;
const FACTION_PAGE = /^\/factions\/(?!create\/?$)[^/]+\/?$/;

/* Naming the faction and dressing it, on the creator's first tab. */
const identityTasks = (): GuideTask[] => [
  task({
    id: 'name',
    task: 'Name your faction',
    detail:
      "Let's make a faction of your own! This is a practice copy of Dune Zone that lives only in your browser, so try whatever you like.\n\nType a name for your faction and press {Enter}.",
    introducesSpeakingMode: true,
    ...typed({ selector: '#faction-name' }),
  }),
  task({
    id: 'logo',
    task: 'Pick a logo',
    detail:
      'The logo goes on every piece of your faction: its tokens, its cards and its sheet.\n\nOpen the list and pick one you like.',
    ...chosen({ selector: '#faction-logo' }),
  }),
  task({
    id: 'background',
    task: 'Pick a background',
    detail:
      'The background is the pattern behind your tokens and cards. The preview on the right shows it as you choose.\n\nPick a background preset.',
    ...chosen({ selector: '[aria-label="Background preset"]' }),
  }),
];

/* The faction's people and its rules, each on a tab of its own. */
const rosterTasks = (): GuideTask[] => [
  task({
    id: 'faction-leader',
    task: 'Name your faction leader',
    detail:
      "Every faction has a leader who doesn't fight, shown on the faction token.\n\nOpen Faction leader, type their name and press {Enter}.",
    ...typed({ selector: '#faction-leader-name', tab: 'Faction leader' }),
  }),
  task({
    id: 'add-leader',
    task: 'Add a supporting leader',
    detail:
      'Supporting leaders are the ones who go into battle. Most factions have five.\n\nOpen Leaders and add one with the plus.',
    anchor: { kind: 'page', element: fieldOrTab(ADD_LEADER) },
    begin: () => ({ was: null as number | null }),
    done: (watch: { was: number | null }) => {
      if (!find(ADD_LEADER)) {
        return false;
      }
      const count = document.querySelectorAll(LEADERS).length;
      watch.was ??= count;
      return count > watch.was;
    },
  }),
  task({
    id: 'name-leader',
    task: 'Name your new leader',
    detail:
      'Your new leader has a strength already, one more than the leader before. Give them a name and press {Enter}.',
    ...typed({ selector: 'input[id^="leader-"][id$="-name"]', tab: 'Leaders' }),
  }),
  task({
    id: 'troops',
    task: 'Name your troops',
    detail:
      'Troops are the tokens you move round the board. The token on the right shows them with your logo and background.\n\nOpen Troops, name them and press {Enter}.',
    ...typed({ selector: '#troop-0-name', tab: 'Troops' }),
  }),
  task({
    id: 'alliance',
    task: 'Write your alliance advantage',
    detail:
      'When another player allies with you, they get your alliance card. It says what you do for them.\n\nOpen Alliance, write what your ally gets, then click outside the box.',
    ...typed({ selector: '#rules-alliance', tab: 'Alliance' }),
  }),
  task({
    id: 'start',
    task: 'Say how you start',
    detail:
      'Your faction sheet tells everyone where your troops start the game.\n\nOpen Rules, write your starting instructions, then click outside the box.',
    ...typed({ selector: '#rules-start', tab: 'Rules' }),
  }),
];

/* The sheet, Save, and the page Save gives the faction. */
const finishingTasks = (page: FactionChapterPage): GuideTask[] => [
  task({
    id: 'review',
    task: 'Look over your faction sheet',
    detail:
      'Everything you filled in comes together on the faction sheet.\n\nPress the eye, Review faction sheet, have a look, then close it.',
    anchor: {
      kind: 'page',
      element: () =>
        document.querySelector('[aria-label="Close faction sheet review"]') ?? pageButton('Review faction sheet')(),
    },
    begin: () => ({ seen: false }),
    done: (watch: { seen: boolean }) => {
      if (document.querySelector('[data-review-open]')) {
        watch.seen = true;
        return false;
      }
      return watch.seen;
    },
  }),
  task({
    id: 'save',
    task: 'Save your faction',
    detail:
      "That's a faction! Press Save faction to keep it.\n\nOn the real site this makes it yours, with a page of its own. Here it's saved in your browser only.",
    anchor: { kind: 'page', element: pageButton('Save faction') },
    begin: () => undefined,
    done: () => EDIT_PAGE.test(page.pathname()),
  }),
  task({
    id: 'page',
    task: "Visit your faction's page",
    detail:
      "Saved! You're on its editor now, where you can keep changing it.\n\nPress Back to see the page everyone else sees, with its sheet, tokens and cards.",
    anchor: { kind: 'page', element: pageButton('Back') },
    begin: () => undefined,
    done: () => FACTION_PAGE.test(page.pathname()),
  }),
];

export const FACTION_TUTORIAL_TASKS = (page: FactionChapterPage): GuideTask[] => [
  ...identityTasks(),
  ...rosterTasks(),
  ...finishingTasks(page),
];

/** What the learner can do once the chapter is done, listed on its end screen. */
export const FACTION_TUTORIAL_LEARNED = [
  'Name a faction and dress it with a logo and background',
  'Name the faction leader and add supporting leaders',
  'Name the troops and write the alliance advantage',
  'Review the faction sheet, save it and find its page',
];
