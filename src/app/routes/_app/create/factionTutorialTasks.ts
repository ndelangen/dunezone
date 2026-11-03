import { stageFitsReview } from '@app/widgets/faction-editor/FactionSheetReview';
import { task } from '@app/widgets/tutorial-guide/guideTask';
import type { GuideTask } from '@app/widgets/tutorial-guide/TutorialGuide';

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

/** The creator's tab that holds the field. Its words start with the label: a count of the section's warnings may follow. */
const tabOf = (field: Field): Element | null =>
  (field.tab &&
    [...document.querySelectorAll(`${TABS} [role="tab"]`)].find((tab) =>
      tab.textContent?.trim().startsWith(field.tab!)
    )) ||
  null;

/* In a narrow editor the tabs give way to a section picker, which is where the learner changes section then. */
const SECTION_PICKER = '[data-connected-tabs-mobile-picker] [aria-label="Faction editor sections"]';

const shown = (element: Element | null) => element !== null && element.getBoundingClientRect().width > 0;

/** What the learner uses to open the field's tab: the tab itself, or the section picker while the tabs are hidden. */
const tabControl = (field: Field): Element | null => {
  const tab = tabOf(field);
  return tab && !shown(tab) ? (document.querySelector(SECTION_PICKER) ?? tab) : tab;
};

/** The field when its tab is open, otherwise the tab that opens it. */
const fieldOrTab = (field: Field) => () => find(field) ?? tabControl(field);

const valueOf = (element: Element | null): string | null => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value;
  }
  return element === null ? null : (element.textContent ?? '');
};

/** A button of the page whose words or label are exactly `name`. */
const pageButton = (name: string) => (): Element | null =>
  [...document.querySelectorAll('[data-tutorial-pages] button, [data-tutorial-pages] a')].find(
    (button) => button.getAttribute('aria-label') === name || button.textContent?.trim() === name
  ) ?? null;

/*
 * A text task counts any change the learner makes, once they pause (Norbert, 2026-11-02): two seconds after the last
 * keystroke in a one-line box, four in a text box, where they may still be thinking, or as soon as they leave it.
 * Leaving the box as it was, or emptying it, does not count. The task remembers the last text it saw, as opening
 * another tab takes the box away.
 */
const ONE_LINE_PAUSE = 2000;
const TEXT_PAUSE = 4000;

/* `first` is null until the box is on screen: a box on a tab not yet open has no starting text to compare with. */
type Typed = { first: string | null; last: string; changedAt: number; area: boolean };

/* Records what the box shows now, restarting the pause when it changed. */
function track(watch: Typed, box: Element | null): string {
  const text = valueOf(box);
  if (text === null) {
    return watch.last;
  }
  watch.first ??= text;
  if (text !== watch.last) {
    watch.last = text;
    watch.changedAt = Date.now();
  }
  watch.area ||= box instanceof HTMLTextAreaElement;
  return text;
}

const typed = (field: Field) => ({
  anchor: { kind: 'page' as const, element: fieldOrTab(field) },
  begin: (): Typed => {
    const first = valueOf(find(field));
    return { first, last: first ?? '', changedAt: Date.now(), area: false };
  },
  done: (watch: Typed) => {
    const box = find(field);
    const text = track(watch, box).trim();
    const changed = text.length > 0 && watch.first !== null && text !== watch.first.trim();
    const paused = Date.now() - watch.changedAt >= (watch.area ? TEXT_PAUSE : ONE_LINE_PAUSE);
    const left = box === null || document.activeElement !== box;
    return changed && (paused || left);
  },
});

/* An artwork picker's open list: the creator's artwork pickers show one only while open. */
const ARTWORK_LIST = '[role="listbox"][aria-label="Artwork"]';
const OPEN_PICKER = `${ARTWORK_LIST}, [role="listbox"][aria-label="Artwork collections"]`;

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

type Choice = { was: string | null; picked: boolean; release: () => void };

/*
 * Notes a pick from this field's own artwork list, by click or by Enter on the highlighted option; returns what stops
 * listening. Every artwork picker's list looks alike, so a pick counts only while this field's picker is the open one.
 */
