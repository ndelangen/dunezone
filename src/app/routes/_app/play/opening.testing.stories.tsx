import { testingPreview } from '@sb/preview';
import { finishTransitions } from '@sb/storyWaits';
import { expect, waitFor, within } from 'storybook/test';

import { storedAuthTokenKey, STORED_PLAY_TABLE_PREFIX } from '@db/playTables';
import { convexNeverAnswers, STORYBOOK_NOW } from '@db/storybook';

import { storedTableText } from '../../../db/tabletop/storedTable';
import { gameMeta, install, session } from './game.stories.fixture';
import { browserGameRuntime } from './multiplayer/gameRuntime';
import { nativeGetContext, withoutGraphics, expectGraphicsMessage } from './opening.stories.fixture';
import { tablePage } from './playing.stories.fixture';
import {
  productTransport,
  playingSnapshot as initialSnapshot,
  parameters,
  playingSnapshot,
} from './product.stories.fixture';

/* The game page before its table opens: an unknown id, provisioning and the ways it can fail. The create form itself is Play/Create. */
const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Opening',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/* The table canvases' WebGL2 contexts, in the order the renderer created them. */
const tableContexts: { context: WebGL2RenderingContext; canvas: HTMLCanvasElement }[] = [];

/* Records every WebGL2 context the table creates, then restores the browser's own lookup. */
const recordTableContexts = () => {
  tableContexts.length = 0;
  const getContext = nativeGetContext();
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
    const context = Reflect.apply(getContext.value, this, [kind, ...rest]);
    const tableContext = kind === 'webgl2' && this.closest('.dune-play-shell') ? context : null;
    if (tableContext && !tableContexts.some((entry) => entry.context === tableContext)) {
      tableContexts.push({ context: tableContext, canvas: this });
    }
    return context;
  } as HTMLCanvasElement['getContext'];
  const uninstall = install(() => productTransport())();
  return () => {
    uninstall();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', getContext.descriptor);
  };
};

/* The shell opens through an iris once the renderer is ready; until then it stays closed behind the stage's status line. */
export const OpensThroughAnIris = meta.story({
  globals: { motion: 'on' },
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { shell, document } = await tablePage(canvasElement);
    const view = document.defaultView!;
    /* The runner's headless renderer may never report; the stage then opens on the fallback clock. */
    await waitFor(() => expect(shell.parentElement).toHaveAttribute('data-scene-ready', 'true'), { timeout: 5000 });
    await expect(view.getComputedStyle(shell).animationName).toBe('dune-play-enter');
    await expect(within(document.body).queryByText('Opening the table...')).toBeNull();
  },
});

/*
 * The motion verdict keeps the shell open and still, before and after the renderer is ready.
 * It also stills the shell's transitions and smooth scrolling, whatever the OS hint says.
 */
export const OpensStill = meta.story({
  beforeEach: install(() => productTransport()),
  globals: { motion: 'reduce' },
  play: async ({ canvasElement }) => {
    const { shell, document } = await tablePage(canvasElement);
    const view = document.defaultView!;
    const picker = within(shell).getByRole('group', { name: 'Table view' });
    for (const element of [shell, within(picker).getAllByRole('button')[0]!]) {
      await expect(Number.parseFloat(view.getComputedStyle(element).transitionDuration)).toBeLessThan(0.001);
      await expect(view.getComputedStyle(element).scrollBehavior).toBe('auto');
    }
    await expect(view.getComputedStyle(shell).clipPath).toBe('none');
    await waitFor(() => expect(shell.parentElement).toHaveAttribute('data-scene-ready', 'true'), { timeout: 5000 });
    await expect(view.getComputedStyle(shell).animationName).toBe('none');
    await expect(view.getComputedStyle(shell).clipPath).toBe('none');
  },
});

/* A dropped socket keeps the table's renderer, since the locked table stays on screen through the reconnect; a table that leaves the page, as it does on a refusal, frees its renderer instead of holding a WebGL context per remount until the browser runs out of them. */
export const ReleasesItsRendererOnRemount = meta.story({
  beforeEach: recordTableContexts,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await tablePage(canvasElement);
    const first = await waitFor(
      async () => {
        await expect(tableContexts[0]).toBeDefined();
        return tableContexts[0]!;
      },
      { timeout: 30_000 }
    );
    session.transport.disconnect();
    await page.findByRole('status', { name: /^Reconnecting\./ });
    await expect(first.canvas.isConnected).toBe(true);
    await waitFor(() => expect(page.queryByRole('status', { name: /^Reconnecting\./ })).toBeNull(), {
      timeout: 30_000,
    });
    await tablePage(canvasElement);
    await expect(tableContexts.at(-1)).toBe(first);
    await expect(first.context.isContextLost()).toBe(false);

    session.transport.deliver({ type: 'admission', status: 'denied' });
    await waitFor(() => expect(first.canvas.isConnected).toBe(false), { timeout: 30_000 });
    await waitFor(() => expect(first.context.isContextLost()).toBe(true), { timeout: 5000 });
  },
});

/* The frame a table route shows while a view is still on its way: the status line on the dark ground, the pool of light breathing behind it. */
export const Connecting = meta.story({
  globals: { motion: 'on' },
  beforeEach: install(() => productTransport('seat-2', initialSnapshot(), { holdView: true })),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const status = await page.findByText('Connecting to the hosted table...', {}, { timeout: 30_000 });
    /* The status line eases in from transparent through a keyframe animation, so the wait finishes it and reads the settled style instead of waiting on drawn frames (https://github.com/ndelangen/dunezone/issues/1413). */
    await waitFor(() => expect(finishTransitions(status)).toBeVisible());
    const frame = status.closest('[data-connection]');
    await expect(frame).toHaveAttribute('data-connection', 'connecting');
    await expect(page.getByRole('link', { name: 'Back to lobby' })).toBeVisible();
    const view = canvasElement.ownerDocument.defaultView!;
    await expect(view.getComputedStyle(frame!, '::before').animationName).toMatch(/breathe/);
    await expect(canvasElement.ownerDocument.querySelector('.dune-play-shell')).toBeNull();
  },
});

/* A game this tab kept for a reload, at an address the story's directory never answers for. */
const STORED_GAME = 'stored-game';

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
    await page.findByRole('button', { name: /^Controls/ }, { timeout: 30_000 });
    await expect(page.queryByText("Can't reach the server. Retrying...")).toBeNull();
    await expect(session.transport.messages.filter((message) => message.type === 'command')).toEqual([]);
  },
});
