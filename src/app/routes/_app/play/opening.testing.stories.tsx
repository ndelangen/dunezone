import { testingPreview } from '@sb/preview';
import { finishTransitions } from '@sb/storyWaits';
import { expect, waitFor, within } from 'storybook/test';

import { gameMeta, install, session } from './game.stories.fixture';
import { nativeGetContext } from './opening.stories.fixture';
import { tablePage } from './playing.stories.fixture';
import { productTransport, playingSnapshot as initialSnapshot } from './product.stories.fixture';

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