function listenForPick(field: Field, watch: Choice): () => void {
  const mine = () => find(field)?.getAttribute('aria-expanded') === 'true';
  const onOption = (target: EventTarget | null) =>
    target instanceof Element && target.closest(`${ARTWORK_LIST} [role="option"]`) !== null;
  const highlighted = () => document.querySelector(`${ARTWORK_LIST} [data-combobox-selected]`) !== null;
  const click = (event: MouseEvent) => {
    if (mine() && onOption(event.target)) {
      watch.picked = true;
    }
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && mine()) {
      watch.picked ||= highlighted();
    }
  };
  document.addEventListener('click', click, true);
  document.addEventListener('keydown', key, true);
  return () => {
    document.removeEventListener('click', click, true);
    document.removeEventListener('keydown', key, true);
  };
}

/*
 * A choice is done once the picker is closed again on a pick: an option the learner chose, or something other than what
 * it showed as the task began. Opening the picker, or closing it without a pick, leaves the task as it was, even when
 * the picker was already open as the task began.
 */
const chosen = (field: Field) => ({
  anchor: { kind: 'page' as const, element: fieldOrTab(field) },
  begin: (): Choice => {
    const watch: Choice = { was: committed(field), picked: false, release: () => undefined };
    watch.release = listenForPick(field, watch);
    return watch;
  },
  done: (watch: Choice) => {
    const value = committed(field);
    if (value === null) {
      return false;
    }
    if (watch.picked) {
      return true;
    }
    watch.was ??= value;
    return value !== watch.was;
  },
  finish: (watch: Choice) => watch.release(),
});

/* Opening one of the creator's tabs is a task of its own, so the learner sees where each part of a faction lives. */
const opened = (tab: string) => {
  const field: Field = { selector: ':not(*)', tab };
  return {
    anchor: { kind: 'page' as const, element: () => tabControl(field) },
    begin: () => undefined,
    done: () => tabOf(field)?.getAttribute('aria-selected') === 'true',
  };
};

/* Pressing an add button counts once the list has a row: the tutorial's faction starts with none. */
const added = (button: Field, rows: string) => ({
  anchor: { kind: 'page' as const, element: fieldOrTab(button) },
  begin: () => undefined,
  done: () => document.querySelectorAll(rows).length > 0,
});

const ADD_LEADER: Field = { selector: 'button[aria-label="Add supporting leader"]', tab: 'Leaders' };
const ADD_ADVANTAGE: Field = { selector: 'button[aria-label="Add faction advantage"]', tab: 'Advantages' };
const REVIEW_OPEN = '[data-review-open]';
const REVIEW_STAGE = '[data-tutorial-pages] [data-faction-sheet-review]';
const LEADERS = '[role="list"][aria-label="Ordered supporting leaders"] > [role="listitem"]';
const ADVANTAGES = '[role="list"][aria-label="Ordered faction advantages"] > [role="listitem"]';
const EDIT_PAGE = /^\/factions\/[^/]+\/edit\/?$/;
const FACTION_PAGE = /^\/factions\/(?!create\/?$)[^/]+\/?$/;

/* Naming the faction and dressing it, on the creator's first tab. */
const identityTasks = (): GuideTask[] => [
  task({
    id: 'name',
    task: 'Name your faction',
    detail:
      "Let's make a faction of your own! This is a practice copy of Dune Zone that lives only in your browser, so try whatever you like.\n\nType a name for your faction, such as Sand Wardens.",
    introducesSpeakingMode: true,
    ...typed({ selector: '#faction-name' }),
  }),
  task({
    id: 'emblem',
    task: 'Pick an emblem',
    detail:
      'The emblem goes on every piece of your faction: its tokens, its cards and its sheet.\n\nOpen the list and search for one. Try typing Ixian and picking it, or choose any emblem you like.',
    ...chosen({ selector: '#faction-emblem' }),
  }),
  task({
    id: 'background',
    task: 'Pick a background',
    detail:
      'The background is the pattern behind your tokens and cards. The preview on the right shows it as you choose.\n\nOpen Background preset and pick Nexus, or any other preset you like.',
    ...chosen({ selector: '[aria-label="Background preset"]' }),
  }),
];

