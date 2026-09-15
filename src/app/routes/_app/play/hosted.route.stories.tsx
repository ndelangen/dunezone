import preview from '@sb/preview';
import { PLAY_FIXTURE_KEY } from '@shared/play/admission';
import { emptyBattlePlan, fixtureCombatFaces } from '@shared/play/battle';
import { initialSnapshot } from '@shared/play/commands';
import { emptyPublicControls } from '@shared/play/inventory';
import { TABLE_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
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
  const controls = () => within(page.getByRole('group', { name: 'Phase navigation' }));
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

/**
 * Opens one tab of the controls panel and waits for its item to become the current one.
 * The scene can suspend the mounted table while textures load, hiding the panel for a moment, so the click is retried until the tab takes.
 */
async function openTab(page: ReturnType<typeof within>, name: 'Shared inventory' | 'Spice' | 'Table' | 'Battle') {
  await waitFor(
    async () => {
      const tab = page.getByRole('button', { name });
      await userEvent.click(tab);
      expect(tab).toHaveAttribute('aria-current', 'true');
    },
    { timeout: 30_000 }
  );
}

/** Waits for the visible panel, which the scene can hide while textures load. */
const settled = (assert: () => void) => waitFor(assert, { timeout: 30_000 });

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
    await waitForPhase(() => expect(page.getByRole('button', { name: 'Table' })).toBeVisible());
    await openTab(page, 'Table');
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
    await waitForPhase(() => expect(page.getByRole('heading', { name: 'Turn 2' })).toBeVisible());
    await userEvent.click(controls().getByRole('button', { name: 'Previous phase' }));
    const previous = [...transport.messages].reverse().find((message) => message.type === 'command');
    expect(previous?.action).toMatchObject({ kind: 'phase', direction: -1 });
    transport.deliver(
      transport.view({ ...initialSnapshot(), phase: TABLE_PHASES.length - 1, revision: 3 }, previous?.commandId)
    );
    await waitForPhase(() => {
      expect(page.getByRole('heading', { name: 'Turn 1' })).toBeVisible();
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
    await waitForPhase(() => expect(page.getByRole('button', { name: 'Table' })).toBeVisible());
    await openTab(page, 'Table');
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
    await waitForPhase(() => expect(page.getByRole('button', { name: 'Table' })).toBeVisible());
    await openTab(page, 'Table');
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

export const MentatReadiness = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    transport = hostedStoryTransport('harkonnen', {
      ...initialSnapshot(),
      phase: 8,
      controls: { ...emptyPublicControls(), seats: ['harkonnen', 'atreides'], ready: ['atreides'] },
    });
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(page.getByRole('button', { name: /^Ready$/ })).toBeVisible(), { timeout: 30_000 });
    /* Readiness is a phase control: it sits in the header's phase navigation, not on a tab. */
    const navigation = page.getByRole('group', { name: 'Phase navigation' });
    expect(within(navigation).getByRole('button', { name: /^Ready$/ })).toBeVisible();
    expect(within(navigation).getByText('1 of 2 ready')).toBeVisible();
    expect(navigation.closest('header')).not.toBeNull();
    expect(page.getByRole('button', { name: 'Next phase' })).toBeDisabled();
    await userEvent.click(page.getByRole('button', { name: /^Ready$/ }));
    const command = [...transport.messages].reverse().find((message) => message.type === 'command');
    expect(command?.action).toEqual({ kind: 'ready', ready: true });
    transport.deliver(
      transport.view(
        {
          ...initialSnapshot(),
          phase: 8,
          revision: 1,
          controls: { ...emptyPublicControls(), seats: ['harkonnen', 'atreides'], ready: ['atreides', 'harkonnen'] },
        },
        command?.commandId
      )
    );
    await waitFor(() => expect(page.getByRole('button', { name: 'Next phase' })).toBeEnabled());
    expect(page.getByRole('button', { name: 'Withdraw readiness' })).toBeEnabled();
    expect(transport.messages.filter((message) => message.type === 'command')).toHaveLength(1);
    await userEvent.click(page.getByRole('button', { name: 'Withdraw readiness' }));
    expect([...transport.messages].reverse().find((message) => message.type === 'command')?.action).toEqual({
      kind: 'ready',
      ready: false,
    });
  },
});

