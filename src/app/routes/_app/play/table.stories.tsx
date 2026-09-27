import preview from '@sb/preview';
import { TABLE_PHASES } from '@shared/play/phases';
import { stackTopHeight } from '@shared/play/tableGeometry';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install, session } from './game.stories.fixture';
import { mapViewPoint } from './playing.stories.fixture';
import { factions, playingSnapshot, productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Playing',
});
async function tablePage(canvasElement: HTMLElement, phaseLabel: string = TABLE_PHASES[0].label) {
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
  expect(within(header).getByText(phaseLabel)).toBeVisible();
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

/* Holding Control names every piece and its owning faction; a shared piece shows its name alone, and letting go clears the names. */
export const PieceNames = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { shell, document } = await tablePage(canvasElement);
    /* One keyboard, so a key pressed while another is held carries both modifiers. */
    const user = userEvent.setup();
    const nameOf = (pieceId: string) => {
      const name = document
        .querySelector(`[data-piece-id="${pieceId}"]`)
        ?.parentElement?.querySelector('.scene-piece-name');
      if (!(name instanceof HTMLElement)) {
        throw new Error(`${pieceId} carries no name.`);
      }
      return name;
    };
    const troopId = 'starting-0-arrakeen';
    const troop = playingSnapshot().table.pieces.find((entry) => entry.id === troopId)!;
    const troopName = nameOf(troopId);
    const deckName = nameOf('treachery-deck');
    const counters = Array.from(shell.querySelectorAll<HTMLElement>('.scene-piece-count'));

    expect(troopName).not.toBeVisible();
    await user.keyboard('{Control>}');
    expect(shell).toHaveAttribute('data-show-names', 'true');
    expect(shell).toHaveAttribute('data-show-counts', 'false');
    expect(troopName).toBeVisible();
    expect(within(troopName).getByText(troop.label)).toBeVisible();
    expect(within(troopName).getByText(factions[0]!.data.name)).toBeVisible();
    expect(deckName).toBeVisible();
    expect(deckName.querySelector('.scene-piece-name__owner')).toBeNull();
    /* Control shows names only: the counts wait for Alt, and holding both shows both. */
    for (const counter of counters) {
      expect(counter).not.toBeVisible();
    }
    await user.keyboard('{Alt>}');
    expect(shell).toHaveAttribute('data-show-counts', 'true');
    expect(troopName).toBeVisible();
    expect(counters[0]).toBeVisible();
    await user.keyboard('{/Alt}');
    expect(counters[0]).not.toBeVisible();
    expect(troopName).toBeVisible();

    await user.keyboard('{/Control}');
    expect(shell).toHaveAttribute('data-show-names', 'false');
    expect(troopName).not.toBeVisible();
    expect(deckName).not.toBeVisible();
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

/**
 * A phase change moves the camera to the view the new phase recommends, and the view picker marks that view.
 * A table opened mid-phase marks its phase's view and stays on the map: the first move waits for the next phase.
 */
export const PhaseViews = meta.story({
  beforeEach: install(() => productTransport('seat-2', { ...playingSnapshot(), phase: 1 })),
  play: async ({ canvasElement }) => {
    const { page, shell } = await tablePage(canvasElement, TABLE_PHASES[1].label);
    const views = within(page.getByRole('group', { name: 'Table view' }));
    expect(views.getByRole('button', { name: 'Focus on right, recommended for this phase' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(shell).toHaveAttribute('data-table-view', 'map');

    session.transport.deliver(session.transport.view({ ...playingSnapshot(), phase: 2, revision: 1 }));
    await waitFor(() => expect(shell).toHaveAttribute('data-table-view', 'bottom'));
    expect(views.getByRole('button', { name: 'Focus on bottom, recommended for this phase' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(views.getByRole('button', { name: 'Focus on right' })).toHaveAttribute('aria-pressed', 'false');
  },
});

/**
 * A phase change during a carry marks the new phase's view at once and moves the camera only when the piece lands.
 * The carry is a press on the viewer's own forces and a move past the drag threshold, sent to the canvas `mapViewPoint` projects against.
 */
export const PhaseViewWaitsForTheDrop = meta.story({
  beforeEach: install(() => productTransport()),
  play: async ({ canvasElement }) => {
    const { page, shell, document } = await tablePage(canvasElement);
    const forces = playingSnapshot().table.pieces.find((piece) => piece.id === 'starting-1-carthag')!;
    const [clientX, clientY] = mapViewPoint(document, [
      forces.position[0],
      forces.position[1] + stackTopHeight(forces),
      forces.position[2],
    ]);
    const scene = document.querySelector('canvas')!;
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, clientY };
    await waitFor(
      () => {
        if (scene.style.cursor !== 'grabbing') {
          scene.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientX, buttons: 1 }));
          scene.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: clientX + 24, buttons: 1 }));
        }
        expect(scene.style.cursor).toBe('grabbing');
      },
      { timeout: 30_000 }
    );

    session.transport.deliver(session.transport.view({ ...playingSnapshot(), phase: 1, revision: 1 }));
    const views = within(page.getByRole('group', { name: 'Table view' }));
    await waitFor(() =>
      expect(views.getByRole('button', { name: 'Focus on right, recommended for this phase' })).toBeInTheDocument()
    );
    expect(shell).toHaveAttribute('data-table-view', 'map');
    expect(scene.style.cursor).toBe('grabbing');

    scene.dispatchEvent(new PointerEvent('pointerup', { ...pointer, clientX: clientX + 24, buttons: 0 }));
    await waitFor(() => expect(shell).toHaveAttribute('data-table-view', 'right'));
  },
});
