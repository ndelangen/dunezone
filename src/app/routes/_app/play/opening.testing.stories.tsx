import { testingPreview } from '@sb/preview';
import { finishTransitions } from '@sb/storyWaits';
import { createMemoryHistory } from '@tanstack/react-router';
import { expect, waitFor, within } from 'storybook/test';

import { storedAuthTokenKey, STORED_PLAY_TABLE_PREFIX } from '@db/playTables';
import { convexNeverAnswers, STORYBOOK_NOW } from '@db/storybook';

import { storedTableText } from '../../../db/tabletop/storedTable';
import { StorybookPage } from '../../storybook';
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

/* A signed-in player whose table rejects admission must be able to choose a fresh sign-in. */
let recoveryHistory = createMemoryHistory({ initialEntries: ['/play/dreamrules'] });
export const SignsInAfterAdmissionDenied = meta.story({
  args: { path: '/play/dreamrules' },
  render: (args) => <StorybookPage {...args} history={recoveryHistory} />,
  beforeEach: install(() => {
    recoveryHistory = createMemoryHistory({ initialEntries: ['/play/dreamrules'] });
    const transport = productTransport('seat-2', initialSnapshot(), { holdView: true });
    const open = transport.runtime.openSocket.bind(transport.runtime);
    transport.runtime.openSocket = (gameId) => {
      const socket = open(gameId);
      const send = socket.send.bind(socket);
      socket.send = (data) => {
        send(data);
        if (typeof data === 'string' && JSON.parse(data).type === 'admit') {
          queueMicrotask(() => transport.deliver({ type: 'admission', status: 'denied' }));
        }
      };
      return socket;
    };
    return transport;
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const signIn = await page.findByRole('link', { name: 'Sign in again' }, { timeout: 30_000 });
    /* Storybook logs Link clicks; follow the rendered destination through the page router. */
    recoveryHistory.push(signIn.getAttribute('href')!);
    await waitFor(
      async () => {
        await expect(page.getByRole('heading', { name: 'Sign in again', level: 1 })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
        await expect(recoveryHistory.location.pathname).toBe('/auth/login');
        await expect(session.transport.messages.filter((message) => message.type === 'admit')).toHaveLength(1);
      },
      { timeout: 30_000 }
    );
  },
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

type IrisReading = {
  animationName: string;
  mask: string;
  start: number;
  later: number;
  startMask: string;
  laterMask: string;
};

/*
 * Watches for the stage's opening from before the page mounts, so the play function cannot miss it.
 * The runner's headless renderer may never report; the stage then opens on the fallback clock, at the page's next idle moment.
 */
function watchIris(document: Document) {
  return new Promise<IrisReading>((resolve, reject) => {
    /* The phase is caught as React commits it, and the iris is read by seeking its paused animation, so no frame or clock has to keep up. */
    const check = () => {
      const stage = document.querySelector<HTMLElement>('.dune-play-stage');
      if (stage?.dataset.arrival !== 'opening') {
        return;
      }
      observer.disconnect();
      window.clearTimeout(giveUp);
      const shell = document.querySelector<HTMLElement>('.dune-play-shell')!;
      const style = getComputedStyle(shell);
      const animation = shell
        .getAnimations()
        .find((each): each is CSSAnimation => each instanceof CSSAnimation && each.animationName === 'dune-play-enter');
      const radius = (at: number) => {
        animation!.currentTime = at;
        return Number.parseFloat(style.getPropertyValue('--dune-play-iris'));
      };
      const maskAt = (at: number) => {
        animation!.currentTime = at;
        return style.maskImage || style.getPropertyValue('-webkit-mask-image');
      };
      animation?.pause();
      const reading = {
        animationName: style.animationName,
        mask: style.maskImage || style.getPropertyValue('-webkit-mask-image'),
        start: animation ? radius(0) : Number.NaN,
        later: animation ? radius(1200) : Number.NaN,
        startMask: animation ? maskAt(0) : '',
        laterMask: animation ? maskAt(1200) : '',
      };
      animation?.play();
      resolve(reading);
    };
    const observer = new MutationObserver(check);
    /* The renderer's fallback clock opens the stage well inside this bound, even on a loaded runner. */
    const giveUp = window.setTimeout(() => {
      observer.disconnect();
      const arrival = document.querySelector<HTMLElement>('.dune-play-stage')?.dataset.arrival ?? 'no stage';
      reject(new Error(`The stage never reached its opening; it is at ${arrival}.`));
    }, 30_000);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-arrival'],
      childList: true,
    });
    check();
  });
}

let iris: Promise<IrisReading> | undefined;

/* The shell opens through an iris once the renderer is ready; until then it stays closed behind the stage's status line. */
export const OpensThroughAnIris = meta.story({
  globals: { motion: 'on' },
  beforeEach: [
    install(() => productTransport()),
    () => {
      iris = watchIris(document);
      /* A story left before its opening has nothing to report. */
      iris.catch(() => {});
    },
  ],
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const reading = await iris!;
    /* While it opens, the shell widens a radial mask out of the planet. */
    await expect(reading.animationName).toBe('dune-play-enter');
    await expect(reading.mask).toContain('radial-gradient');
    await expect(reading.later).toBeGreaterThan(reading.start);
    /* The mask itself follows the radius, not only the property behind it. */
    await expect(reading.laterMask).toContain('radial-gradient');
    await expect(reading.laterMask).not.toBe(reading.startMask);
    /* Once open, the mask is gone and so is the waiting frame. */
    const { shell } = await tablePage(canvasElement);
    await expect(getComputedStyle(shell).maskImage || 'none').toBe('none');
    await expect(within(document.body).queryByText('Opening the table...')).toBeNull();
  },
});

/*
 * The motion verdict keeps the shell still: no iris, and once the renderer is ready the table is there at once.
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

/* The frame a table route shows while a view is still on its way: the status line under the app's risen planet, with its moons circling. */
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
    await expect(page.getByRole('link', { name: 'Lobby' })).toBeVisible();
    const view = canvasElement.ownerDocument.defaultView!;
    /* The frame marks the voyage, at rest once the planet has risen, so the background carries on turning behind it. */
    await waitFor(() => expect(frame).toHaveAttribute('data-voyage', 'resting'));
    await expect(view.getComputedStyle(frame!.querySelector('[data-orbit]')!).animationName).toMatch(/orbit/);
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
    await expect(page.getByRole('link', { name: 'Lobby' })).toBeVisible();
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