export const PhaseCooldown = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    transport = hostedStoryTransport('harkonnen');
    const cleanup = transport.install();
    return cleanup;
  },
  play: async ({ canvasElement }) => {
    const { page, waitForPhase } = phaseControls(canvasElement);
    await waitForPhase(() => expect(page.getByRole('button', { name: 'Next phase' })).toBeEnabled());
    transport.deliver({
      ...transport.view({
        ...initialSnapshot(),
        phase: 1,
        revision: 1,
        controls: { ...emptyPublicControls(), phaseChangedAt: Date.now() - 3_600_000 },
      }),
      phaseCooldownMs: 8000,
    });
    await waitFor(() => expect(page.getByRole('button', { name: 'Next phase' })).toBeDisabled());
    expect(page.getByRole('button', { name: 'Previous phase' })).toBeDisabled();
    const toolbar = canvasElement.ownerDocument.querySelector('.seated-toolbar');
    expect(toolbar?.lastElementChild).toHaveAttribute('aria-label', 'Phase navigation');
    transport.deliver({
      ...transport.view({
        ...initialSnapshot(),
        phase: 1,
        revision: 2,
        controls: { ...emptyPublicControls(), phaseChangedAt: Date.now() + 3_600_000 },
      }),
      phaseCooldownMs: 20,
    });
    await waitFor(() => expect(page.getByRole('button', { name: 'Next phase' })).toBeEnabled(), { timeout: 2500 });
    expect(page.getByRole('button', { name: 'Previous phase' })).toBeEnabled();
  },
});

/** A hosted table with one shared inventory piece and one pending request from the other seat. */
function pendingRequestTransport() {
  const piece = {
    ...initialSnapshot().table.pieces[0],
    id: 'inventory-token',
    owner: 'shared' as const,
    inventory: 'shared' as const,
    label: 'Recovery tokens',
    items: [
      {
        id: 'inventory-item',
        faceUp: true,
        artwork: {
          front: '/web/logo.svg',
          back: '/web/logo.svg',
          name: 'Recovery token',
          type: 'token-disc',
        },
      },
    ],
  };
  /* Absolute publication references are the wire contract; story images stay on the isolated origin. */
  piece.items[0].artwork.front = new URL('/web/logo.svg', location.origin).href;
  piece.items[0].artwork.back = piece.items[0].artwork.front;
  const initial = initialSnapshot();
  transport = hostedStoryTransport('harkonnen', {
    ...initial,
    table: { ...initial.table, pieces: [...initial.table.pieces, piece] },
    controls: {
      ...emptyPublicControls(),
      seats: ['harkonnen', 'atreides'],
      requests: [
        {
          id: 'pending-token',
          requesterSeat: 'atreides',
          requesterName: 'Another player',
          contents: {
            assetId: 'token',
            name: 'Recovery tokens',
            type: 'token-disc',
            members: [{ assetId: 'token', count: 1 }],
            definitions: [],
            pieces: [piece],
          },
        },
      ],
    },
  });
  return transport.install();
}

