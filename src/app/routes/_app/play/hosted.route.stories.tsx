import preview from '@sb/preview';
import { PLAY_FIXTURE_KEY } from '@shared/play/admission';
import { initialSnapshot } from '@shared/play/commands';
import { TABLE_PHASES } from '@shared/play/phases';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref, storybookViewer } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { hostedStoryTransport } from './hostedStoryTransport';

const connectedParameters = {
  identity: { ...storybookViewer, sessionKey: 'hosted-session' },
  database: db((baseline) => {
    baseline.authSessions.push({
      $key: 'hosted-session',
      userId: ref(storybookViewer.subjectKey),
      expirationTime: 4_102_444_800_000,
    });
    baseline.authRefreshTokens.push({ sessionId: ref('hosted-session'), expirationTime: 4_102_444_800_000 });
    baseline.play_games.push({
      fixture_key: PLAY_FIXTURE_KEY,
      state: 'ready',
      secret: 'story-only-secret',
      attempt_id: 'story-attempt',
      provision_expires_at: 4_102_444_800_000,
      created_at: 0,
      confirmed_at: 0,
    });
  }),
};

let transport: ReturnType<typeof hostedStoryTransport>;

function phaseControls(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const controls = () => within(page.getByRole('region', { name: 'Shared phase controls' }));
  /* Canvas can suspend the mounted table while textures load, so each assertion reads the currently visible controls. */
  const waitForPhase = (assert: () => void) =>
    waitFor(
      () => {
        expect(controls().getByRole('button', { name: 'Previous phase' })).toBeVisible();
        expect(controls().getByRole('button', { name: 'Next phase' })).toBeVisible();
        assert();
      },
      { timeout: 30_000 }
    );
  return { page, controls, waitForPhase };
}

function expectHeaderPhase(canvasElement: HTMLElement, phaseIndex: number) {
  const header = canvasElement.ownerDocument.querySelector('.seated-header');
  if (!(header instanceof HTMLElement)) {
    throw new TypeError('The hosted table header is missing.');
  }
  const phase = TABLE_PHASES[phaseIndex];
  expect(within(header).getByRole('img', { name: 'Dune' })).toBeVisible();
  expect(within(header).getByText(phase.label)).toBeVisible();
  expect(header.querySelector('use')).toHaveAttribute('href', `${phase.symbol}#root`);
  expect(within(header).queryByText(/^Phase \d+ of \d+$/)).toBeNull();
  expect(within(header).queryByText(/^(Center|Help|Setup|Lobby)$/)).toBeNull();
}

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Play/Hosted',
  args: { path: '/play/hosted' },
});

export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Sign in to join the hosted table.', {}, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.getByRole('link', { name: /^Sign in$/ })).toHaveAttribute('href', '/auth/login');
    expect(page.getByRole('link', { name: 'Back to lobby' })).toHaveAttribute('href', '/play');
    expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
    expect(canvasElement.ownerDocument.querySelector('.dune-play-shell')).toBeNull();
  },
});

