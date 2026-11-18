import { idleBidding } from '@shared/play/bidding';
import { STANDARD_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import type { Decorator } from '@storybook/tanstack-react';
import { within } from 'storybook/test';

import { install } from './game.stories.fixture';
import { NoticeLifetime } from './multiplayer/SoftNotices';
import { playingSnapshot, productTransport } from './product.stories.fixture';

/** The seat the soft notification stories watch from. */
const NOTICE_VIEWER = 'seat-2';

let live: { snapshot: GameSnapshot; transport: ReturnType<typeof productTransport> } | null = null;

/** Keeps every notice until the story is done with it, so a slow runner never loses one to its 6 s lifetime. */
export const holdNotices: Decorator = (Story) => (
  <NoticeLifetime value={Number.POSITIVE_INFINITY}>
    <Story />
  </NoticeLifetime>
);

/** A table in play for the viewer, which a story then changes as the room would, to raise a notice. */
export function noticeSetup(start?: (snapshot: GameSnapshot) => void) {
  return install(() => {
    const snapshot = playingSnapshot(NOTICE_VIEWER);
    start?.(snapshot);
    const transport = productTransport(NOTICE_VIEWER, snapshot);
    live = { snapshot, transport };
    return transport;
  });
}

/** Applies a change to the live table and sends it to the page as the room's next revision. */
export function changeTable(update: (snapshot: GameSnapshot) => void) {
  const { snapshot, transport } = live!;
  snapshot.revision += 1;
  update(snapshot);
  transport.deliver(transport.view(snapshot));
}

/** The viewer's faction at the story table. */
export function ownFaction(snapshot: GameSnapshot) {
  return snapshot.roster!.seats.find((seat) => seat.id === NOTICE_VIEWER)!.faction!;
}

/** Another seat's faction and its player, at the story table. */
export function otherSeat(snapshot: GameSnapshot) {
  const seat = snapshot.roster!.seats.find((entry) => entry.id !== NOTICE_VIEWER && entry.faction)!;
  const player = snapshot.controls!.players.find((entry) => entry.seat === seat.id)!;
  return { faction: seat.faction!, player: player.name };
}

/** A payment of 3 spice to the viewer from another seat's player, as the table records it; returns the giver's faction name. */
export function payViewer(snapshot: GameSnapshot) {
  const other = otherSeat(snapshot);
  snapshot.spiceTransfers = [
    ...(snapshot.spiceTransfers ?? []),
    {
      revision: snapshot.revision,
      kind: 'payment',
      actor: other.player,
      amount: 3,
      source: 'table',
      destination: ownFaction(snapshot).id,
    },
  ];
  return other.faction.name;
}

/** Opens the Bidding phase with the bidder pointing at the viewer's faction. */
export function biddingReachesViewer(snapshot: GameSnapshot) {
  snapshot.phase = (snapshot.phases ?? STANDARD_PHASES).findIndex((entry) => entry.id === 'bidding');
  snapshot.bidding = { ...idleBidding(), started: true, stage: 'open', round: 1, turn: ownFaction(snapshot).id };
}

/** Waits until the table is on screen, so the change a story makes next arrives as a change. */
export async function tableShown(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await page.findByRole('log', { name: 'Notifications' }, { timeout: 30_000 });
  await page.findByRole('button', { name: 'Next phase' }, { timeout: 30_000 });
  return page;
}

/** The notification area, and whether the screen's edge glows for the viewer's turn. */
export function noticeLog(page: ReturnType<typeof within>) {
  const log = page.getByRole('log', { name: 'Notifications' });
  return {
    log: within(log),
    glowing: () => Boolean(log.querySelector('[data-glow]')),
    glow: () => log.querySelector('[data-glow]') as HTMLElement | null,
  };
}

/* Holds the edge glow at the height of its pulse, where it is fully lit, so a capture or a check sees it rather than a moment of its fade. */
export function holdGlowLit(glow: HTMLElement) {
  for (const animation of glow.getAnimations()) {
    animation.pause();
    animation.currentTime = 1000;
  }
}