export const SharedInventoryRequests = meta.story({
  parameters: connectedParameters,
  beforeEach: pendingRequestTransport,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Approve' }, { timeout: 30_000 })).resolves.toBeEnabled();
    expect(page.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
    expect(page.getByRole('button', { name: 'Drag Recovery tokens onto the table' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Approve' }));
    expect([...transport.messages].reverse().find((message) => message.type === 'command')?.action).toEqual({
      kind: 'spawn-approve',
      requestId: 'pending-token',
    });
    await userEvent.click(page.getByRole('button', { name: 'Dismiss' }));
    expect([...transport.messages].reverse().find((message) => message.type === 'command')?.action).toEqual({
      kind: 'spawn-dismiss',
      requestId: 'pending-token',
    });
    const initial = initialSnapshot();
    transport.deliver(
      transport.view({
        ...initial,
        revision: 1,
        controls: {
          ...emptyPublicControls(),
          seats: ['harkonnen', 'atreides'],
          requests: [
            {
              id: 'own-request',
              requesterSeat: 'harkonnen',
              requesterName: 'Storybook player',
              contents: {
                assetId: 'recovery',
                name: 'Recovery token',
                type: 'token-disc',
                members: [{ assetId: 'recovery', count: 1 }],
                definitions: [],
                pieces: [initial.table.pieces[0]],
              },
            },
          ],
        },
      })
    );
    await waitFor(() => expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled());
    expect(page.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
  },
});

/** At phone width the panel's prose stays: request labels, readiness and status are functional text. */
export const SharedInventoryNarrow = meta.story({
  parameters: connectedParameters,
  globals: { viewport: { value: 'contentColumn' } },
  beforeEach: pendingRequestTransport,
  play: async ({ canvasElement }) => {
    const { page, waitForPhase } = phaseControls(canvasElement);
    await waitForPhase(() => {
      expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();
      expect(page.getByText('Recovery tokens requested by Another player')).toBeVisible();
      expect(page.getByText('Drag an item onto the table. It lands face down.')).toBeVisible();
    });
    await openTab(page, 'Table');
    await waitForPhase(() => expect(page.getByText('Move the storm using the storm controls.')).toBeVisible());
  },
});

/**
 * The accepted frame (#1147): one rail of tabs beside the content it opens, in the accepted order, the host's tabs ahead of the fixture's own.
 * Switching a tab swaps the content and moves the contour;
 * the rail stays where it is.
 */
export const ControlsPanelTabs = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    transport = hostedStoryTransport('harkonnen', {
      ...initialSnapshot(),
      bank: { factionId: 'harkonnen', balance: 4 },
    });
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const rail = () => page.getByRole('navigation', { name: 'Controls' });
    await settled(() => {
      expect(
        within(rail())
          .getAllByRole('button')
          .map((item) => item.getAttribute('aria-label'))
      ).toEqual(['Shared inventory', 'Spice', 'Table']);
      expect(page.getByRole('button', { name: 'Shared inventory' })).toHaveAttribute('aria-current', 'true');
      expect(page.getByRole('heading', { name: 'Shared inventory' })).toBeVisible();
      expect(page.queryByRole('heading', { name: 'Faction bank' })).toBeNull();
    });
    /* Compared as plain numbers: two DOMRects have no own enumerable properties, so toEqual on the rects themselves is always true. */
    const railBox = rail().getBoundingClientRect().toJSON();

    await openTab(page, 'Spice');
    await settled(() => {
      expect(page.getByRole('heading', { name: 'Faction bank' })).toBeVisible();
      expect(page.getByRole('heading', { name: 'Public spice transfers' })).toBeVisible();
      expect(page.queryByRole('heading', { name: 'Shared inventory' })).toBeNull();
    });

    await openTab(page, 'Table');
    await settled(() => {
      expect(page.getByRole('heading', { name: 'Turn 1' })).toBeVisible();
      expect(page.getByRole('heading', { name: 'Hosted connection' })).toBeVisible();
      expect(page.queryByRole('heading', { name: 'Faction bank' })).toBeNull();
      expect(rail().getBoundingClientRect().toJSON()).toEqual(railBox);
    });
    /* The phase controls stay in the header, outside the tabs. */
    expect(page.getByRole('group', { name: 'Phase navigation' }).closest('header')).not.toBeNull();
  },
});

/** A CSS colour as the browser would paint it, so a token's hex and a computed rgb() compare. */
function paintedColor(element: HTMLElement, value: string) {
  const probe = element.ownerDocument.createElement('span');
  probe.style.color = value;
  element.append(probe);
  const painted = element.ownerDocument.defaultView!.getComputedStyle(probe).color;
  probe.remove();
  return painted;
}

/**
 * The panel is a dark-scheme island: its title, eyebrow, prose and controls paint the same in both page schemes, and that paint is the dark tokens, the app's and Mantine's alike.
 * The page scheme is flipped on the document mid-story, which is what the app's own scheme bridge does, so one mount proves both schemes.
 * (Page stories take their scheme from the app chrome, not from the Storybook global.)
 */
export const PanelSchemeIsland = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    transport = hostedStoryTransport('harkonnen');
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const view = document.defaultView!;
    const page = within(document.body);
    await page.findByRole('button', { name: 'Table' }, { timeout: 30_000 });
    await openTab(page, 'Table');
    const title = await page.findByRole('heading', { name: 'Turn 1' });
    const island = title.closest<HTMLElement>('[data-scheme-dark]');
    if (!island) {
      throw new Error('The panel must sit on the dark-scheme island.');
    }
    const root = document.documentElement;
    const token = (element: HTMLElement, name: string) =>
      paintedColor(element, view.getComputedStyle(element).getPropertyValue(name).trim());
    const probes = {
      title: () => view.getComputedStyle(title).color,
      eyebrow: () => view.getComputedStyle(page.getByText('Table trackers')).color,
      inheritedInk: () =>
        view.getComputedStyle(
          page.getByText('Previous changes the tracker only. Pieces and storm position stay as they are.')
        ).color,
      description: () =>
        view.getComputedStyle(
          page.getByText(
            'Select a number on the turn wheel. This changes the turn only, without moving pieces or changing the phase.'
          )
        ).color,
      buttonGround: () => view.getComputedStyle(page.getByRole('button', { name: 'Next turn' })).backgroundColor,
    };
    const paint = () => Object.fromEntries(Object.entries(probes).map(([name, read]) => [name, read()]));

    root.setAttribute('data-mantine-color-scheme', 'light');
    const inLight = paint();
    /* The app's tokens and Mantine's own scheme variables both come from the island, not the page. */
    expect(inLight.title).toBe(token(island, '--color-text'));
    expect(inLight.title).not.toBe(token(root, '--color-text'));
    expect(inLight.eyebrow).toBe(token(island, '--color-link'));
    expect(inLight.eyebrow).not.toBe(token(root, '--color-link'));
    expect(inLight.inheritedInk).toBe(token(island, '--color-text'));
    expect(inLight.description).toBe(token(island, '--mantine-color-dimmed'));
    expect(inLight.description).not.toBe(token(root, '--mantine-color-dimmed'));
    expect(inLight.buttonGround).toBe(token(island, '--mantine-color-default'));
    expect(inLight.buttonGround).not.toBe(token(root, '--mantine-color-default'));

    root.setAttribute('data-mantine-color-scheme', 'dark');
    const inDark = paint();
    expect(inDark).toEqual(inLight);
    expect(token(root, '--color-text')).toBe(inDark.title);

    /* Every tab paints its title with the island's ink, in the dark page scheme as in the light one. */
    const titles: Record<'Shared inventory' | 'Spice' | 'Table', string> = {
      'Shared inventory': 'Shared inventory',
      Spice: 'Public spice transfers',
      Table: 'Turn 1',
    };
    for (const scheme of ['dark', 'light'] as const) {
      root.setAttribute('data-mantine-color-scheme', scheme);
      for (const [tab, heading] of Object.entries(titles) as [keyof typeof titles, string][]) {
        await openTab(page, tab);
        await settled(() =>
          expect(view.getComputedStyle(page.getByRole('heading', { name: heading })).color).toBe(inLight.title)
        );
      }
    }
  },
});

