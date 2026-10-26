import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { emptyBattlePlan } from '@shared/play/battle';
import type { TablePiece } from '@shared/play/model';
import { TABLE_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { stackTopHeight } from '@shared/play/tableGeometry';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { openControl } from './controls.stories.fixture';
import { SETTLE, mapViewPoint, settled, waitForPlayCamera } from './mapView.stories.fixture';
import { productTransport, playingSnapshot as initialSnapshot, SIX, factions } from './product.stories.fixture';

export function phaseControls(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const controls = () => within(page.getByRole('group', { name: 'Phase navigation' }));
  /* The table mounts once the connection settles, so each assertion reads the currently visible controls. */
  const waitForPhase = (assert: () => void | Promise<void>) =>
    waitFor(
      async () => {
        await expect(controls().getByRole('button', { name: 'More phase actions' })).toBeVisible();
        await expect(controls().getByRole('button', { name: 'Next phase' })).toBeVisible();
        await assert();
      },
      { timeout: 30_000 }
    );
  /* Previous phase waits in the Next phase split button's menu, so reading or pressing it opens that menu first. */
  const openPrevious = async () => {
    await userEvent.click(controls().getByRole('button', { name: 'More phase actions' }));
    return waitForFrame(() => page.getByRole('menuitem', { name: 'Previous phase' }));
  };
  const expectPrevious = async (enabled: boolean) => {
    const item = await openPrevious();
    /* A phase change's cooldown may still hold the item, so its state is awaited while the menu stays open. */
    await waitFor(() => expect((item as HTMLButtonElement).disabled).toBe(!enabled));
    /* Escape belongs to the dropdown, so its focus trap must receive focus first. */
    await waitForFrame(() =>
      expect(page.getByRole('menu').contains(canvasElement.ownerDocument.activeElement)).toBe(true)
    );
    await userEvent.keyboard('{Escape}');
    /* Mantine may retain the invisible dropdown while its exit transition finishes. */
    await waitForFrame(async () => {
      const previous = page.queryByRole('menuitem', { name: 'Previous phase' });
      if (previous) {
        await expect(previous).not.toBeVisible();
      }
    });
  };
  const pressPrevious = async () => userEvent.click(await openPrevious());
  return { page, controls, waitForPhase, openPrevious, expectPrevious, pressPrevious };
}

export { openControl as openTab };
export { mapViewPoint, settled, waitForPlayCamera };

export async function expectHeaderPhase(canvasElement: HTMLElement, phaseIndex: number) {
  const header = canvasElement.ownerDocument.querySelector('.seated-header');
  if (!(header instanceof HTMLElement)) {
    throw new TypeError('The hosted table header is missing.');
  }
  const phase = TABLE_PHASES[phaseIndex];
  await expect(within(header).queryByRole('img', { name: 'Dune' })).toBeNull();
  await expect(within(header).getByText(phase.label)).toBeVisible();
  await expect(header.querySelector('use')).toHaveAttribute('href', `${phase.symbol}#root`);
  await expect(within(header).queryByText(/^Phase \d+ of \d+$/)).toBeNull();
  await expect(within(header).queryByText(/^(Center|Help|Setup|Lobby)$/)).toBeNull();
}

/** The transport for `install`: a table with one shared inventory piece and one pending request from the other seat. */
export function pendingRequestTransport() {
  const piece = {
    ...initialSnapshot().table.pieces[0],
    id: 'inventory-token',
    owner: 'shared' as const,
    inventory: 'shared' as const,
    label: 'House Atreides tokens',
    items: [
      {
        id: 'inventory-item',
        faceUp: true,
        artwork: {
          front: '/play-fixtures/product/house-atreides-token.jpg',
          back: '/play-fixtures/product/house-atreides-token.jpg',
          name: 'House Atreides token',
          type: 'token-disc',
        },
      },
    ],
  };
  /* Absolute publication references are the wire contract; story images stay on the isolated origin. */
  piece.items[0].artwork.front = new URL('/play-fixtures/product/house-atreides-token.jpg', location.origin).href;
  piece.items[0].artwork.back = piece.items[0].artwork.front;
  const initial = initialSnapshot();
  return productTransport('seat-2', {
    ...initial,
    table: { ...initial.table, pieces: [...initial.table.pieces, piece] },
    controls: {
      ...initialSnapshot().controls!,
      seats: SIX.map((player) => player.seat),
      requests: [
        {
          id: 'pending-token',
          requesterSeat: 'seat-1',
          requesterName: 'Twaffle',
          contents: {
            assetId: 'token',
            name: 'House Atreides tokens',
            type: 'token-disc',
            members: [{ assetId: 'token', count: 1 }],
            definitions: [],
            pieces: [piece],
          },
        },
      ],
    },
  });
}

/** A CSS colour as the browser would paint it, so a token's hex and a computed rgb() compare. */
export function paintedColor(element: HTMLElement, value: string) {
  const probe = element.ownerDocument.createElement('span');
  probe.style.color = value;
  element.append(probe);
  const painted = element.ownerDocument.defaultView!.getComputedStyle(probe).color;
  probe.remove();
  return painted;
}

export function battleStory(stage: 'preparing' | 'countdown' | 'revealed', observer = false): GameSnapshot {
  /* Both copied troop descriptions specify half strength, or one strength supported with one spice. */
  const plans = [factions[1]!, factions[0]!].map((faction) =>
    emptyBattlePlan([
      {
        id: `${faction.slug}-front`,
        name: faction.data.troops[0]!.name,
        image: faction.data.troops[0]!.image,
        capable: true,
        strength: 0.5,
        supportedStrength: 1,
        supportCost: 1,
      },
    ])
  );
  const snapshot = initialSnapshot();
  const defenders = snapshot.table.pieces.find((piece) => piece.id === 'starting-0-arrakeen')!;
  const attackers = snapshot.table.pieces.find((piece) => piece.id === 'starting-1-carthag')!;
  attackers.position = [defenders.position[0] + 0.4, defenders.position[1], defenders.position[2]];
  attackers.zoneId = 'arrakeen';
  return {
    ...snapshot,
    phase: 6,
    ...(observer ? {} : { bank: { factionId: 'house-harkonnen', balance: 10 }, battlePlan: plans[0] }),
    battle: {
      id: 'story-battle',
      anchor: [0.95, 0.18, -3.05],
      territory: 'Arrakeen',
      stage,
      sides: [
        { factionId: 'house-harkonnen', ready: stage !== 'preparing', choice: stage === 'revealed' ? 'left' : null },
        { factionId: 'house-atreides', ready: true, choice: stage === 'revealed' ? 'right' : null },
      ],
      deadline: stage === 'countdown' ? STORYBOOK_NOW + 5000 : null,
      ...(stage === 'revealed' ? { revealed: [plans[0], plans[1]] } : {}),
    },
  };
}

export async function expectBattleCalloutPlacement(
  canvasElement: HTMLElement,
  battleAnchor: [number, number, number],
  expectedHalf: 'above' | 'below'
) {
  const page = within(canvasElement.ownerDocument.body);
  await waitForPlayCamera(canvasElement.ownerDocument);
  /* The scene writes the callout's position and shape only from inside its animation-frame callbacks, so each poll runs the waiting frames itself (https://github.com/ndelangen/dunezone/issues/1443). */
  await waitForFrame(async () => {
    const cancel = page.getByRole('button', { name: 'Cancel battle' });
    await expect(cancel).toBeVisible();
    const callout = cancel.closest<HTMLElement>('[data-battle-stage]');
    if (!callout) {
      throw new TypeError('The battle callout is missing.');
    }
    const bounds = callout.getBoundingClientRect();
    const viewport = canvasElement.ownerDocument.documentElement.getBoundingClientRect();
    const scene = canvasElement.ownerDocument.querySelector('canvas');
    if (!scene) {
      throw new TypeError('The table scene is missing.');
    }
    const sceneBounds = scene.getBoundingClientRect();
    const expectedAnchor = mapViewPoint(canvasElement.ownerDocument, battleAnchor);
    const centreX = bounds.left + bounds.width / 2;
    const centreY = bounds.top + bounds.height / 2;
    const verticalMidpoint = sceneBounds.top + sceneBounds.height / 2;
    await expect(bounds.width).toBeGreaterThan(0);
    await expect(Math.abs(centreX - viewport.width / 2)).toBeLessThanOrEqual(1);
    if (expectedHalf === 'above') {
      await expect(centreY).toBeLessThan(verticalMidpoint);
    } else {
      await expect(centreY).toBeGreaterThan(verticalMidpoint);
    }
    const shapes = callout.querySelectorAll<SVGPathElement>('svg path');
    await expect(shapes).toHaveLength(1);
    const shape = shapes[0];
    const shapeBounds = shape.ownerSVGElement?.getBoundingClientRect();
    await expect(shapeBounds).toBeDefined();
    const shapeRoot = shape.ownerSVGElement?.parentElement;
    const content = shapeRoot?.children.item(1);
    if (!shapeBounds || !content) {
      throw new TypeError('The battle callout geometry is incomplete.');
    }
    const contentBounds = content.getBoundingClientRect();
    const capsuleRadius = Math.min(shapeBounds.width / 2, contentBounds.height / 2);
    const arcRadii = Array.from(shape.getAttribute('d')?.matchAll(/\bA ([\d.]+) /g) ?? [], (match) => Number(match[1]));
    await expect(arcRadii.filter((radius) => Math.abs(radius - capsuleRadius) < 0.1)).toHaveLength(4);
    const probe = shape.ownerSVGElement!.createSVGPoint();
    for (const direction of [-1, 1]) {
      probe.x = direction < 0 ? capsuleRadius * 0.27 : shapeBounds.width - capsuleRadius * 0.27;
      probe.y = contentBounds.height - capsuleRadius * 0.27;
      await expect(shape.isPointInFill(probe)).toBe(false);
      probe.x = direction < 0 ? capsuleRadius * 0.31 : shapeBounds.width - capsuleRadius * 0.31;
      probe.y = contentBounds.height - capsuleRadius * 0.31;
      await expect(shape.isPointInFill(probe)).toBe(true);
    }
    const pathLength = shape.getTotalLength();
    let closestDistance = Number.POSITIVE_INFINITY;
    for (let distance = 0; distance <= pathLength; distance += 1) {
      const point = shape.getPointAtLength(distance);
      closestDistance = Math.min(
        closestDistance,
        Math.hypot(
          (shapeBounds?.left ?? 0) + point.x - expectedAnchor[0],
          (shapeBounds?.top ?? 0) + point.y - expectedAnchor[1]
        )
      );
    }
    await expect(closestDistance).toBeLessThan(6);
  }, SETTLE);
}

export async function tablePage(canvasElement: HTMLElement, phaseLabel: string = TABLE_PHASES[0].label) {
  const page = within(canvasElement.ownerDocument.body);
  const viewControls = await page.findByRole('group', { name: 'Table view' }, { timeout: 30_000 });
  const document = canvasElement.ownerDocument;
  await waitFor(
    async () => {
      await expect(viewControls).toBeVisible();
      const canvas = document.querySelector('.dune-play-shell canvas');
      await expect(canvas).toBeVisible();
      await expect(canvas?.getBoundingClientRect().height).toBeGreaterThan(100);
      await expect(document.querySelector('[data-piece-id="treachery-deck"]')).toHaveTextContent('10');
      await expect(
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
  await waitForPlayCamera(document);
  await expect(document.querySelector('[data-page-layout-height="fullscreen"]')).not.toBeNull();
  const header = shell.querySelector('header');
  if (!header) {
    throw new Error('The table header is missing.');
  }
  /* The table runs to the top: no brand mark, only the floating phase and game chips. */
  await expect(within(header).queryByRole('img', { name: 'Dune' })).toBeNull();
  await expect(within(header).getByText(phaseLabel)).toBeVisible();
  await expect(within(header).queryByText(/^Phase \d+ of \d+$/)).toBeNull();
  await expect(within(header).queryByText(/^(Center|Help|Setup|Lobby)$/)).toBeNull();
  await expect(page.queryByRole('link', { name: /^(Dune )?Play$/ })).toBeNull();
  return { page, shell, document };
}

/**
 * Right-clicks a piece on the table, in the map view, until its menu opens.
 * The right-click is a pointerdown and then a `contextmenu` PointerEvent with the same pointer id, because the scene fires a click on an object only when the pointerdown with that id hit it;
 * user-event's `[MouseRight]` sends its `contextmenu` without a pointer id, and no menu opens.
 * The events go to the canvas `mapViewPoint` projects against, the document's first.
 * The menu is found by the name a screen reader announces.
 */
export async function openPieceMenu(document: Document, piece: TablePiece, name: string) {
  const page = within(document.body);
  const [clientX, clientY] = mapViewPoint(document, [
    piece.position[0],
    piece.position[1] + stackTopHeight(piece),
    piece.position[2],
  ]);
  const press = { clientX, clientY, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 2 };
  /* The menu enters the DOM only from inside an animation-frame callback, so each poll runs the waiting frames itself (https://github.com/ndelangen/dunezone/issues/1443). */
  return waitForFrame(
    async () => {
      const scene = document.querySelector('canvas');
      if (scene && !page.queryByRole('menu')) {
        scene.dispatchEvent(new PointerEvent('pointerdown', { ...press, buttons: 2 }));
        scene.dispatchEvent(new PointerEvent('contextmenu', { ...press, buttons: 2 }));
        scene.dispatchEvent(new PointerEvent('pointerup', { ...press, buttons: 0 }));
      }
      const menu = page.getByRole('menu');
      await expect(finishTransitions(menu)).toBeVisible();
      await expect(menu).toHaveAccessibleName(name);
      return menu;
    },
    { timeout: 30_000 }
  );
}
