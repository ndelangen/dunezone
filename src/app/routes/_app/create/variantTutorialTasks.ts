import { task } from '@app/widgets/tutorial-guide/guideTask';
import type { GuideTask } from '@app/widgets/tutorial-guide/TutorialGuide';

import { fieldOrTab, find, pageButton, typed } from './practicePageChecks';
import type { Field, PracticePage } from './practicePageChecks';

/*
 * The variant tutorial at /create/variant: the real faction pages, on a practice copy of the site whose database lives in the browser,
 * beside the Play tutorial's rail, one task at a time, moving on when the page shows the learner did it (Norbert, 2026-11-17).
 * It starts on the catalogue, opens a faction that has several variants, and ends in the editor of a variant the learner made.
 */

/** The page the practice copy opens on. */
export const VARIANT_TUTORIAL_START = '/factions';

/* The practice copy's faction with several variants (practiceDatabase.ts). */
const FACTION = '/factions/house-atreides';
const PAGES = '[data-tutorial-pages]';
const FACTION_PAGE = /^\/factions\/house-atreides(-[^/]+)?\/?$/;
const VARIANT_PAGE = /^\/factions\/house-atreides-[^/]+$/;
const EDIT_PAGE = /^\/factions\/house-atreides-[^/]+\/edit\/?$/;

const address = (link: Element | undefined) => link?.getAttribute('href') ?? null;

/* The catalogue's card comes after the band's newest arrival, which names the same faction. */
const catalogueCard = () => [...document.querySelectorAll(`${PAGES} a[href^="${FACTION}"]`)].at(-1) ?? null;

/* The Variants card's rows, each the link to its variant. */
const variantRows = () => [...document.querySelectorAll(`${PAGES} li > a[href^="${FACTION}-"]`)];
const isCurrent = (row: Element) => row.getAttribute('aria-current') === 'page';

/* The Create variant form opens in a pane of its own, outside the page it belongs to. */
const CREATE_FORM = 'form[aria-label="Create variant"]';
const createButton = pageButton('Create variant');
const NAME: Field = { selector: `${CREATE_FORM} input:not([type="radio"])` };
const PARENT: Field = { selector: `${CREATE_FORM} [role="radiogroup"]` };

const REVIVAL = 'Revival instructions';
const USE_PARENT: Field = { selector: `input[aria-label="Use parent variant for ${REVIVAL}"]`, tab: 'Rules' };
const REVIVAL_BOX: Field = { selector: '#rules-revival', tab: 'Rules' };

/* Finding a faction in the catalogue and reading another of its variants. */
const readingTasks = (page: PracticePage): GuideTask[] => [
  task({
    id: 'open',
    task: 'Open a faction',
    detail:
      'This is a practice copy of Dune Zone that lives only in your browser, so try whatever you like.\n\nEvery faction has one card here. Open House Atreides.',
    introducesSpeakingMode: true,
    anchor: { kind: 'page', element: catalogueCard },
    begin: () => undefined,
    done: () => FACTION_PAGE.test(page.pathname()),
  }),
  task({
    id: 'switch',
    task: 'Switch variant',
    detail:
      'A faction can have several variants: the same faction, played another way.\n\nChoose another in the Variants card.',
    anchor: { kind: 'page', element: () => variantRows().find((row) => !isCurrent(row)) ?? null },
    /* The variant being read is the marked row: the faction's own address opens its default, which has an address of its own too. */
    begin: () => ({ from: address(variantRows().find(isCurrent)) }),
    done: (watch: { from: string | null }) => {
      const reading = address(variantRows().find(isCurrent));
      watch.from ??= reading;
      return reading !== null && reading !== watch.from;
    },
  }),
];

/* A variant of the learner's own, from the Create variant form. */
const creatingTasks = (page: PracticePage): GuideTask[] => {
  const name = typed(NAME);
  return [
    task({
      id: 'create',
      task: 'Press Create variant',
      detail: 'Want this faction to play your way? Give it a variant of your own.\n\nPress Create variant.',
      anchor: { kind: 'page', element: createButton },
      begin: () => undefined,
      done: () => document.querySelector(CREATE_FORM) !== null,
    }),
    task({
      id: 'name',
      task: 'Name your variant',
      detail:
        "Say what sets it apart. It is always shown beside the faction's name, so leave that out.\n\nType a name, such as Homebrew.",
      ...name,
      anchor: { kind: 'page', element: () => find(NAME) ?? createButton() },
      /* A form closed with a name in it has lost the name, so only a name in an open form counts. */
      done: (watch: ReturnType<typeof name.begin>) => name.done(watch) && find(NAME) !== null,
    }),
    task({
      id: 'parent',
      task: 'Pick a parent and create it',
      detail:
        'Your variant uses its parent in every field until you change one. The parent is chosen once.\n\nKeep the one offered, then press Create variant.',
      anchor: { kind: 'page', element: () => find(PARENT) ?? createButton() },
      /* The variants there were, so opening one of those does not count as making one. */
      begin: () => ({ known: variantRows().map(address) }),
      done: (watch: { known: (string | null)[] }) => {
        const pathname = page.pathname().replace(/\/$/, '');
        return watch.known.length > 0 && VARIANT_PAGE.test(pathname) && !watch.known.includes(pathname);
      },
    }),
  ];
};

/* One field of the new variant made its own, in the faction editor. */
const editingTasks = (page: PracticePage): GuideTask[] => [
  task({
    id: 'edit',
    task: 'Open the editor',
    detail: 'This is your new variant. For now it reads just like its parent.\n\nPress the pencil, Edit faction.',
    anchor: { kind: 'page', element: pageButton('Edit faction') },
    begin: () => undefined,
    done: () => EDIT_PAGE.test(page.pathname()),
  }),
  task({
    id: 'custom',
    task: 'Make one field your own',
    detail: `Each field has a Use parent variant checkbox. Ticked, it shows the parent's value, read-only.\n\nOpen Rules and untick it on ${REVIVAL}.`,
    anchor: { kind: 'page', element: fieldOrTab(USE_PARENT) },
    begin: () => undefined,
    /* A variant made without a parent has no checkbox and every field its own, so there the open Rules tab is enough. */
    done: () => {
      const choice = document.querySelector<HTMLInputElement>(USE_PARENT.selector);
      return choice ? !choice.checked : find(REVIVAL_BOX) !== null;
    },
  }),
  task({
    id: 'change',
    task: 'Change it',
    detail: `Now ${REVIVAL} is yours. The other fields keep following the parent.\n\nType your own revival rule.`,
    ...typed(REVIVAL_BOX),
  }),
];

export const VARIANT_TUTORIAL_TASKS = (page: PracticePage): GuideTask[] => [
  ...readingTasks(page),
  ...creatingTasks(page),
  ...editingTasks(page),
];

/** What the learner can do once the chapter is done, listed on its end screen. */
export const VARIANT_TUTORIAL_LEARNED = [
  'Find a faction in the catalogue and switch between its variants',
  'Create a variant of your own and choose its parent',
  'Make one field custom and keep the rest following the parent',
];
