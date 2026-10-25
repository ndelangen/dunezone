import preview from '@sb/preview';
import { finishTransitions } from '@sb/storyWaits';
import { expect, waitFor, within } from 'storybook/test';

import { storedAuthTokenKey, STORED_PLAY_TABLE_PREFIX } from '@db/playTables';
import { convexNeverAnswers, STORYBOOK_NOW } from '@db/storybook';

import { storedTableText } from '../../../db/tabletop/storedTable';
import { resetTableGraphics, TABLE_GRAPHICS_UNAVAILABLE } from '../../../widgets/tabletop/useTableGraphics';
import { gameMeta, install, session } from './game.stories.fixture';
import { browserGameRuntime } from './multiplayer/gameRuntime';
import { nativeGetContext } from './opening.stories.fixture';
import {
  parameters,
  productTransport,
  playingSnapshot as initialSnapshot,
  playingSnapshot,
} from './product.stories.fixture';

/* The game page before its table opens: an unknown id, provisioning and the ways it can fail. The create form itself is Play/Create. */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Opening',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/* A game this tab kept for a reload, at an address the story's directory never answers for. */
const STORED_GAME = 'stored-game';

/* Takes WebGL2 away and puts `gpu` in place of the browser's WebGPU, then restores both and the probe's answer. */
const withoutGraphics = (gpu: unknown) => () => {
  resetTableGraphics();
  const getContext = nativeGetContext();
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
    return kind === 'webgl2' ? null : Reflect.apply(getContext.value, this, [kind, ...rest]);
  } as HTMLCanvasElement['getContext'];
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: gpu });
  const uninstall = install(() => productTransport())();
  return () => {
    uninstall();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', getContext.descriptor);
    Reflect.deleteProperty(navigator, 'gpu');
    resetTableGraphics();
  };
};

async function expectGraphicsMessage(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const message = await page.findByRole('alert', {}, { timeout: 30_000 });
  await expect(message).toHaveTextContent(TABLE_GRAPHICS_UNAVAILABLE);
  const shell = canvasElement.ownerDocument.querySelector<HTMLElement>('.dune-play-shell')!;
  await waitFor(() => expect(shell.parentElement).toHaveAttribute('data-scene-ready', 'true'));
  await expect(shell.querySelector('canvas')).toBeNull();
  await expect(page.getByRole('button', { name: 'Game menu' })).toBeVisible();
  await expect(page.queryByText('Something went wrong!')).toBeNull();
}

/** An id that names no game reads as not available, like any id the directory cannot find. */
export const UnknownGame = meta.story({
  args: { path: '/play/not-a-game' },
  parameters: parameters('ready'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('This game is not available', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to lobby' })).toHaveAttribute('href', '/play');
    await expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
  },
});

export const Preparing = meta.story({
  parameters: parameters('pending'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByText('Preparing the table', {}, { timeout: 30_000 });
    /* The page moves from the game's id to its slug and draws the status again, so each check finds it afresh. */
    await waitFor(() => expect(finishTransitions(page.getByText('Preparing the table'))).toBeVisible());
    /* The status precedes the ClientOnly share control's first committed render. */
    await expect(page.findByRole('button', { name: 'Copy game link' })).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to lobby' })).toBeVisible();
    await expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
  },
});

export const CatalogueRefused = meta.story({
  parameters: parameters(
    'expired',
    'This ruleset is not ready: spice: Spice deck, Publish every member and back before requesting this asset.'
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* The page moves from the game's id to its slug and draws the message again, so the wait finds it afresh each time. */
    await waitFor(
      async () => {
        await expect(page.getByText('This game could not be prepared')).toBeVisible();
        await expect(page.getByText(/Publish every member and back/)).toBeVisible();
      },
      { timeout: 30_000 }
    );
    await expect(page.queryByText('Preparing the table')).toBeNull();
    await expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
  },
});

export const ProvisionTimedOut = meta.story({
  parameters: parameters('expired'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(
      () =>
        expect(page.getByText('The table was not ready in time. Create the game again from the lobby.')).toBeVisible(),
      { timeout: 30_000 }
    );
  },
});

/** A game link whose server never answers says so after ten seconds, with the Lobby button still there. */
export const GameServerUnreachable = meta.story({
  decorators: [convexNeverAnswers],
  parameters: parameters('ready'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const status = await page.findByText("Can't reach the server. Retrying...", {}, { timeout: 30_000 });
    /* The status line eases in, so the wait finishes its animation rather than waiting on drawn frames. */
    await waitFor(() => expect(finishTransitions(status)).toBeVisible());
    await expect(page.getByRole('link', { name: 'Back to lobby' })).toBeVisible();
    await expect(page.queryByText('Loading the game...')).toBeNull();
  },
});

/* The motion verdict keeps the waiting frame still. */
export const ConnectingStill = meta.story({
  globals: { motion: 'reduce' },
  beforeEach: install(() => productTransport('seat-2', initialSnapshot(), { holdView: true })),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const status = await page.findByText('Connecting to the hosted table...', {}, { timeout: 30_000 });
    const frame = status.closest('[data-connection]')!;
    const view = canvasElement.ownerDocument.defaultView!;
    await expect(view.getComputedStyle(frame, '::before').animationName).toBe('none');
    await expect(view.getComputedStyle(status).animationName).toBe('none');
  },
});

