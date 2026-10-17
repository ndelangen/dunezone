import preview from '@sb/preview';
import { composeTurn, TABLE_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { openPanel, WAIT } from './controls.stories.fixture';
import { gameMeta, install, lastCommand, session } from './game.stories.fixture';
import { expectHeaderPhase, openTab, phaseControls } from './playing.stories.fixture';
import { productTransport, playingSnapshot as initialSnapshot, playingSnapshot, SIX } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Phases',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/* A seated faction declares a phase before Bidding (#1138): the turn gains one entry, and the header, help and tracker follow it. */
function factionPhaseSnapshot(allPlayersMustBeReady: boolean): GameSnapshot {
  const snapshot = initialSnapshot();
  const factionId = snapshot.roster!.seats[1]!.faction!.id;
  const phases = composeTurn(
    [
      {
        factionId,
        declarations: [
          {
            id: 'negotiations',
            type: 'instruction',
            title: 'Guild negotiations',
            symbol: '/vector/icon/fate.svg',
            before: 'bidding',
            priority: 10,
            allPlayersMustBeReady,
            instructions: 'Agree any shipment deals before bidding opens.',
          },
        ],
      },
    ],
    [factionId]
  );
  return {
    ...snapshot,
    phases,
    phase: phases.findIndex((entry) => entry.kind === 'faction'),
    controls: { ...snapshot.controls!, seats: SIX.map((player) => player.seat), ready: [] },
  };
}

/** The shared phase at Turn 1 Storm: instructions and random storm placement; Determine winner joins them in Mentat Pause (Play/Results). */
export const StormPlacement = meta.story({
  beforeEach: install(() => productTransport('seat-2', playingSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Phase');
    await expect(page.findByRole('button', { name: 'Place storm randomly' }, WAIT)).resolves.toBeVisible();
  },
});

export const Shared = meta.story({
  beforeEach: install(() => productTransport('seat-2')),
  play: async ({ canvasElement }) => {
    const { page, controls, waitForPhase, expectPrevious, pressPrevious } = phaseControls(canvasElement);
    await waitForPhase(() => expect(page.getByRole('tab', { name: 'Game' })).toBeVisible());
    await openTab(page, 'Phase');
    await waitForPhase(async () => {
      await expect(controls().getByRole('button', { name: 'Next phase' })).toBeEnabled();
      await expect(page.getByRole('region', { name: 'Storm sector' })).toBeVisible();
      await expect(page.getByRole('region', { name: TABLE_PHASES[0].label })).toBeVisible();
      await expectHeaderPhase(canvasElement, 0);
    });
    await expectPrevious(false);

    await userEvent.click(controls().getByRole('button', { name: 'Next phase' }));
    const command = lastCommand();
    await expect(command?.action).toMatchObject({ kind: 'phase' });
    if (command?.action.kind === 'phase') {
      await expect(command.action.direction ?? 1).toBe(1);
    }
    session.transport.deliver(
      session.transport.view({ ...initialSnapshot(), phase: 1, revision: 1 }, command?.commandId)
    );
    await waitForPhase(async () => {
      await expect(page.getByRole('region', { name: TABLE_PHASES[1].label })).toBeVisible();
      await expect(page.queryByRole('region', { name: 'Storm sector' })).toBeNull();
      await expect(page.queryByRole('button', { name: 'Replay from start' })).toBeNull();
      await expectHeaderPhase(canvasElement, 1);
    });
    await expectPrevious(true);

    session.transport.deliver(
      session.transport.view({ ...initialSnapshot(), phase: TABLE_PHASES.length, revision: 2 })
    );
    await waitForPhase(() => expect(page.getByText('Turn 2 of 10', { exact: true })).toBeVisible());
    await pressPrevious();
    const previous = lastCommand();
    await expect(previous?.action).toMatchObject({ kind: 'phase', direction: -1 });
    session.transport.deliver(
      session.transport.view({ ...initialSnapshot(), phase: TABLE_PHASES.length - 1, revision: 3 }, previous?.commandId)
    );
    await waitForPhase(async () => {
      await expect(page.queryByRole('button', { name: 'Replay from start' })).toBeNull();
      await expect(page.getByRole('region', { name: TABLE_PHASES[TABLE_PHASES.length - 1].label })).toBeVisible();
      await expectHeaderPhase(canvasElement, TABLE_PHASES.length - 1);
    });
  },
});

export const Observer = meta.story({
  beforeEach: install(() => productTransport('neutral', { ...initialSnapshot(), phase: 5 })),
  play: async ({ canvasElement }) => {
    const { page, controls, waitForPhase, expectPrevious } = phaseControls(canvasElement);
    await waitForPhase(() => expect(page.getByRole('tab', { name: 'Game' })).toBeVisible());
    await openTab(page, 'Phase');
    await waitForPhase(async () => {
      await expect(controls().getByRole('button', { name: 'Next phase' })).toBeDisabled();
      await expect(page.getByRole('region', { name: TABLE_PHASES[5].label })).toBeVisible();
      await expectHeaderPhase(canvasElement, 5);
    });
    await expectPrevious(false);
    await userEvent.click(controls().getByRole('button', { name: 'Next phase' }));
    await expect(session.transport.messages.some((message) => message.type === 'command')).toBe(false);
  },
});

export const FactionPhase = meta.story({
  beforeEach: install(() => productTransport('seat-2', factionPhaseSnapshot(false))),
  play: async ({ canvasElement }) => {
    const { page, waitForPhase } = phaseControls(canvasElement);
    await waitForPhase(() => expect(page.getByRole('tab', { name: 'Game' })).toBeVisible());
    await openTab(page, 'Phase');
    await waitForPhase(() => expect(page.getByRole('region', { name: 'Guild negotiations' })).toBeInTheDocument());
    const phaseTab = page.getByRole('tab', { name: 'Phase' });
    /* The kit's TabGuidance story owns timed tooltip display, since a slow frame here can outlast it; this page checks that the tab receives the phase's description and its instructions as help. */
    await expect(phaseTab).toHaveAccessibleDescription(
      'Guild negotiations, instructions and actions. Agree any shipment deals before bidding opens. Previous changes the tracker only. Pieces and storm position stay as they are.'
    );
    const header = canvasElement.ownerDocument.querySelector('.seated-header') as HTMLElement;
    await expect(within(header).getByText('Guild negotiations')).toBeVisible();
    await expect(header.querySelector('use')).toHaveAttribute('href', '/vector/icon/fate.svg#root');
    await expect(page.queryByRole('button', { name: /^Ready$/ })).toBeNull();
    await expect(page.getByRole('button', { name: 'Next phase' })).toBeEnabled();
  },
});

export const FactionPhaseReadiness = meta.story({
  beforeEach: install(() => productTransport('seat-2', factionPhaseSnapshot(true))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(page.getByRole('button', { name: /^Ready$/ })).toBeVisible(), { timeout: 30_000 });
    const header = canvasElement.ownerDocument.querySelector('.seated-header') as HTMLElement;
    await expect(within(header).getByText('Guild negotiations')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next phase' })).toBeDisabled();
  },
});

export const MentatReadiness = meta.story({
  beforeEach: install(() =>
    productTransport('seat-2', {
      ...initialSnapshot(),
      phase: 8,
      controls: {
        ...initialSnapshot().controls!,
        seats: SIX.map((player) => player.seat),
        ready: ['seat-1', 'seat-3', 'seat-4', 'seat-5', 'seat-6'],
      },
    })
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(page.getByRole('button', { name: /^Ready$/ })).toBeVisible(), { timeout: 30_000 });
    /* Readiness is a phase control: it sits in the header's phase navigation, not on a tab. */
    const navigation = page.getByRole('group', { name: 'Phase navigation' });
    await expect(within(navigation).getByRole('button', { name: /^Ready$/ })).toBeVisible();
    await expect(within(navigation).getByRole('button', { name: /^Ready$/ })).toHaveAccessibleDescription(
      '5 of 6 ready'
    );
    await expect(navigation.closest('header')).not.toBeNull();
    await expect(page.getByRole('button', { name: 'Next phase' })).toBeDisabled();
    await userEvent.click(page.getByRole('button', { name: /^Ready$/ }));
    const command = lastCommand();
    await expect(command?.action).toEqual({ kind: 'ready', ready: true });
    session.transport.deliver(
      session.transport.view(
        {
          ...initialSnapshot(),
          phase: 8,
          revision: 1,
          controls: {
            ...initialSnapshot().controls!,
            seats: SIX.map((player) => player.seat),
            ready: SIX.map((player) => player.seat),
          },
        },
        command?.commandId
      )
    );
    await waitFor(() => expect(page.getByRole('button', { name: 'Next phase' })).toBeEnabled());
    /* Pressed, the same toggle withdraws readiness. */
    const withdraw = page.getByRole('button', { name: /^Ready$/, pressed: true });
    await expect(withdraw).toBeEnabled();
    await expect(withdraw).toHaveAccessibleDescription('6 of 6 ready');
    await expect(session.transport.messages.filter((message) => message.type === 'command')).toHaveLength(1);
    await userEvent.click(withdraw);
    await expect(lastCommand()?.action).toEqual({
      kind: 'ready',
      ready: false,
    });
  },
});

export const Cooldown = meta.story({
  beforeEach: install(() => productTransport('seat-2')),
  play: async ({ canvasElement }) => {
    const { page, waitForPhase, openPrevious } = phaseControls(canvasElement);
    await waitForPhase(() => expect(page.getByRole('button', { name: 'Next phase' })).toBeEnabled());
    /* The menu opens first and stays open, so reading Previous phase cannot outlast the cooldown. */
    const previous = await openPrevious();
    /*
     * The client cools down for as long as the view says, counted from its arrival.
     * The real two seconds can end before a frame that runs seconds late commits the menu item, so this cooldown outlasts every wait below, and the next view ends it.
     */
    session.transport.deliver({
      ...session.transport.view({
        ...initialSnapshot(),
        phase: 1,
        revision: 1,
        controls: {
          ...initialSnapshot().controls!,
          phaseChangedAt: STORYBOOK_NOW - 3_600_000,
        },
      }),
      phaseCooldownMs: 60_000,
    });
    await waitFor(() => expect(page.getByRole('button', { name: 'Next phase' })).toBeDisabled());
    /* The open menu's item re-renders on its own commit, which can land a frame after the button's. */
    await waitFor(() => expect(previous).toBeDisabled());
    const toolbar = canvasElement.ownerDocument.querySelector('.seated-toolbar');
    /* Phase navigation keeps its place at the end of the toolbar, just before the settings gear. */
    await expect(toolbar?.lastElementChild).toHaveClass('seated-toolbar__settings');
    await expect(toolbar?.lastElementChild?.previousElementSibling).toHaveAttribute('aria-label', 'Phase navigation');
    session.transport.deliver({
      ...session.transport.view({
        ...initialSnapshot(),
        phase: 1,
        revision: 2,
        controls: {
          ...initialSnapshot().controls!,
          phaseChangedAt: STORYBOOK_NOW + 3_600_000,
        },
      }),
      phaseCooldownMs: 20,
    });
    await waitFor(() => expect(page.getByRole('button', { name: 'Next phase' })).toBeEnabled());
    await waitFor(() => expect(previous).toBeEnabled());
  },
});

export const PlaybackKeepsLivePhaseSeparate = meta.story({
  beforeEach: install(() => productTransport('seat-2', { ...initialSnapshot(), phase: 5 })),
  play: async ({ canvasElement }) => {
    const { page, controls, waitForPhase, expectPrevious } = phaseControls(canvasElement);
    await waitForPhase(() => expect(page.getByRole('tab', { name: 'Game' })).toBeVisible());
    await openTab(page, 'Replay');
    await waitForPhase(() => expect(page.getByRole('button', { name: 'Replay from start' })).toBeEnabled());
    await userEvent.click(page.getByRole('button', { name: 'Replay from start' }));
    await expect(session.transport.messages).toContainEqual({ type: 'history', step: 0 });
    session.transport.deliver({ type: 'history', step: 0, lastStep: 1, snapshot: initialSnapshot() });
    await waitForPhase(() => expect(controls().getByRole('button', { name: 'Next phase' })).toBeDisabled());
    await expectPrevious(false);

    await openTab(page, 'Phase');
    session.transport.deliver(session.transport.view({ ...initialSnapshot(), phase: 6, revision: 1 }));
    await expect(page.getByRole('region', { name: TABLE_PHASES[0].label })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Return to live' }));
    await waitForPhase(async () => {
      await expectHeaderPhase(canvasElement, 6);
      await expect(controls().getByRole('button', { name: 'Next phase' })).toBeEnabled();
    });
    await expect(session.transport.messages.some((message) => message.type === 'command')).toBe(false);
  },
});

/** A table that agreed on a six-turn game, in its fourth turn: the wheel shows six sectors and the Settings tab its last turn. */
export const ShortGame = meta.story({
  beforeEach: install(() =>
    productTransport('seat-2', {
      ...playingSnapshot(),
      phase: 3 * (playingSnapshot().phases?.length ?? 9),
      lastTurn: 6,
    })
  ),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Settings');
    await expect(page.findByRole('textbox', { name: 'Last turn' }, WAIT)).resolves.toHaveValue('6');
  },
});
