import { expect, userEvent, waitFor, within } from 'storybook/test';

import { press } from './gameInteractions.stories.fixture';

/*
 * The shortcut the Play stories share: open the page straight on one panel of the controls,
 * so a story shows a panel in one state without clicking there first.
 */

type Page = ReturnType<typeof within>;

/* A name matched whole, so "Spice" never opens a menu that merely mentions spice. */
const whole = (name: string, suffix = '$') => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${suffix}`);

/**
 * Waits for a control, completes its click, and reads the current panel to prove selection.
 * `took` proves the click landed: by default the control becomes the selected tab.
 */
async function choose(
  page: Page,
  name: RegExp,
  took: (button: HTMLElement) => void = (button) => expect(button).toHaveAttribute('aria-selected', 'true')
) {
  const selected = await press(() => page.getByRole('tab', { name }));
  await waitFor(() => took(page.getByRole('tab', { name })), { timeout: 30_000 });
  /* Pointer cleanup follows the completed selection, so a slow unhover cannot expire its wait. */
  await userEvent.unhover(selected);
}

/** Opens a destination through its group, then waits for the leaf to be selected. */
export async function openControl(page: Page, tab: string, subtab?: string) {
  const groups: Record<string, string> = {
    Hand: 'Yours',
    'Hidden zone': 'Yours',
    Spice: 'Yours',
    Drafting: 'Game',
    Setup: 'Game',
    Phase: 'Game',
    Battle: 'Game',
    Alliances: 'Game',
    Result: 'Game',
    'Shared inventory': 'Table',
    'Territory tints': 'Table',
    Settings: 'Table',
    'Game log': 'History',
    Audit: 'History',
    Battles: 'History',
    'Spice transfers': 'History',
    Replay: 'History',
  };
  const group = subtab ? tab : groups[tab];
  const leaf = subtab ?? tab;
  if (group) {
    const controls = within(await page.findByRole('tablist', { name: 'Controls' }, { timeout: 30_000 }));
    await choose(controls, whole(group), () => expect(page.getByRole('tab', { name: whole(leaf) })).toBeVisible());
  }
  await choose(page, whole(leaf));
}

/** Opens a controls destination from a story's canvas. */
export async function openPanel(canvasElement: HTMLElement, tab: string, subtab?: string) {
  const page = within(canvasElement.ownerDocument.body);
  await openControl(page, tab, subtab);
  return page;
}

/**
 * Opens the players pane beside the controls panel on one player and one of their tabs ("Info" or "Conversation").
 * The pane shows once the panel is widened, which the resize handle's End key does.
 */
export async function openPlayer(canvasElement: HTMLElement, player: string, tab: 'Info' | 'Conversation') {
  const page = within(canvasElement.ownerDocument.body);
  await waitFor(() => expect(page.getByRole('separator', { name: 'Resize controls panel' })).toBeVisible(), {
    timeout: 30_000,
  });
  page.getByRole('separator', { name: 'Resize controls panel' }).focus();
  await userEvent.keyboard('{End}');
  /* A player opens on one of their own tabs, so the player's tab showing proves the click. */
  const players = within(page.getByRole('complementary', { name: 'Players' }));
  await choose(players, whole(player, '(,|$)'), () =>
    expect(players.getByRole('tab', { name: whole(tab) })).toBeVisible()
  );
  await choose(players, whole(tab));
  return page;
}

/* The panel's content can commit well after its tab turns current on a slow runner, so every read waits as long as the tab does. */
export const WAIT = { timeout: 30_000 };