export const CatalogueAdmission = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    transport = hostedStoryTransport('harkonnen', {
      ...initialSnapshot(),
      controls: { ...emptyPublicControls(), seats: ['harkonnen'] },
    });
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(page.getByRole('button', { name: 'Add from catalogue' })).toBeVisible(), {
      timeout: 30_000,
    });
    await userEvent.click(page.getByRole('button', { name: 'Add from catalogue' }));
    const listing = [...transport.messages].reverse().find((message) => message.type === 'catalogue');
    transport.deliver({
      type: 'catalogue',
      requestId: listing!.requestId,
      entries: [
        { type: 'token-disc', slug: 'missing', name: 'Missing back' },
        { type: 'token-disc', slug: 'recovery', name: 'Recovery token' },
      ],
    });
    await userEvent.click(page.getByRole('combobox', { name: 'Catalogue asset' }));
    await userEvent.click(await page.findByRole('option', { name: 'Missing back' }));
    expect(page.getByRole('button', { name: 'Spawn' })).toBeDisabled();
    const missing = [...transport.messages].reverse().find((message) => message.type === 'catalogue');
    transport.deliver({
      type: 'catalogue',
      requestId: missing!.requestId,
      contents: null,
      error: 'This asset has a missing back definition.',
    });
    await waitFor(() => expect(page.getByText('This asset has a missing back definition.')).toBeVisible());
    expect(page.getByRole('button', { name: 'Spawn' })).toBeDisabled();
    await userEvent.click(page.getByRole('combobox', { name: 'Catalogue asset' }));
    await userEvent.clear(page.getByRole('combobox', { name: 'Catalogue asset' }));
    await userEvent.click(await page.findByRole('option', { name: 'Recovery token' }));
    const complete = [...transport.messages].reverse().find((message) => message.type === 'catalogue');
    transport.deliver({
      type: 'catalogue',
      requestId: complete!.requestId,
      contents: {
        assetId: 'recovery',
        name: 'Recovery token',
        type: 'token-disc',
        members: [{ assetId: 'recovery', count: 1 }],
        definitions: [],
        pieces: [initialSnapshot().table.pieces[0]],
      },
    });
    await waitFor(() => expect(page.getByRole('button', { name: 'Spawn' })).toBeEnabled());
    transport.deliver({
      type: 'catalogue',
      requestId: missing!.requestId,
      contents: null,
      error: 'Obsolete catalogue reply',
    });
    await userEvent.click(page.getByRole('combobox', { name: 'Catalogue asset' }));
    await userEvent.keyboard('{Escape}');
    expect(page.getByRole('button', { name: 'Spawn' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Spawn' }));
    expect([...transport.messages].reverse().find((message) => message.type === 'command')?.action).toEqual({
      kind: 'spawn-request',
      type: 'token-disc',
      slug: 'recovery',
    });
    await userEvent.click(page.getByRole('button', { name: 'Close catalogue' }));
    expect(page.queryByRole('combobox', { name: 'Catalogue asset' })).toBeNull();
  },
});

