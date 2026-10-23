import preview from '@sb/preview';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import type { Decorator } from '@storybook/tanstack-react';
import type { ReactNode } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import type { Vector3Tuple } from 'three';

import { gameMeta, install } from '../play/game.stories.fixture';
import { chapter, JourneyPage } from '../play/journey.stories.fixture';
import { restart, sandbox, sandboxTransport } from '../play/sandbox.stories.fixture';
import { TutorialGuide } from './TutorialGuide';
import type { GuideTask, GuideView } from './TutorialGuide';

/*
 * Chapter 5, "What goes where", as a rough cut: the live sandbox table at the start of turn 1, seen as seat 1.
 * The band above the table gives one task at a time and moves on when the table shows it done.
 */

const START = chapter('Turn 1: Storm') - 1;
const SEAT = 'seat-1';

const snapshot = () => sandbox.table!.frame().snapshot;
const pieces = () => snapshot().table.pieces.filter((piece) => !piece.inventory);
const mine = () => snapshot().bank?.factionId;
const deck = (key: string) => pieces().find((piece) => piece.stackKey === key);
const at = (piece: { position: readonly number[] } | undefined) => (piece ? (piece.position as Vector3Tuple) : null);
const element = (selector: string) => () => document.querySelector(selector);
const tabSelected = (selector: string) => document.querySelector(selector)?.getAttribute('aria-selected') === 'true';
/*
 * A tab task counts the player pressing or arrowing onto that tab from the moment the task starts, so a tab left open by an earlier run does not count.
 * The tab must end up open as well.
 */
const pressedTab = (selector: string) => ({
  begin: () => {
    const watch = { pressed: false, stop: new AbortController() };
    const press = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(selector)) {
        watch.pressed = true;
      }
    };
    /* The tabs open as the keyboard moves onto them as well, which comes as focus without a click. */
    for (const type of ['click', 'focusin']) {
      document.addEventListener(type, press, { capture: true, signal: watch.stop.signal });
    }
    return watch;
  },
  done: (watch: { pressed: boolean }) => watch.pressed && tabSelected(selector),
  finish: (watch: { stop: AbortController }) => watch.stop.abort(),
});

const onBoard = (piece: { position: readonly number[] }) =>
  Math.hypot(piece.position[0]!, piece.position[2]!) < BOARD_RADIUS;
const myTroopsOnBoard = () =>
  pieces().filter((piece) => piece.stackKey?.startsWith(`troops:${mine()}:`) && onBoard(piece)).length;
const cameraX = ({ camera }: GuideView) => camera?.position.x ?? 0;
const cameraDistance = ({ camera }: GuideView) => camera?.position.length() ?? 0;

/* Each task keeps its own kind of baseline; the guide only hands it back. */
const task = <Baseline,>(definition: GuideTask<Baseline>) => definition as unknown as GuideTask;

