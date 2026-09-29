import { expect, userEvent, waitFor, within } from 'storybook/test';

/*
 * The shortcut the Play/Controls stories share: open the page straight on one panel of the controls,
 * so a story shows a panel in one state without clicking there first.
 */

type Page = ReturnType<typeof within>;

/* A name matched whole, so "Spice" never opens a menu that merely mentions spice. */
const whole = (name: string, suffix = '$') => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${suffix}`);

/**
 * Clicks a control by name until the click takes, since the panel arrives with the table chunk and the connection, and the pane can remount under the click.
 * `took` proves the click landed: by default the control becomes the current tab.
 */
async function choose(
  page: Page,
  name: RegExp,
  took: (button: HTMLElement) => void = (button) => expect(button).toHaveAttribute('aria-current', 'true')
) {
  await waitFor(
    async () => {
      const button = page.getByRole('button', { name });
      await userEvent.click(button);
      took(button);
      /* The pointer leaves again, so the tab's tooltip does not cover the panel the story shows. */
      await userEvent.unhover(button);
    },
    { timeout: 30_000 }
  );
}

/** Opens a tab of the controls panel and, for a tab with its own tabs (the Log), one of those. */
export async function openPanel(canvasElement: HTMLElement, tab: string, subtab?: string) {
  const page = within(canvasElement.ownerDocument.body);
  if (subtab) {
    /* A tab with its own tabs marks the inner tab as current, not itself; the inner tab showing proves the click. */
    await choose(page, whole(tab), () => expect(page.getByRole('button', { name: whole(subtab) })).toBeVisible());
    await choose(page, whole(subtab));
  } else {
    await choose(page, whole(tab));
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
  /* A player opens on one of their own tabs, so the player's tab showing proves the click. */
  await choose(page, whole(player, '(,|$)'), () =>
    expect(page.getByRole('button', { name: whole(tab) })).toBeVisible()
  );
  await choose(page, whole(tab));
  return page;
}