export const PrivateFactionBank = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    transport = hostedStoryTransport('harkonnen', {
      ...initialSnapshot(),
      bank: { factionId: 'harkonnen', balance: 37 },
    });
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(page.getByRole('button', { name: 'Spice' })).toBeVisible(), {
      timeout: 30_000,
    });
    await openTab(page, 'Spice');
    await settled(() => expect(page.getByRole('region', { name: 'Faction bank' })).toBeVisible());
    expect(page.getByLabelText('Banked spice')).toHaveTextContent('37 banked spice');
    expect(page.getByRole('button', { name: 'Take into bank' })).toBeDisabled();
    const amount = page.getByRole('textbox', { name: 'Spice to withdraw' });
    await userEvent.clear(amount);
    await userEvent.type(amount, '38');
    expect(page.getByRole('button', { name: 'Withdraw spice' })).toBeDisabled();
    await userEvent.clear(amount);
    await userEvent.type(amount, '37');
    await userEvent.click(page.getByRole('button', { name: 'Withdraw spice' }));
    const command = [...transport.messages].reverse().find((message) => message.type === 'command');
    expect(command?.action).toEqual({ kind: 'bank-withdraw', amount: 37 });
    transport.deliver(
      transport.view(
        { ...initialSnapshot(), revision: 1, bank: { factionId: 'harkonnen', balance: 0 } },
        command?.commandId
      )
    );
    await waitFor(() => expect(page.getByLabelText('Banked spice')).toHaveTextContent('0 banked spice'));
    expect(page.getByRole('button', { name: 'Withdraw spice' })).toBeDisabled();
    const observer = transport.view({ ...initialSnapshot(), revision: 2 });
    transport.deliver({ ...observer, viewer: { ...observer.viewer, viewerSeat: 'neutral' } });
    await waitFor(() => expect(page.queryByRole('region', { name: 'Faction bank' })).toBeNull());
  },
});

