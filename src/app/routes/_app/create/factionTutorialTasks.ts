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

/** The creator's tab with this label, which a task points at until its field is on screen. */
export const editorTab = (label: string) => (): Element | null =>
  [...document.querySelectorAll(`${TABS} [role="tab"]`)].find((tab) => tab.textContent?.trim() === label) ?? null;

/** The field when its tab is open, otherwise the tab that opens it. */
const fieldOr = (selector: string, tab: string) => () => document.querySelector(selector) ?? editorTab(tab)();

const valueOf = (element: Element | null): string | null =>
  element === null
    ? null
    : element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.value
      : (element.textContent ?? '');

/** A button of the page whose words or label are exactly `name`. */
export const pageButton = (name: string) => (): Element | null =>
  [...document.querySelectorAll('[data-tutorial-pages] button, [data-tutorial-pages] a')].find(
    (button) => button.getAttribute('aria-label') === name || button.textContent?.trim() === name
  ) ?? null;

type Typed = { was: string | null; last: string | null; release: () => void };

/*
 * A text task is done once the text differs from what it was when the learner first saw the box, and they have left it,
 * so the chapter does not move on while they are still typing. Leaving includes opening another tab, which takes the box away,
 * so the task remembers the last text it saw.
 * In a one-line box Enter leaves it too, as it does in Create your own game.
 */
const typed = (selector: string) => ({
  begin: (): Typed => {
    const watch: Typed = { was: null, last: null, release: () => undefined };
    const leave = (event: KeyboardEvent) => {
      const target = event.target as Element | null;
      if (event.key === 'Enter' && target instanceof HTMLInputElement && target.matches(selector)) {
        event.preventDefault();
        target.blur();
      }
    };
    document.addEventListener('keydown', leave, true);
    watch.release = () => document.removeEventListener('keydown', leave, true);
    return watch;
  },
  done: (watch: Typed) => {
    const field = document.querySelector(selector);
    const value = valueOf(field);
    if (value !== null) {
      watch.was ??= value;
      watch.last = value;
    }
    const now = watch.last?.trim() ?? '';
    return now.length > 0 && now !== watch.was?.trim() && (field === null || document.activeElement !== field);
  },
  finish: (watch: Typed) => watch.release(),
});

/** A choice is done once it differs from what it showed when the learner first saw it. */
const chosen = (selector: string) => ({
  begin: () => ({ was: null as string | null }),
  done: (watch: { was: string | null }) => {
    const value = valueOf(document.querySelector(selector));
    if (value === null) {
      return false;
    }
    watch.was ??= value;
    return value !== watch.was;
  },
});

const LEADERS = '[role="list"][aria-label="Ordered supporting leaders"] > [role="listitem"]';
const EDIT_PAGE = /^\/factions\/[^/]+\/edit\/?$/;
const FACTION_PAGE = /^\/factions\/(?!create\/?$)[^/]+\/?$/;

export const FACTION_TUTORIAL_TASKS = (page: FactionChapterPage): GuideTask[] => [
  task({
    id: 'name',
    task: 'Name your faction',
    detail:
      "Let's make a faction of your own! This is a practice copy of Dune Zone that lives only in your browser, so try whatever you like.\n\nType a name for your faction and press {Enter}.",
    introducesSpeakingMode: true,
    anchor: { kind: 'page', element: () => document.querySelector('#faction-name') },
    ...typed('#faction-name'),
  }),
  task({
    id: 'logo',
    task: 'Pick a logo',
    detail:
      'The logo goes on every piece of your faction: its tokens, its cards and its sheet.\n\nOpen the list and pick one you like.',
    anchor: { kind: 'page', element: () => document.querySelector('#faction-logo') },
    ...chosen('#faction-logo'),
  }),
  task({
    id: 'background',
    task: 'Pick a background',
    detail:
      'The background is the pattern behind your tokens and cards. The preview on the right shows it as you choose.\n\nPick a background preset.',
    anchor: { kind: 'page', element: () => document.querySelector('[aria-label="Background preset"]') },
    ...chosen('[aria-label="Background preset"]'),
  }),
  task({
    id: 'faction-leader',
    task: 'Name your faction leader',
    detail:
      "Every faction has a leader who doesn't fight, shown on the faction token.\n\nOpen Faction leader, type their name and press {Enter}.",
    anchor: { kind: 'page', element: fieldOr('#faction-leader-name', 'Faction leader') },
    ...typed('#faction-leader-name'),
  }),
  task({
    id: 'add-leader',
    task: 'Add a supporting leader',
    detail:
      'Supporting leaders are the ones who go into battle. Most factions have five.\n\nOpen Leaders and add one with the plus.',
    anchor: { kind: 'page', element: fieldOr('button[aria-label="Add supporting leader"]', 'Leaders') },
    begin: () => ({ was: null as number | null }),
    done: (watch: { was: number | null }) => {
      if (!document.querySelector('button[aria-label="Add supporting leader"]')) {
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
    anchor: { kind: 'page', element: fieldOr('input[id^="leader-"][id$="-name"]', 'Leaders') },
    ...typed('input[id^="leader-"][id$="-name"]'),
  }),
  task({
    id: 'troops',
    task: 'Name your troops',
    detail:
      'Troops are the tokens you move round the board. The token on the right shows them with your logo and background.\n\nOpen Troops, name them and press {Enter}.',
    anchor: { kind: 'page', element: fieldOr('#troop-0-name', 'Troops') },
    ...typed('#troop-0-name'),
  }),
  task({
    id: 'alliance',
    task: 'Write your alliance advantage',
    detail:
      'When another player allies with you, they get your alliance card. It says what you do for them.\n\nOpen Alliance, write what your ally gets, then click outside the box.',
    anchor: { kind: 'page', element: fieldOr('#rules-alliance', 'Alliance') },
    ...typed('#rules-alliance'),
  }),
  task({
    id: 'start',
    task: 'Say how you start',
    detail:
      'Your faction sheet tells everyone where your troops start the game.\n\nOpen Rules, write your starting instructions, then click outside the box.',
    anchor: { kind: 'page', element: fieldOr('#rules-start', 'Rules') },
    ...typed('#rules-start'),
  }),
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

/** What the learner can do once the chapter is done, listed on its end screen. */
export const FACTION_TUTORIAL_LEARNED = [
  'Name a faction and dress it with a logo and background',
  'Name the faction leader and add supporting leaders',
  'Name the troops and write the alliance advantage',
  'Review the faction sheet, save it and find its page',
];
