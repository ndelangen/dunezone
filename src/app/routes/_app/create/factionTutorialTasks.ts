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

/** The creator's tab that holds the field, which a task points at until the field is on screen. Its words start with the label: a count of the section's warnings may follow. */
const tabOf = (field: Field): Element | null =>
  (field.tab &&
    [...document.querySelectorAll(`${TABS} [role="tab"]`)].find((tab) =>
      tab.textContent?.trim().startsWith(field.tab!)
    )) ||
  null;

/** The field when its tab is open, otherwise the tab that opens it. */
const fieldOrTab = (field: Field) => () => find(field) ?? tabOf(field);

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

/*
 * The creator opens blank in the tutorial, so a text task asks for real writing rather than any change:
 * a name has two letters or more, and a rule has three words or more. Pressing Enter in an empty box, or typing a
 * space, does not count. The task is done once the text is enough and the learner has left the box,
 * so the chapter does not move on while they are still typing. Leaving includes opening another tab, which takes the box away,
 * so the task remembers the last text it saw. In a one-line box Enter leaves it too, as it does in Create your own game.
 */
type Enough = (text: string) => boolean;

/** A name: two letters or more. */
const aName: Enough = (text) => (text.match(/\p{L}/gu) ?? []).length >= 2;
/** A rule: three words or more. */
const aSentence: Enough = (text) => (text.match(/\p{L}+/gu) ?? []).length >= 3;

type Typed = { last: string; release: () => void };

/* The one-line box of `field` that Enter was pressed in, if it was. */
function enteredIn(field: Field, event: KeyboardEvent): HTMLInputElement | null {
  if (event.key !== 'Enter') {
    return null;
  }
  const target = event.target;
  return target instanceof HTMLInputElement && target.matches(field.selector) ? target : null;
}

/* Enter in the one-line box of `field` leaves it; returns what stops listening. */
function enterLeaves(field: Field): () => void {
  const leave = (event: KeyboardEvent) => {
    const box = enteredIn(field, event);
    if (box) {
      event.preventDefault();
      box.blur();
    }
  };
  document.addEventListener('keydown', leave, true);
  return () => document.removeEventListener('keydown', leave, true);
}

const left = (box: Element | null) => box === null || document.activeElement !== box;

const typed = (field: Field, enough: Enough) => ({
  anchor: { kind: 'page' as const, element: fieldOrTab(field) },
  begin: (): Typed => ({ last: valueOf(find(field)) ?? '', release: enterLeaves(field) }),
  done: (watch: Typed) => {
    const box = find(field);
    watch.last = valueOf(box) ?? watch.last;
    return enough(watch.last) && left(box);
  },
  finish: (watch: Typed) => watch.release(),
});

/* An artwork picker's open list: the logo and background pickers show one only while open. */
const OPEN_PICKER = '[role="listbox"][aria-label="Artwork"], [role="listbox"][aria-label="Artwork collections"]';

/*
 * What a picker has chosen, or null while it is open: an open picker shows the learner's search in its box instead,
 * and an empty box is a search just started, not a choice.
 */
const committed = (field: Field): string | null => {
  if (document.querySelector(OPEN_PICKER)) {
    return null;
  }
  const value = valueOf(find(field))?.trim();
  return value ? value : null;
};

/**
 * A choice is done once the picker is closed again on something other than what it showed as the task began.
 * Opening the picker, or closing it without a pick, leaves the task as it was.
 */
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
const REVIEW_OPEN = '[data-review-open]';
const LEADERS = '[role="list"][aria-label="Ordered supporting leaders"] > [role="listitem"]';
const EDIT_PAGE = /^\/factions\/[^/]+\/edit\/?$/;
const FACTION_PAGE = /^\/factions\/(?!create\/?$)[^/]+\/?$/;