const TASKS = [
  task({
    id: 'zoom',
    task: 'Look closer at Arrakis',
    detail: 'Scroll down over the board. The camera moves in toward the spot under your pointer.',
    anchor: { kind: 'table', point: () => [0, 0, 0] },
    begin: cameraDistance,
    done: (start, view) => cameraDistance(view) < start * 0.8,
  }),
  task({
    id: 'look-left',
    task: 'Look at the left of the table',
    detail: 'The camera dial, bottom right of the table, jumps the view. Press L.',
    anchor: { kind: 'page', element: element('[aria-label="Focus on left"]') },
    begin: cameraX,
    done: (start, view) => cameraX(view) < start - 1,
  }),
  task({
    id: 'look-back',
    task: 'Go back to the map',
    detail: 'M on the same dial brings the whole board back, with both decks in view.',
    anchor: { kind: 'page', element: element('[aria-label^="Focus on map"]') },
    begin: cameraX,
    done: (start, view) => cameraX(view) > start + 1,
  }),
  task({
    id: 'draw',
    task: 'Draw a Treachery card',
    detail: 'The Treachery deck sits on the left of the table. Right-click it and choose Draw a card.',
    anchor: { kind: 'table', point: () => at(deck('deck:treachery-deck')) },
    begin: () => snapshot().hand?.length ?? 0,
    done: (start) => (snapshot().hand?.length ?? 0) > start,
  }),
  task({
    id: 'ship',
    task: 'Put troops on the board',
    detail: 'Your reserves sit on the rim nearest you. Drag a troop from the stack onto any territory.',
    anchor: {
      kind: 'table',
      point: () => at(pieces().find((piece) => piece.stackKey?.startsWith(`troops:${mine()}:`) && !onBoard(piece))),
    },
    begin: myTroopsOnBoard,
    done: (start) => myTroopsOnBoard() > start,
  }),
  task({
    id: 'spice',
    task: 'Take the top Spice card',
    detail: 'The Spice deck sits on the right of the table. Drag its top card onto the table.',
    anchor: { kind: 'table', point: () => at(deck('deck:spice-deck')) },
    /* A quick drag takes the top card and a held one the whole deck; either way the player has found it. */
    begin: () => snapshot().versions[deck('deck:spice-deck')?.id ?? ''] ?? 0,
    done: (start) => (snapshot().versions[deck('deck:spice-deck')?.id ?? ''] ?? 0) !== start,
  }),
  task({
    id: 'your-spice',
    task: 'Count your spice',
    detail: 'Your own things are in the panel below the table. Open the Spice tab.',
    anchor: { kind: 'page', element: element('[role="tab"][aria-label="Spice"]') },
    ...pressedTab('[role="tab"][aria-label="Spice"]'),
  }),
  task({
    id: 'player-info',
    task: 'See what another player holds',
    detail: 'The players sit on the right of the panel. Open the Info tab of the player shown.',
    anchor: { kind: 'page', element: element('aside[aria-label="Players"] [role="tab"][aria-label="Info"]') },
    ...pressedTab('aside[aria-label="Players"] [role="tab"][aria-label="Info"]'),
  }),
  task({
    id: 'next-phase',
    task: 'Move the game on',
    detail: 'The header says the game is in the Storm. Press Next phase, top right.',
    anchor: {
      kind: 'page',
      element: () =>
        [...document.querySelectorAll('[aria-label="Phase navigation"] button')].find(
          (button) => button.textContent?.trim() === 'Next phase'
        ) ?? null,
    },
    begin: () => snapshot().phase,
    done: (start) => snapshot().phase !== start,
  }),
];

const guideDecorator: Decorator = (Story) => (
  <TutorialGuide
    number={5}
    title="What goes where"
    tasks={TASKS}
    onReset={() => {
      restart({ start: START, seat: SEAT });
      /* Choosing the map view again puts the camera back where the chapter starts, zoom and all. */
      document.querySelector<HTMLButtonElement>('[aria-label^="Focus on map"]')?.click();
    }}
    chaptersLink={({ children, ...props }: { children?: ReactNode }) => (
      <a {...props} href="/tutorial">
        {children}
      </a>
    )}
  >
    <Story />
  </TutorialGuide>
);

const meta = preview.meta({
  ...gameMeta,
  title: 'Tutorial/What goes where',
  component: JourneyPage,
  beforeEach: () => install(() => sandboxTransport({ start: START, seat: SEAT }))(),
  decorators: [...gameMeta.decorators, guideDecorator],
  loaders: [
    async () => {
      await import('../play/multiplayer/HostedTable');
    },
  ],
});

/** The chapter as a player meets it: do what the band says, where the pointer shows, and it moves on by itself. */
export const Chapter = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const band = await page.findByRole('banner', { name: 'Chapter 5: What goes where' }, { timeout: 30_000 });
    await expect(within(band).getByText('Look closer at Arrakis')).toBeVisible();
    await expect(within(band).queryByRole('button', { name: 'Next' })).toBeNull();
    /* The band grows its arrow, a curve-cornered wedge in its outline, once the table has drawn. */
    await waitFor(
      async () => {
        const outline = canvasElement.ownerDocument.querySelector('[data-tutorial-pointer]')!;
        await expect(outline.getAttribute('d') ?? '').toContain('Q');
      },
      { timeout: 30_000 }
    );
  },
});