/* A table the browser cannot reach says so through every retry instead of reading as still connecting, and the way back to the lobby stays. */
export const Unreachable = meta.story({
  beforeEach: install(() => productTransport('seat-2', initialSnapshot(), { unreachable: true })),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const status = await page.findByText('The table could not be reached. Reconnecting...', {}, { timeout: 30_000 });
    await waitFor(() => expect(finishTransitions(status)).toBeVisible());
    await expect(page.getByRole('link', { name: 'Back to lobby' })).toBeVisible();
    await expect(page.queryByText('Connecting to the hosted table...')).toBeNull();
  },
});

/* A browser with neither WebGPU nor WebGL2 reads why the table is missing, and the shell around it still opens. */
export const WithoutGraphics = meta.story({
  beforeEach: withoutGraphics(undefined),
  play: async ({ canvasElement }) => expectGraphicsMessage(canvasElement),
});

/* An adapter that answers but refuses its device sends the renderer to WebGL2, which is missing too; its failed start reads the same. */
export const WithoutGraphicsDevice = meta.story({
  beforeEach: withoutGraphics({
    requestAdapter: async () => ({
      features: new Set(),
      limits: {},
      requestDevice: async () => {
        throw new Error('The story refuses the device.');
      },
    }),
    getPreferredCanvasFormat: () => 'bgra8unorm',
  }),
  play: async ({ canvasElement }) => expectGraphicsMessage(canvasElement),
});

/* A tab that lost its connection keeps the last table on screen, read-only, with a reconnecting status beside the logo, until a fresh view arrives. */
export const Reconnecting = meta.story({
  beforeEach: install(() => productTransport('seat-2', playingSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('tab', { name: 'Conversation' });
    session.transport.deliver({ type: 'admission', status: 'suspended' });
    const status = await page.findByRole('status', { name: /^Reconnecting\./ });
    await expect(status.closest('.seated-phase-status')).not.toBeNull();
    await expect(status.closest('[data-connection]')).toHaveAttribute('data-connection', 'suspended');
    await expect(page.getByText('Reconnecting', { exact: true })).toBeVisible();
  },
});

/*
 * A reload while neither the directory nor the table can be reached shows the table this tab kept, locked under the reconnecting bar, instead of the unreachable notice (#1746).
 * The story stands in for the signed-in tab: an auth token naming the transport's viewer, and the table stored under it.
 */
export const ReloadedWhileUnreachable = meta.story({
  args: { path: `/play/${STORED_GAME}` },
  decorators: [convexNeverAnswers],
  beforeEach: () => {
    const transport = productTransport('seat-2', playingSnapshot(), { unreachable: true });
    session.transport = transport;
    session.runtime = transport.runtime;
    const { viewer, snapshot } = transport.view(playingSnapshot());
    const subject = btoa(JSON.stringify({ sub: `${viewer.userId}|story-session` }));
    localStorage.setItem(storedAuthTokenKey(), `story.${subject}.token`);
    const text = storedTableText(
      STORED_GAME,
      { viewer, snapshot, serverNow: STORYBOOK_NOW, pending: [] },
      { userId: viewer.userId, sessionId: 'story-session' },
      Date.now()
    );
    sessionStorage.setItem(`${STORED_PLAY_TABLE_PREFIX}${STORED_GAME}`, text!);
    return () => {
      transport.dispose();
      localStorage.removeItem(storedAuthTokenKey());
      sessionStorage.removeItem(`${STORED_PLAY_TABLE_PREFIX}${STORED_GAME}`);
      session.runtime = browserGameRuntime;
    };
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const bar = await page.findByText('Reconnecting', { exact: true }, { timeout: 30_000 });
    await expect(bar.closest('[data-connection]')).not.toHaveAttribute('data-connection', 'authorized');
    await page.findByRole('tab', { name: 'Conversation' });
    await expect(page.queryByText("Can't reach the server. Retrying...")).toBeNull();
    await expect(session.transport.messages.filter((message) => message.type === 'command')).toEqual([]);
  },
});