/* Naming the faction and dressing it, on the creator's first tab. */
const identityTasks = (): GuideTask[] => [
  task({
    id: 'name',
    task: 'Name your faction',
    detail:
      "Let's make a faction of your own! This is a practice copy of Dune Zone that lives only in your browser, so try whatever you like.\n\nType a name for your faction, such as Sand Wardens, and press {Enter}.",
    introducesSpeakingMode: true,
    ...typed({ selector: '#faction-name' }, aName),
  }),
  task({
    id: 'logo',
    task: 'Pick a logo',
    detail:
      'The logo goes on every piece of your faction: its tokens, its cards and its sheet.\n\nOpen the list and search for one. Try typing Ixian and picking it, or choose any logo you like.',
    ...chosen({ selector: '#faction-logo' }),
  }),
  task({
    id: 'background',
    task: 'Pick a background',
    detail:
      'The background is the pattern behind your tokens and cards. The preview on the right shows it as you choose.\n\nOpen Background preset and pick Nexus, or any other preset you like.',
    ...chosen({ selector: '[aria-label="Background preset"]' }),
  }),
];

/* The faction's people and its rules, each on a tab of its own. */
const rosterTasks = (): GuideTask[] => [
  task({
    id: 'faction-leader',
    task: 'Name your faction leader',
    detail:
      "Every faction has a leader who doesn't fight, shown on the faction token.\n\nOpen Faction leader, type their name, such as Wardeness Ilesa, and press {Enter}.",
    ...typed({ selector: '#faction-leader-name', tab: 'Faction leader' }, aName),
  }),
  task({
    id: 'add-leader',
    task: 'Add a supporting leader',
    detail:
      'Supporting leaders are the ones who go into battle. Most factions have five; start with one.\n\nOpen Leaders and add one with the plus.',
    anchor: { kind: 'page', element: fieldOrTab(ADD_LEADER) },
    /* The creator opens with no supporting leaders, so any leader on the list is one the learner added. */
    begin: () => undefined,
    done: () => document.querySelectorAll(LEADERS).length > 0,
  }),
  task({
    id: 'name-leader',
    task: 'Name your new leader',
    detail:
      'The number beside your new leader is their strength in battle. Give them a name, such as Captain Oruk, and press {Enter}.',
    ...typed({ selector: 'input[id^="leader-"][id$="-name"]', tab: 'Leaders' }, aName),
  }),
  task({
    id: 'troops',
    task: 'Name your troops',
    detail:
      'Troops are the tokens you move round the board. The token on the right shows them with your logo and background.\n\nOpen Troops, name them, such as Wardens, and press {Enter}.',
    ...typed({ selector: '#troop-0-name', tab: 'Troops' }, aName),
  }),
  task({
    id: 'alliance',
    task: 'Write your alliance advantage',
    detail:
      'When another player allies with you, they get your alliance card. It says what you do for them.\n\nOpen Alliance and write a sentence on what your ally gets, such as: Your ally may move one extra territory. Then click outside the box.',
    ...typed({ selector: '#rules-alliance', tab: 'Alliance' }, aSentence),
  }),
  task({
    id: 'start',
    task: 'Say how you start',
    detail:
      'Your faction sheet tells everyone where your troops start the game.\n\nOpen Rules and write a sentence on where your troops start, such as: 10 troops in Sietch Tabr. Then click outside the box.',
    ...typed({ selector: '#rules-start', tab: 'Rules' }, aSentence),
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
    /* The sheet is watched as the page changes, not only once a frame, so a quick look still counts. */
    begin: () => {
      const watch = { seen: false, stop: () => undefined as void };
      const look = () => {
        watch.seen ||= document.querySelector(REVIEW_OPEN) !== null;
      };
      const observer = new MutationObserver(look);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-review-open'],
      });
      watch.stop = () => observer.disconnect();
      look();
      return watch;
    },
    done: (watch: { seen: boolean; stop: () => void }) => watch.seen && document.querySelector(REVIEW_OPEN) === null,
    finish: (watch: { stop: () => void }) => watch.stop(),
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