/* The faction leader, who leads the faction but never fights. */
const factionLeaderTasks = (): GuideTask[] => [
  task({
    id: 'open-faction-leader',
    task: 'Open Faction leader',
    detail: 'The tabs along the top hold each part of your faction. Open Faction leader.',
    ...opened('Faction leader'),
  }),
  task({
    id: 'faction-leader',
    task: 'Name your faction leader',
    detail:
      "Every faction has a leader who doesn't fight. They're shown on your faction sheet.\n\nType their name, such as Wardeness Ilesa.",
    ...typed({ selector: '#faction-leader-name', tab: 'Faction leader' }),
  }),
  task({
    id: 'faction-leader-portrait',
    task: 'Pick their portrait',
    detail:
      'Give your faction leader a face. Open Faction leader portrait and search for Jessica, or pick anyone you like.',
    ...chosen({ selector: '#faction-leader-image', tab: 'Faction leader' }),
  }),
];

/* A supporting leader, who goes into battle. */
const leaderTasks = (): GuideTask[] => [
  task({
    id: 'open-leaders',
    task: 'Open Leaders',
    detail: 'Supporting leaders are the ones who go into battle. Open Leaders.',
    ...opened('Leaders'),
  }),
  task({
    id: 'add-leader',
    task: 'Add a supporting leader',
    detail: 'Most factions have five supporting leaders. Start with one: add them with the plus.',
    ...added(ADD_LEADER, LEADERS),
  }),
  task({
    id: 'name-leader',
    task: 'Name your new leader',
    detail: 'Give your new leader a name, such as Captain Oruk.',
    ...typed({ selector: '#leader-0-name', tab: 'Leaders' }),
  }),
  task({
    id: 'leader-strength',
    task: 'Set their strength',
    detail:
      "A leader's strength is added to the troops they lead in battle. Most leaders are between 1 and 6.\n\nType a strength, such as 5.",
    ...typed({ selector: '#leader-0-str', tab: 'Leaders' }),
  }),
  task({
    id: 'leader-portrait',
    task: 'Pick their portrait',
    detail: 'Open Leader portrait and search for Duncan, or pick anyone you like.',
    ...chosen({ selector: '#leader-0-img', tab: 'Leaders' }),
  }),
];

/* The troops the faction moves round the board. */
const troopTasks = (): GuideTask[] => [
  task({
    id: 'open-troops',
    task: 'Open Troops',
    detail: 'Troops are the tokens you move round the board. Open Troops.',
    ...opened('Troops'),
  }),
  task({
    id: 'troops',
    task: 'Name your troops',
    detail: 'Name your troops, such as Wardens.',
    ...typed({ selector: '#troop-0-name', tab: 'Troops' }),
  }),
  task({
    id: 'troop-symbol',
    task: 'Pick their symbol',
    detail:
      'The symbol is printed on every troop token. The token on the right shows it with your background.\n\nOpen Troop symbol and pick Fremen, or any symbol you like.',
    ...chosen({ selector: '#troop-0-img', tab: 'Troops' }),
  }),
  task({
    id: 'troop-supply',
    task: 'Say how many there are',
    detail:
      'Physical supply is how many of these tokens come in the box. Most factions have 20.\n\nType a number, such as 15.',
    ...typed({ selector: '#troop-0-count', tab: 'Troops' }),
  }),
];

