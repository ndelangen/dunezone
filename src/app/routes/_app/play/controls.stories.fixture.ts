import { expect, userEvent, waitFor, within } from 'storybook/test';

/*
 * The shortcut the Play/Controls stories share: open the page straight on one panel of the controls,
 * so a story shows a panel in one state without clicking there first.
 */

type Page = ReturnType<typeof within>;

/** Clicks a control by name until it takes, since the panel arrives with the table chunk and the connection. */
async function choose(page: Page, name: string | RegExp, current = true) {
  await waitFor(
    async () => {
      const button = page.getByRole('button', { name });
      await userEvent.click(button);
      if (current) {
        expect(button).toHaveAttribute('aria-current', 'true');
      }
      /* The pointer leaves again, so the tab's tooltip does not cover the panel the story shows. */
      await userEvent.unhover(button);
    },
    { timeout: 30_000 }
  );
}

/**
 * Opens a tab of the controls panel and, for a tab with its own tabs (the Log), one of those.
 * Names are matched whole, so "Spice" never opens a menu that merely mentions spice.
 */
export async function openPanel(canvasElement: HTMLElement, tab: string, subtab?: string) {
  const page = within(canvasElement.ownerDocument.body);
  /* A tab with its own tabs marks the inner tab as current, not itself. */
  await choose(page, new RegExp(`^${tab}$`), !subtab);
  if (subtab) {
    await choose(page, new RegExp(`^${subtab}$`));
  }
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
  await choose(page, new RegExp(`^${player}(,|$)`), false);
  await choose(page, new RegExp(`^${tab}$`), false);
  return page;
}
