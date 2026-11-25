import { idleBidding } from '@shared/play/bidding';
import { TABLE_CONVERSATION } from '@shared/play/conversations';
import type { Vector3Tuple } from '@shared/play/model';
import { MOVEMENT_PHASE_ID } from '@shared/play/movement';
import { STANDARD_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { territoryAtTable } from '@shared/play/territoryPlacement';
import type { Decorator } from '@storybook/tanstack-react';
import { useState } from 'react';
import { within } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';
import { CameraLookContext, createCameraLook } from '@app/widgets/tabletop/cameraLook';

import { install } from './game.stories.fixture';
import { NoticeLifetime } from './multiplayer/noticeLifetime';
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
      giver: other.faction.id,
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

let chatSequence = 0;

/**
 * Another faction writes in a conversation the viewer's faction is part of, as the room delivers it live: the table chat when `peerId` is '@table', else a private chat (named by its writer, as the viewer sees it).
 */
export async function writeToViewer(senderFactionId: string, text: string, peerId = TABLE_CONVERSATION) {
  const { snapshot, transport } = live!;
  await noticesListening();
  chatSequence += 1;
  transport.deliver({
    type: 'conversation-message',
    factionId: ownFaction(snapshot).id,
    peerId: peerId === TABLE_CONVERSATION ? peerId : senderFactionId,
    message: {
      sequence: chatSequence,
      requestId: `story-chat-${chatSequence}`,
      senderFactionId,
      author: 'Story player',
      text,
      savedAt: STORYBOOK_NOW,
    },
  });
}

/**
 * A whisper notice at the table, as the room delivers it live in a game that announces private messages: the faction `from` wrote privately to the faction `to`, and the table hears only that.
 */
export async function whisperAtTable(from: string, to: string) {
  const { snapshot, transport } = live!;
  await noticesListening();
  chatSequence += 1;
  transport.deliver({
    type: 'conversation-message',
    factionId: ownFaction(snapshot).id,
    peerId: TABLE_CONVERSATION,
    message: {
      sequence: chatSequence,
      requestId: `story-whisper-${chatSequence}`,
      senderFactionId: from,
      author: '',
      text: '',
      savedAt: STORYBOOK_NOW,
      whisperTo: to,
    },
  });
}

/** Every other seat's faction at the story table. */
export function otherFactions(snapshot: GameSnapshot) {
  return snapshot
    .roster!.seats.filter((seat) => seat.id !== NOTICE_VIEWER && seat.faction)
    .map((seat) => seat.faction!);
}

/** A favour asked in the table chat, naming the viewer's faction after an @. */
export function askViewer(snapshot: GameSnapshot) {
  return `@${ownFaction(snapshot).name} can you spare 3 spice for my shipment to Arrakeen? I will pay you back next turn.`;
}

/** The live story table, for a story that reads it after setup. */
export function liveSnapshot() {
  return live!.snapshot;
}

/** A spot on the board where the viewer's own pieces lie, in a territory where there is one. */
export function ownPiecesSpot(snapshot: GameSnapshot): Vector3Tuple {
  const own = ownFaction(snapshot).id;
  const pieces = snapshot.table.pieces.filter((piece) => piece.owner === own);
  const piece = pieces.find((candidate) => candidate.zoneId) ?? pieces[0];
  if (!piece) {
    throw new Error('The viewer has no pieces on the story table.');
  }
  return piece.position;
}

/* The notices hear chat messages and pings from the frame after they show; one sent before that is one nobody was there to hear. */
export function noticesListening() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

/** Another seat's player pings the table at `position`, as the room relays a ping to everyone. */
export async function pingFromOtherSeat(position: Vector3Tuple) {
  const { snapshot, transport } = live!;
  await noticesListening();
  const seat = snapshot.roster!.seats.find((entry) => entry.id !== NOTICE_VIEWER && entry.faction)!;
  transport.deliver({
    type: 'ping',
    ping: {
      connectionId: 'story-pinger',
      viewerSeat: seat.id,
      displayName: 'Story pinger',
      color: '#5fa8d3',
      position,
    },
  });
  return seat.faction!.name;
}

/** Opens Shipment and Movement with the viewer's faction first to move. */
export function movementReachesViewer(snapshot: GameSnapshot) {
  const own = ownFaction(snapshot).id;
  snapshot.phase = (snapshot.phases ?? STANDARD_PHASES).findIndex((entry) => entry.id === MOVEMENT_PHASE_ID);
  snapshot.movement = { done: [], order: [own, ...otherFactions(snapshot).map((faction) => faction.id)] };
}

/* Where the stories' table was asked to look, newest last. */
let looks: Vector3Tuple[] = [];

/** Stands in for the table's camera look, so a story can see where a notice asked it to look; the table's own camera still follows. */
export const recordLooks: Decorator = (Story) => {
  const [look] = useState(() => {
    const own = createCameraLook();
    looks = [];
    return {
      lookAt: (spot: Vector3Tuple) => {
        looks.push(spot);
        own.lookAt(spot);
      },
      subscribe: own.subscribe,
    };
  });
  return (
    <CameraLookContext value={look}>
      <Story />
    </CameraLookContext>
  );
};

/** Where the stories' table was last asked to look. */
export const lastLook = () => looks.at(-1);

/** The territory the viewer's pieces lie in on the story table, as a ping there names it. */
export function ownPiecesTerritory(snapshot: GameSnapshot) {
  const name = territoryAtTable({ board: snapshot.board?.definition }, ownPiecesSpot(snapshot))?.name;
  if (!name) {
    throw new Error("The viewer's pieces lie in no territory on the story table.");
  }
  return name;
}

/** A toast's accessible name: its line, then the words quoted under it, matched whole. */
export function toastName(line: string, quote?: string) {
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escape(line)}${quote === undefined ? '' : `\\s*${escape(quote)}`}$`);
}
