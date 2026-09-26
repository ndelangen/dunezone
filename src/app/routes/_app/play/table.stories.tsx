import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Playing',
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
  beforeEach: install(() => productTransport()),
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
  beforeEach: install(() => productTransport()),
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
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, shell, document } = await tablePage(canvasElement);
    const viewButtons = within(page.getByRole('group', { name: 'Table view' }));

    for (const view of ['left', 'right', 'bottom', 'map']) {
      const button = viewButtons.getByRole('button', { name: new RegExp(`^Focus on ${view}`) });
      await userEvent.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(shell).toHaveAttribute('data-table-view', view);
    }

    /* The header's controls lead the Tab order: Tab from the page start reaches the header before the separator. */
    const divider = page.getByRole('separator', { name: 'Resize controls panel' });
    const header = shell.querySelector('header')!;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    let focused: Element | null = null;
    for (let press = 0; press < 50 && focused !== divider && !header.contains(focused); press++) {
      await userEvent.tab();
      focused = document.activeElement;
    }
    expect(header.contains(focused), `Tab reaches ${focused?.outerHTML.slice(0, 80)} first`).toBe(true);

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

/**
 * On a short window the dock keeps its floor by growing up over the scene, to above the header's lower edge.
 * The header still paints above it there, so every control in it takes the pointer at its top, middle and bottom.
 */
export const ShortWindow = meta.story({
  /* Still, so no iris clips the corners the controls sit in. */
  globals: { viewport: { value: 'appShort' }, motion: 'reduce' },
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { shell, document } = await tablePage(canvasElement);
    await waitFor(() => expect(shell.parentElement).toHaveAttribute('data-scene-ready', 'true'), { timeout: 5000 });
    const header = shell.querySelector('header')!;
    const dock = shell.querySelector('.seated-controls-panel')!;
    expect(dock.getBoundingClientRect().top).toBeLessThan(header.getBoundingClientRect().bottom);
    const picker = within(header).getByRole('group', { name: 'Table view' });
    const controls = [
      ...within(picker).getAllByRole('button'),
      ...within(header).getAllByRole('button', { name: /^(Game menu|Previous phase|Next phase)$/ }),
    ];
    for (const control of controls) {
      const box = control.getBoundingClientRect();
      for (const y of [box.top + 2, box.top + box.height / 2, box.bottom - 2]) {
        const hit = document.elementFromPoint(box.left + box.width / 2, y);
        expect(
          control.contains(hit),
          `${control.textContent} at ${Math.round(y)} hits ${hit?.outerHTML.slice(0, 80)}`
        ).toBe(true);
      }
    }
  },
});