export const PublicSpiceHistory = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    transport = hostedStoryTransport('neutral', {
      ...initialSnapshot(),
      spiceTransfers: Array.from({ length: 20 }, (_, index) => ({
        revision: 40 - index,
        actor: 'Another player',
        kind: 'withdrawal' as const,
        amount: 3,
        source: 'atreides',
        destination: 'table',
      })),
    });
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() => expect(page.getByRole('button', { name: 'Spice' })).toBeVisible());
    await openTab(page, 'Spice');
    await settled(() => expect(page.getByRole('button', { name: 'Earlier spice transfers' })).toBeVisible());
    expect(page.queryByRole('region', { name: 'Faction bank' })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'Earlier spice transfers' }));
    expect(transport.messages.at(-1)).toEqual({ type: 'spice-history', before: 21 });
    transport.deliver({
      type: 'spice-history',
      before: 21,
      more: false,
      entries: [
        {
          revision: 1,
          actor: '[deleted user]',
          kind: 'collection',
          amount: 5,
          source: 'table',
          destination: 'harkonnen',
        },
      ],
    });
    await waitFor(() =>
      expect(page.getByText('[deleted user]: collection, 5 spice from table to harkonnen.')).toBeVisible()
    );
    expect(page.queryByRole('button', { name: 'Earlier spice transfers' })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'Latest spice transfers' }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Earlier spice transfers' })).toBeVisible());
  },
});

export const PrivateBankNarrow = meta.story({
  parameters: connectedParameters,
  globals: { viewport: { value: 'contentColumn' } },
  beforeEach: () => {
    transport = hostedStoryTransport('atreides', { ...initialSnapshot(), bank: { factionId: 'atreides', balance: 0 } });
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() => expect(page.getByRole('button', { name: 'Spice' })).toBeVisible());
    await openTab(page, 'Spice');
    await settled(() => expect(page.getByLabelText('Banked spice')).toBeVisible());
    expect(
      page.getByText(
        'Spice stays on the table until someone collects it. Drop a stack on the supply disc to dispose of it.'
      )
    ).toBeVisible();
    expect(page.getByRole('button', { name: 'Withdraw spice' })).toBeDisabled();
    expect(page.getByRole('button', { name: 'Take into bank' })).toBeDisabled();
  },
});

export const HiddenDeckBacks = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    const snapshot = initialSnapshot();
    const card = {
      ...snapshot.table.pieces.find((piece) => piece.kind === 'card')!,
      id: 'hidden-inventory-deck',
      label: 'Hidden deck',
      inventory: 'shared' as const,
      items: [
        {
          id: 'opaque-card',
          faceUp: false,
          artwork: { back: new URL('/web/logo.svg', location.origin).href, type: 'card-treachery' },
        },
      ],
    };
    snapshot.table.pieces.push(card, {
      ...card,
      id: 'hidden-board-card',
      inventory: undefined,
      position: [0, 0.38, 0],
    });
    transport = hostedStoryTransport('harkonnen', snapshot);
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(page.getByRole('button', { name: 'Drag Hidden deck onto the table' })).toBeVisible(), {
      timeout: 30_000,
    });
    expect(page.getByRole('img', { name: 'Hidden deck' })).toHaveAttribute(
      'src',
      new URL('/web/logo.svg', location.origin).href
    );
    expect(page.getByRole('button', { name: 'Drag Hidden deck onto the table' })).toBeEnabled();
  },
});

function battleStory(stage: 'preparing' | 'countdown' | 'revealed', observer = false): GameSnapshot {
  const plans = ['harkonnen', 'atreides'].map((faction) => emptyBattlePlan(fixtureCombatFaces(faction)));
  return {
    ...initialSnapshot(),
    phase: 6,
    ...(observer ? {} : { bank: { factionId: 'harkonnen', balance: 10 }, hand: [], battlePlan: plans[0] }),
    battle: {
      id: 'story-battle',
      anchor: [0.95, 0.18, -3.05],
      territory: 'Arrakeen',
      stage,
      sides: [
        { factionId: 'harkonnen', ready: stage !== 'preparing', choice: stage === 'revealed' ? 'left' : null },
        { factionId: 'atreides', ready: true, choice: stage === 'revealed' ? 'right' : null },
      ],
      deadline: stage === 'countdown' ? Date.now() + 5000 : null,
      ...(stage === 'revealed' ? { revealed: [plans[0], plans[1]] } : {}),
    },
  };
}