export const SignedInBeforeProvisioning = meta.story({
  parameters: {
    identity: { ...storybookViewer, sessionKey: 'hosted-session' },
    database: db((baseline) => {
      for (const user of baseline.users) {
        user.isAdmin = false;
      }
      baseline.authSessions.push({
        $key: 'hosted-session',
        userId: ref(storybookViewer.subjectKey),
        expirationTime: 4_102_444_800_000,
      });
      baseline.authRefreshTokens.push({ sessionId: ref('hosted-session'), expirationTime: 4_102_444_800_000 });
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText('The hosted table is not available yet.', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.queryByText('Sign in to join the hosted table.')).toBeNull();
    expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
    expect(canvasElement.ownerDocument.querySelector('.dune-play-shell')).toBeNull();
    expect(page.getByRole('link', { name: 'Back to lobby' })).toBeVisible();
  },
});

export const SharedPhaseControls = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    transport = hostedStoryTransport('harkonnen');
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const { page, controls, waitForPhase } = phaseControls(canvasElement);
    await waitForPhase(() => {
      expect(controls().getByRole('button', { name: 'Previous phase' })).toBeDisabled();
      expect(controls().getByRole('button', { name: 'Next phase' })).toBeEnabled();
      expect(page.getByRole('region', { name: 'Storm sector' })).toBeVisible();
      expect(page.getByText(TABLE_PHASES[0].instructions)).toBeVisible();
      expectHeaderPhase(canvasElement, 0);
    });

    await userEvent.click(controls().getByRole('button', { name: 'Next phase' }));
    const command = [...transport.messages].reverse().find((message) => message.type === 'command');
    expect(command?.action).toMatchObject({ kind: 'phase' });
    if (command?.action.kind === 'phase') {
      expect(command.action.direction ?? 1).toBe(1);
    }
    transport.deliver(transport.view({ ...initialSnapshot(), phase: 1, revision: 1 }, command?.commandId));
    await waitForPhase(() => {
      expect(page.getByText(TABLE_PHASES[1].instructions)).toBeVisible();
      expect(page.queryByRole('region', { name: 'Storm sector' })).toBeNull();
      expect(controls().getByRole('button', { name: 'Previous phase' })).toBeEnabled();
      expect(page.getByRole('button', { name: /^Flip/ })).toBeVisible();
      expectHeaderPhase(canvasElement, 1);
    });

    transport.deliver(transport.view({ ...initialSnapshot(), phase: TABLE_PHASES.length, revision: 2 }));
    await waitForPhase(() => expect(controls().getByText('Turn 2')).toBeVisible());
    await userEvent.click(controls().getByRole('button', { name: 'Previous phase' }));
    const previous = [...transport.messages].reverse().find((message) => message.type === 'command');
    expect(previous?.action).toMatchObject({ kind: 'phase', direction: -1 });
    transport.deliver(
      transport.view({ ...initialSnapshot(), phase: TABLE_PHASES.length - 1, revision: 3 }, previous?.commandId)
    );
    await waitForPhase(() => {
      expect(controls().getByText('Turn 1')).toBeVisible();
      expect(page.getByText(TABLE_PHASES[TABLE_PHASES.length - 1].instructions)).toBeVisible();
      expectHeaderPhase(canvasElement, TABLE_PHASES.length - 1);
    });
  },
});

export const ObserverPhaseControls = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    transport = hostedStoryTransport('neutral', { ...initialSnapshot(), phase: 5 });
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const { page, controls, waitForPhase } = phaseControls(canvasElement);
    await waitForPhase(() => {
      expect(controls().getByRole('button', { name: 'Previous phase' })).toBeDisabled();
      expect(controls().getByRole('button', { name: 'Next phase' })).toBeDisabled();
      expect(page.getByText(TABLE_PHASES[5].instructions)).toBeVisible();
      expectHeaderPhase(canvasElement, 5);
    });
    await userEvent.click(controls().getByRole('button', { name: 'Next phase' }));
    expect(transport.messages.some((message) => message.type === 'command')).toBe(false);
  },
});

export const PlaybackKeepsLivePhaseSeparate = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    transport = hostedStoryTransport('harkonnen', { ...initialSnapshot(), phase: 5 });
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const { page, controls, waitForPhase } = phaseControls(canvasElement);
    await waitForPhase(() => expect(page.getByRole('button', { name: 'Replay from start' })).toBeEnabled());
    await userEvent.click(page.getByRole('button', { name: 'Replay from start' }));
    expect(transport.messages).toContainEqual({ type: 'history', step: 0 });
    transport.deliver({ type: 'history', step: 0, lastStep: 1, snapshot: initialSnapshot() });
    await waitForPhase(() => {
      expect(controls().getByRole('button', { name: 'Next phase' })).toBeDisabled();
      expect(controls().getByRole('button', { name: 'Previous phase' })).toBeDisabled();
    });

    transport.deliver(transport.view({ ...initialSnapshot(), phase: 6, revision: 1 }));
    expect(page.getByText(TABLE_PHASES[0].instructions)).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Return to live' }));
    await waitForPhase(() => {
      expect(page.getByText(TABLE_PHASES[6].instructions)).toBeVisible();
      expect(controls().getByRole('button', { name: 'Next phase' })).toBeEnabled();
    });
    expect(transport.messages.some((message) => message.type === 'command')).toBe(false);
  },
});
