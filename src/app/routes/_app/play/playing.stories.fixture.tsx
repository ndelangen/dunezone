import { emptyBattlePlan } from '@shared/play/battle';
import { TABLE_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { PerspectiveCamera, Vector3 } from 'three';

import { STORYBOOK_NOW } from '@db/storybook';

import { browserGameRuntime } from './multiplayer/gameRuntime';
import { cameraPoseFor, mapViewTopLimitForViewport, TABLE_CAMERA_FIELD_OF_VIEW } from './playView';
import {
  productTransport as hostedStoryTransport,
  playingSnapshot as initialSnapshot,
  SIX,
  factions,
} from './product.stories.fixture';
import { mapViewFramingPoints } from './tablePlateGeometry';
import { DEFAULT_TABLE_SEAT_COUNT } from './tableSettings';
import { trackerArcSlots } from './tableTrackers';

export const session: { runtime: typeof browserGameRuntime; transport: ReturnType<typeof hostedStoryTransport> } = {
  runtime: browserGameRuntime,
  transport: undefined!,
};

/** Selects the scripted runtime for this story and restores the browser runtime on cleanup. */
export function activateRuntime() {
  const active = session.transport;
  session.runtime = active.runtime;
  return () => {
    active.dispose();
    if (session.runtime === active.runtime) {
      session.runtime = browserGameRuntime;
    }
  };
}

export function phaseControls(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const controls = () => within(page.getByRole('group', { name: 'Phase navigation' }));
  /* The table mounts once the connection settles, so each assertion reads the currently visible controls. */
  const waitForPhase = (assert: () => void) =>
    waitFor(
      () => {
        expect(controls().getByRole('button', { name: 'Previous phase' })).toBeVisible();
        expect(controls().getByRole('button', { name: 'Next phase' })).toBeVisible();
        assert();
      },
      { timeout: 30_000 }
    );
  return { page, controls, waitForPhase };
}

/**
 * Opens one tab of the controls panel and waits for its item to become the current one.
 * The panel arrives with the connection, so the click is retried until the tab takes.
 */
export async function openTab(
  page: ReturnType<typeof within>,
  name: 'Shared inventory' | 'Spice' | 'Phase' | 'Hand' | 'Battle'
) {
  await waitFor(
    async () => {
      const tab = page.getByRole('button', { name });
      await userEvent.click(tab);
      expect(tab).toHaveAttribute('aria-current', 'true');
    },
    { timeout: 30_000 }
  );
}

/** Waits for the visible panel, which arrives with the connection. */
export const settled = (assert: () => void) => waitFor(assert, { timeout: 30_000 });

export function expectHeaderPhase(canvasElement: HTMLElement, phaseIndex: number) {
  const header = canvasElement.ownerDocument.querySelector('.seated-header');
  if (!(header instanceof HTMLElement)) {
    throw new TypeError('The hosted table header is missing.');
  }
  const phase = TABLE_PHASES[phaseIndex];
  expect(within(header).getByRole('img', { name: 'Dune' })).toBeVisible();
  expect(within(header).getByText(phase.label)).toBeVisible();
  expect(header.querySelector('use')).toHaveAttribute('href', `${phase.symbol}#root`);
  expect(within(header).queryByText(/^Phase \d+ of \d+$/)).toBeNull();
  expect(within(header).queryByText(/^(Center|Help|Setup|Lobby)$/)).toBeNull();
}

/** A hosted table with one shared inventory piece and one pending request from the other seat. */
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
  session.transport = hostedStoryTransport('harkonnen', {
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
  return activateRuntime();
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

/*
 * The fixture as the Worker deals it from the catalogue: the Dreamrules treachery cards on the
 * deck's own back, ten face down and one face up, from Storybook's static copies of the published
 * faces. The pieces keep the fixture's ids and labels, as the deal does.
 */

export function battleStory(stage: 'preparing' | 'countdown' | 'revealed', observer = false): GameSnapshot {
  /* Both copied troop descriptions specify half strength, or one strength funded with one spice. */
  const plans = [factions[1]!, factions[0]!].map((faction) =>
    emptyBattlePlan([
      {
        id: `${faction.slug}-front`,
        name: faction.data.troops[0]!.name,
        image: faction.data.troops[0]!.image,
        capable: true,
        strength: 0.5,
        fundedStrength: 1,
        fundingCost: 1,
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

/** Where a point on the table lands in the viewport while the table shows the map view. */
export function mapViewPoint(document: Document, point: readonly [number, number, number]): [number, number] {
  const scene = document.querySelector('canvas');
  if (!scene) {
    throw new TypeError('The table scene is missing.');
  }
  const sceneBounds = scene.getBoundingClientRect();
  const headerHeight = document.querySelector<HTMLElement>('.seated-header')?.getBoundingClientRect().height ?? 0;
  const aspectRatio = sceneBounds.width / sceneBounds.height;
  const pose = cameraPoseFor(
    'map',
    aspectRatio,
    mapViewFramingPoints(trackerArcSlots(TABLE_PHASES.length), DEFAULT_TABLE_SEAT_COUNT),
    mapViewTopLimitForViewport(sceneBounds.height, headerHeight)
  );
  const camera = new PerspectiveCamera(TABLE_CAMERA_FIELD_OF_VIEW, aspectRatio, 0.1, 100);
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const projected = new Vector3(...point).project(camera);
  return [
    sceneBounds.left + ((projected.x + 1) * sceneBounds.width) / 2,
    sceneBounds.top + ((1 - projected.y) * sceneBounds.height) / 2,
  ];
}

export async function expectBattleCalloutPlacement(
  canvasElement: HTMLElement,
  battleAnchor: [number, number, number],
  expectedHalf: 'above' | 'below'
) {
  const page = within(canvasElement.ownerDocument.body);
  await settled(() => {
    const cancel = page.getByRole('button', { name: 'Cancel battle' });
    expect(cancel).toBeVisible();
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
    expect(bounds.width).toBeGreaterThan(0);
    expect(Math.abs(centreX - viewport.width / 2)).toBeLessThanOrEqual(1);
    if (expectedHalf === 'above') {
      expect(centreY).toBeLessThan(verticalMidpoint);
    } else {
      expect(centreY).toBeGreaterThan(verticalMidpoint);
    }
    const shapes = callout.querySelectorAll<SVGPathElement>('svg path');
    expect(shapes).toHaveLength(1);
    const shape = shapes[0];
    const shapeBounds = shape.ownerSVGElement?.getBoundingClientRect();
    expect(shapeBounds).toBeDefined();
    const shapeRoot = shape.ownerSVGElement?.parentElement;
    const content = shapeRoot?.children.item(1);
    if (!shapeBounds || !content) {
      throw new TypeError('The battle callout geometry is incomplete.');
    }
    const contentBounds = content.getBoundingClientRect();
    const capsuleRadius = Math.min(shapeBounds.width / 2, contentBounds.height / 2);
    const arcRadii = Array.from(shape.getAttribute('d')?.matchAll(/\bA ([\d.]+) /g) ?? [], (match) => Number(match[1]));
    expect(arcRadii.filter((radius) => Math.abs(radius - capsuleRadius) < 0.1)).toHaveLength(4);
    const probe = shape.ownerSVGElement!.createSVGPoint();
    for (const direction of [-1, 1]) {
      probe.x = direction < 0 ? capsuleRadius * 0.27 : shapeBounds.width - capsuleRadius * 0.27;
      probe.y = contentBounds.height - capsuleRadius * 0.27;
      expect(shape.isPointInFill(probe)).toBe(false);
      probe.x = direction < 0 ? capsuleRadius * 0.31 : shapeBounds.width - capsuleRadius * 0.31;
      probe.y = contentBounds.height - capsuleRadius * 0.31;
      expect(shape.isPointInFill(probe)).toBe(true);
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
    expect(closestDistance).toBeLessThan(6);
  });
}
