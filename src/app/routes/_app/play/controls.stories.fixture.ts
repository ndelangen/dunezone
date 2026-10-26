import { expect, userEvent, waitFor, within } from 'storybook/test';

import { press } from './gameInteractions.stories.fixture';

/*
 * The shortcut the Play stories share: open one window of the controls through the compass,
 * so a story shows a panel in one state without finding its way there first.
 */

type Page = ReturnType<typeof within>;

/* The window a panel opens in: Hand and Spice share one. */
const WINDOW_OF: Record<string, string> = { Hand: 'Hand & spice', Spice: 'Hand & spice' };

/** The window named for a panel, by the label on its frame, which groups the sections inside it. */
export function windowNamed(page: Page, name: string) {
  const label = WINDOW_OF[name] ?? name;
  return (
    page.queryAllByRole('group', { name: label }).find((group: HTMLElement) => group.matches('[data-window]')) ?? null
  );
}

/** Unpins a window the table placed in a slot by itself, which takes it off the table until it is opened again. */
export async function unpinWindow(page: Page, name: string) {
  const frame = await waitFor(() => windowNamed(page, name) ?? Promise.reject(new Error(`No ${name} window.`)));
  await userEvent.click(within(frame).getByRole('button', { name: 'Unpin' }));
  await waitFor(() => expect(windowNamed(page, name)).toBeNull());
}

/** Opens the compass from its button, unless it is open already. */
export async function openCompass(page: Page) {
  if (!page.queryByRole('dialog', { name: 'Controls compass' })) {
    await press(() => page.getByRole('button', { name: /^Controls/ }));
  }
  return within(await page.findByRole('dialog', { name: 'Controls compass' }, { timeout: 30_000 }));
}

/**
 * Opens a window through the compass's search: typed whole, the window's own name is its first match.
 * A window already open, in the centre or pinned, stays as it is, since asking the compass again would close it.
 * The table's own openings (a battle, the end of the game) come with its first render, so that render is awaited first.
 */
export async function openControl(page: Page, name: string) {
  const label = WINDOW_OF[name] ?? name;
  await page.findByRole('button', { name: /^Controls/ }, { timeout: 30_000 });
  if (windowNamed(page, name)) {
    return;
  }
  const compass = await openCompass(page);
  const search = compass.getByRole('textbox', { name: 'Search controls' });
  await userEvent.clear(search);
  await userEvent.type(search, label);
  const option = await waitFor(
    () => {
      const match = compass
        .getAllByRole('option')
        .find((entry) => within(entry).queryByText(label, { exact: true }) !== null);
      if (!match) {
        throw new Error(`The compass offers no ${label}.`);
      }
      return match;
    },
    { timeout: 30_000 }
  );
  await userEvent.click(option);
  await waitFor(() => expect(windowNamed(page, name)).toBeVisible(), { timeout: 30_000 });
}

/** Proves the compass has no window of that name to offer, then closes. */
export async function expectNoControl(page: Page, name: string) {
  const compass = await openCompass(page);
  const search = compass.getByRole('textbox', { name: 'Search controls' });
  await userEvent.clear(search);
  await userEvent.type(search, name);
  await waitFor(() =>
    expect(compass.queryAllByRole('option').some((entry) => within(entry).queryByText(name, { exact: true }))).toBe(
      false
    )
  );
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(page.queryByRole('dialog', { name: 'Controls compass' })).toBeNull());
}

/** Opens a controls window from a story's canvas. */
export async function openPanel(canvasElement: HTMLElement, name: string) {
  const page = within(canvasElement.ownerDocument.body);
  await openControl(page, name);
  return page;
}

/** Opens the chat with a player, or the table's chat. */
export async function openChat(canvasElement: HTMLElement, player: string) {
  const page = within(canvasElement.ownerDocument.body);
  await openControl(page, player);
  return page;
}

/** Opens the Faction info window and sets it on a player's faction by their token. */
export async function openFactionInfo(canvasElement: HTMLElement, player: string) {
  const page = within(canvasElement.ownerDocument.body);
  await openControl(page, 'Faction info');
  const picker = within(within(windowNamed(page, 'Faction info')!).getByRole('group', { name: 'Factions' }));
  const token = await picker.findByRole('button', { name: (name) => name === player || name.startsWith(`${player},`) });
  if (token.getAttribute('aria-pressed') !== 'true') {
    await userEvent.click(token);
    await waitFor(() => expect(token).toHaveAttribute('aria-pressed', 'true'));
  }
  return page;
}

/* A window's content can commit well after it opens on a slow runner, so every read waits as long as the opening does. */
export const WAIT = { timeout: 30_000 };