/* The alliance card, and the faction's rules for setup, revival and Karama. */
const ruleTasks = (): GuideTask[] => [
  task({
    id: 'open-alliance',
    task: 'Open Alliance',
    detail: 'When another player allies with you, they get your alliance card. Open Alliance.',
    ...opened('Alliance'),
  }),
  task({
    id: 'alliance',
    task: 'Write your alliance advantage',
    detail: 'Write a sentence on what your ally gets, such as: Your ally may move one extra territory.',
    ...typed({ selector: '#rules-alliance', tab: 'Alliance' }),
  }),
  task({
    id: 'open-rules',
    task: 'Open Rules',
    detail: 'Rules holds how your faction sets up, how it gets its troops back, and its Karama power. Open Rules.',
    ...opened('Rules'),
  }),
  task({
    id: 'start',
    task: 'Say how your troops start',
    detail:
      'Starting instructions say where your troops are when the game begins. Starting spice and revival have boxes of their own, so leave them out here.\n\nWrite a sentence, such as: 10 troops in Sietch Tabr, the rest in reserve.',
    ...typed({ selector: '#rules-start', tab: 'Rules' }),
  }),
  task({
    id: 'spice',
    task: 'Set your starting spice',
    detail:
      'Starting spice is how much spice you begin with. The sheet prints it for you.\n\nType an amount, such as 12.',
    ...typed({ selector: '#rules-spice', tab: 'Rules' }),
  }),
  task({
    id: 'revival',
    task: 'Say how your troops revive',
    detail:
      'Revival instructions say how many troops come back from the Tleilaxu Tanks each turn for free.\n\nWrite a sentence, such as: 2 troops revive for free each turn.',
    ...typed({ selector: '#rules-revival', tab: 'Rules' }),
  }),
  task({
    id: 'karama',
    task: 'Write your Karama power',
    detail:
      "A Karama card lets a faction break one of the rules, once. Say what yours does.\n\nWrite a sentence, such as: Look at one opponent's battle plan before you make yours.",
    ...typed({ selector: '#rules-fate-text', tab: 'Rules' }),
  }),
];

/* An advantage: what the faction does that no other faction does. */
const advantageTasks = (): GuideTask[] => [
  task({
    id: 'open-advantages',
    task: 'Open Advantages',
    detail: 'Advantages are what makes your faction play differently from the rest. Open Advantages.',
    ...opened('Advantages'),
  }),
  task({
    id: 'add-advantage',
    task: 'Add an advantage',
    detail: 'Add your first advantage with the plus.',
    ...added(ADD_ADVANTAGE, ADVANTAGES),
  }),
  task({
    id: 'advantage-title',
    task: 'Give it a title',
    detail: 'A title names the advantage on your faction sheet. Type one, such as Desert Patrol.',
    ...typed({ selector: '#adv-0-title', tab: 'Advantages' }),
  }),
  task({
    id: 'advantage-rule',
    task: 'Write the advantage',
    detail: 'Say what your faction may do, such as: Your troops may move two territories through the desert.',
    ...typed({ selector: '#adv-0-text', tab: 'Advantages' }),
  }),
];

/* The sheet, Save, and the page Save gives the faction. */
const finishingTasks = (page: FactionChapterPage): GuideTask[] => [
  task({
    id: 'review',
    task: 'Look over your faction sheet',
    detail:
      'Everything you filled in comes together on the faction sheet. Planets, Phases and Extras are there for factions that need them; yours is ready without.\n\nPress the eye, Review faction sheet, have a look, then close it.',
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
    /*
     * The sheet opens only on a stage wide enough for it; on a narrower page its button hides or folds into More actions
     * and opening refuses, so there the step passes and a narrow window never leaves the learner stuck before Save.
     */
    done: (watch: { seen: boolean; stop: () => void }) => {
      const stage = document.querySelector<HTMLElement>(REVIEW_STAGE);
      const unavailable = stage !== null && !stageFitsReview(stage);
      return (watch.seen || unavailable) && document.querySelector(REVIEW_OPEN) === null;
    },
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
  ...factionLeaderTasks(),
  ...leaderTasks(),
  ...troopTasks(),
  ...ruleTasks(),
  ...advantageTasks(),
  ...finishingTasks(page),
];

/** What the learner can do once the chapter is done, listed on its end screen. */
export const FACTION_TUTORIAL_LEARNED = [
  'Name a faction and dress it with an emblem and background',
  'Give the faction leader and a supporting leader names and portraits',
  'Name the troops, pick their symbol and say how many there are',
  'Write the alliance card, setup, spice, revival and Karama rules',
  'Add an advantage, review the faction sheet, save it and find its page',
];
