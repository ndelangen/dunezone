import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Play/Demo',
  args: { path: '/play/demo?seats=6' },
});

async function tablePage(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const viewControls = await page.findByRole('group', { name: 'Table view' }, { timeout: 30_000 });
  const document = canvasElement.ownerDocument;
  await waitFor(
    () => {
      expect(viewControls).toBeVisible();
      const canvas = document.querySelector('.dune-play-shell canvas');
      expect(canvas).toBeVisible();
      expect(canvas?.getBoundingClientRect().height).toBeGreaterThan(100);
      expect(document.querySelector('[data-piece-id="treachery-deck"]')).toHaveTextContent('4');
      expect(
        Array.from(document.fonts).some(
          (font) => font.family.replaceAll('"', '') === 'Dune Play Table Label' && font.status === 'loaded'
        )
      ).toBe(true);
    },
    { timeout: 30_000 }
  );
  const shell = document.querySelector<HTMLElement>('.dune-play-shell');
  if (!shell) {
    throw new Error('The Play route did not mount its table.');
  }
  expect(document.querySelector('[data-page-layout-height="fullscreen"]')).not.toBeNull();
  const header = shell.querySelector('header');
  if (!header) {
    throw new Error('The table header is missing.');
  }
  expect(within(header).getByRole('img', { name: 'Dune' })).toBeVisible();
  expect(within(header).getByText('Shipment and movement')).toBeVisible();
  expect(header.querySelector('use')).toHaveAttribute('href', '/vector/icon/shipment_disc.svg#root');
  expect(within(header).queryByText(/^Phase \d+ of \d+$/)).toBeNull();
  expect(within(header).queryByText(/^(Center|Help|Setup|Lobby)$/)).toBeNull();
  expect(page.queryByRole('link', { name: /^(Dune )?Play$/ })).toBeNull();
  return { page, shell, document };
}

export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const { page, shell, document } = await tablePage(canvasElement);
    expect(page.queryByRole('link', { name: 'Login' })).toBeNull();
    const flipButton = page.getByRole('button', { name: /^Flip/ });
    const stack = document.querySelector('[data-piece-id="harkonnen-force-stack"]');
    if (!stack) {
      throw new Error('The initial force stack is missing.');
    }
    expect(flipButton).toBeEnabled();
    let repeatWasDisabled: boolean | undefined;
    const observer = new MutationObserver(() => {
      if (repeatWasDisabled !== undefined || stack.getAttribute('data-flipping') !== 'true') {
        return;
      }
      repeatWasDisabled = flipButton.hasAttribute('disabled');
      flipButton.click();
    });
    try {
      observer.observe(stack, { attributes: true, attributeFilter: ['data-flipping'] });
      await userEvent.click(flipButton);
      await waitFor(() => expect(repeatWasDisabled).toBe(true));
      await waitFor(() => expect(stack).toHaveAttribute('data-flipping', 'false'), { timeout: 5000 });
      expect(stack).toHaveAttribute('data-flip-revision', '1');
      expect(flipButton).toBeEnabled();
    } finally {
      observer.disconnect();
    }
    expect(shell).toHaveAttribute('data-show-counts', 'false');
  },
});

export const TableControls = meta.story({
  parameters: {
    database: db((baseline) => {
      for (const user of baseline.users) {
        user.isAdmin = false;
      }
    }),
  },
  play: async ({ canvasElement }) => {
    const { page, shell } = await tablePage(canvasElement);
    const viewButtons = within(page.getByRole('group', { name: 'Table view' }));

    for (const view of ['left', 'right', 'bottom', 'map']) {
      const button = viewButtons.getByRole('button', { name: new RegExp(`^Focus on ${view}`) });
      await userEvent.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(shell).toHaveAttribute('data-table-view', view);
    }

    const divider = page.getByRole('separator', { name: 'Resize controls panel' });
    divider.focus();
    await userEvent.keyboard('{Home}');
    expect(divider.getAttribute('aria-valuenow')).toBe(divider.getAttribute('aria-valuemin'));
    const minimum = Number(divider.getAttribute('aria-valuenow'));
    await userEvent.keyboard('{ArrowUp}');
    expect(Number(divider.getAttribute('aria-valuenow'))).toBeGreaterThan(minimum);
    await userEvent.keyboard('{End}');
    expect(divider.getAttribute('aria-valuenow')).toBe(divider.getAttribute('aria-valuemax'));
    await userEvent.tab();

    const counters = Array.from(shell.querySelectorAll<HTMLElement>('.scene-piece-count'));
    expect(counters.length).toBeGreaterThan(0);
    for (const counter of counters) {
      expect(counter).not.toBeVisible();
    }
    await userEvent.keyboard('{Alt>}');
    expect(shell).toHaveAttribute('data-show-counts', 'true');
    for (const counter of counters) {
      expect(counter).toBeVisible();
    }
    window.dispatchEvent(new Event('blur'));
    await waitFor(() => expect(shell).toHaveAttribute('data-show-counts', 'false'));
    for (const counter of counters) {
      expect(counter).not.toBeVisible();
    }
    await userEvent.keyboard('{/Alt}');

    await userEvent.click(page.getByRole('button', { name: 'Advance one' }));
    expect(page.getByText('Sector 5')).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Back one' }));
    expect(page.getByText('Sector 6')).toBeVisible();
  },
});