export const BattlePlanner = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    transport = hostedStoryTransport('harkonnen', battleStory('preparing'));
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(() => expect(page.getByRole('button', { name: 'Ready for battle' })).toBeEnabled());
    expect(page.getByRole('textbox', { name: 'Committed spice' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Ready for battle' }));
    expect([...transport.messages].reverse().find((message) => message.type === 'command')?.action).toEqual({
      kind: 'battle-ready',
      battleId: 'story-battle',
      ready: true,
    });
  },
});

export const BattleCountdown = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    transport = hostedStoryTransport('harkonnen', battleStory('countdown'));
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(() => expect(page.getByRole('button', { name: 'Undo Ready' })).toBeEnabled());
    expect(page.getByRole('textbox', { name: 'Committed spice' })).toBeDisabled();
    expect(page.queryByRole('button', { name: 'Cancel battle' })).toBeNull();
  },
});

export const BattleObserver = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    transport = hostedStoryTransport('neutral', battleStory('revealed', true));
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(() => expect(page.getByRole('button', { name: 'No winner' })).toBeDisabled());
    expect(page.queryByRole('textbox', { name: 'Committed spice' })).toBeNull();
    expect(page.queryByRole('region', { name: 'Your hand and leaders' })).toBeNull();
  },
});

export const BattleNumericDraft = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    transport = hostedStoryTransport('harkonnen', battleStory('preparing'));
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    const adjustment = page.getByRole('textbox', { name: 'Adjustment' });
    await userEvent.clear(adjustment);
    await userEvent.type(adjustment, '-0.25');
    expect(transport.messages.filter((message) => message.type === 'command')).toHaveLength(0);
    await userEvent.keyboard('{Enter}');
    const saved = [...transport.messages].reverse().find((message) => message.type === 'command');
    expect(saved?.action).toMatchObject({ kind: 'battle-plan', plan: { adjustment: -0.25 } });
    const troops = page.getByRole('textbox', { name: 'harkonnen front' });
    await userEvent.clear(troops);
    await userEvent.type(troops, '12');
    await userEvent.keyboard('{Enter}');
    expect(transport.messages.filter((message) => message.type === 'command')).toHaveLength(1);
    const snapshot = battleStory('preparing');
    snapshot.revision = 1;
    snapshot.battlePlan!.adjustment = -0.25;
    transport.deliver(transport.view(snapshot, saved!.commandId));
    await settled(() => expect(transport.messages.filter((message) => message.type === 'command')).toHaveLength(2));
    const next = [...transport.messages].reverse().find((message) => message.type === 'command');
    expect(next?.action).toMatchObject({
      kind: 'battle-plan',
      plan: { adjustment: -0.25, troops: [{ faceId: 'harkonnen-front', undialed: 12, dialed: 0 }] },
    });
  },
});

export const BattleResolved = meta.story({
  parameters: connectedParameters,
  beforeEach: () => {
    const snapshot = battleStory('revealed');
    const battle = snapshot.battle!;
    const card = snapshot.table.pieces.find((piece) => piece.kind === 'card' && piece.items.length === 1)!;
    const plans = battle.revealed!;
    plans[0].pieces = [card];
    plans[0].cardIds = [card.id];
    snapshot.battleResults = [
      {
        id: battle.id,
        anchor: battle.anchor,
        territory: battle.territory,
        factions: ['harkonnen', 'atreides'],
        plans,
        outcome: 'left',
        revision: 1,
      },
    ];
    snapshot.battle = null;
    snapshot.battlePlan = null;
    snapshot.hand = [card];
    snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece.id !== card.id);
    snapshot.revision = 1;
    transport = hostedStoryTransport('harkonnen', snapshot);
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Battle');
    await settled(() =>
      expect(page.getByText('Arrakeen: harkonnen against atreides. Left side won.')).toBeInTheDocument()
    );
    expect(page.getByRole('button', { name: 'Drag Treachery card from hand' })).toBeEnabled();
    expect(page.queryByRole('button', { name: 'No winner' })).toBeNull();
  },
});
