import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { refText, SEED_REF_TOKEN } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { install, session } from './game.stories.fixture';
import { GameRuntimeContext } from './multiplayer/gameRuntime';
import { GAME_KEY, productTransport as hostedStoryTransport, parameters } from './product.stories.fixture';
const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Play/Playing',
  args: { path: refText(GAME_KEY, `/play/${SEED_REF_TOKEN}`) },
  decorators: [
    (Story) => (
      <GameRuntimeContext value={session.runtime}>
        <Story />
      </GameRuntimeContext>
    ),
  ],
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
      expect(document.querySelector('[data-piece-id="treachery-deck"]')).toHaveTextContent('10');
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
  expect(within(header).getByText('Storm')).toBeVisible();
  expect(within(header).queryByText(/^Phase \d+ of \d+$/)).toBeNull();
  expect(within(header).queryByText(/^(Center|Help|Setup|Lobby)$/)).toBeNull();
  expect(page.queryByRole('link', { name: /^(Dune )?Play$/ })).toBeNull();
  return { page, shell, document };
}

/* The shell opens through an iris once the renderer is ready; until then it stays closed behind the stage's status line. */
export const OpensThroughAnIris = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport()),
  play: async ({ canvasElement }) => {
    const { shell, document } = await tablePage(canvasElement);
    const view = document.defaultView!;
    /* The runner's headless renderer may never report; the stage then opens on the fallback clock. */
    await waitFor(() => expect(shell.parentElement).toHaveAttribute('data-scene-ready', 'true'), { timeout: 5000 });
    expect(view.getComputedStyle(shell).animationName).toBe('dune-play-enter');
    expect(within(document.body).queryByText('Opening the table...')).toBeNull();
  },
});

/* The motion verdict keeps the shell open and still, before and after the renderer is ready. */
export const OpensStill = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport()),
  globals: { motion: 'reduce' },
  play: async ({ canvasElement }) => {
    const { shell, document } = await tablePage(canvasElement);
    const view = document.defaultView!;
    expect(view.getComputedStyle(shell).clipPath).toBe('none');
    await waitFor(() => expect(shell.parentElement).toHaveAttribute('data-scene-ready', 'true'), { timeout: 5000 });
    expect(view.getComputedStyle(shell).animationName).toBe('none');
    expect(view.getComputedStyle(shell).clipPath).toBe('none');
  },
});

export const TableControls = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport()),
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
  },
});
