/* @jsxImportSource ../three-jsx */
import { Button, NumberInput, Stack, Text, UnstyledButton } from '@mantine/core';
import { Html } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import { MAX_BID_SECONDS, MIN_BID_SECONDS, biddingFactions, idleBidding } from '@shared/play/bidding';
import type { BiddingState } from '@shared/play/bidding';
import { phaseAt, STANDARD_PHASES } from '@shared/play/phases';
import { BOARD_RADIUS, BOARD_SURFACE_Y } from '@shared/play/tableGeometry';
import { PLAYER_RING_RADIUS, tableSeatAngles } from '@shared/play/tableSettings';
import { Section } from '@ui/block/Section';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Group } from 'three';
import { ExtrudeGeometry, Shape } from 'three';

import { Token as FactionToken } from '@game/assets/faction/token/Token';

import { DarkSchemeIsland } from '../DarkSchemeIsland';
import styles from './Bidder.module.css';
import type { TableProjection, TableSession } from './TableSession';
import { useServerNow } from './useServerNow';

type Props = { client: TableSession; table: TableProjection };

/* The round base covers about a third of the planet's radius (Norbert, #1007). */
const BIDDER_RADIUS = BOARD_RADIUS * 0.35;
/* The token rests on the Seat's station at the player ring; the point stops a hand's width short of its edge. */
const BIDDER_TIP = PLAYER_RING_RADIUS - 0.5;
const BIDDER_DEPTH = 0.08;
const BIDDER_HOVER_Y = BOARD_SURFACE_Y + 0.35;
const BIDDER_TURN_MS = 450;

function biddingPhase(table: TableProjection) {
  return phaseAt(table.snapshot.phase, table.snapshot.phases ?? STANDARD_PHASES).id === 'bidding';
}

/** A flat extruded teardrop: a round end at the origin and its point along +x, stopping just short of the faction token. */
function createTeardropGeometry() {
  const tangent = Math.acos(BIDDER_RADIUS / BIDDER_TIP);
  const shape = new Shape();
  shape.moveTo(BIDDER_TIP, 0);
  shape.lineTo(BIDDER_RADIUS * Math.cos(tangent), BIDDER_RADIUS * Math.sin(tangent));
  shape.absarc(0, 0, BIDDER_RADIUS, tangent, Math.PI * 2 - tangent, false);
  shape.lineTo(BIDDER_TIP, 0);
  const geometry = new ExtrudeGeometry(shape, { depth: BIDDER_DEPTH, bevelEnabled: false, curveSegments: 64 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** The faction the bidder points at: the one it waits on, the winner once a round ends, else the faction that opens the next round. */
function pointedFaction(bidding: BiddingState, eligible: readonly string[]) {
  if (bidding.stage === 'open') {
    return bidding.turn;
  }
  if (bidding.stage === 'won') {
    return bidding.bid?.factionId ?? null;
  }
  return bidding.opener ?? eligible[0] ?? null;
}

function useBidderRotation(target: number | null) {
  const groupRef = useRef<Group>(null);
  const turn = useRef<{ from: number; to: number; startedAt: number } | null>(null);
  const shown = useRef<number | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  useFrame(() => {
    const group = groupRef.current;
    const active = turn.current;
    if (!group || !active) {
      return;
    }
    const linear = Math.min(1, (performance.now() - active.startedAt) / BIDDER_TURN_MS);
    const eased = linear * linear * (3 - 2 * linear);
    group.rotation.y = active.from + (active.to - active.from) * eased;
    if (linear >= 1) {
      turn.current = null;
      return;
    }
    invalidate();
  });
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group || target === null || shown.current === target) {
      return;
    }
    /* The shape points along +x, so turning it by -angle about y points it at the Seat at `angle`. */
    const to = -target;
    if (shown.current === null) {
      group.rotation.y = to;
    } else {
      const from = group.rotation.y;
      turn.current = { from, to: from + Math.atan2(Math.sin(to - from), Math.cos(to - from)), startedAt: performance.now() };
    }
    shown.current = target;
    invalidate();
  }, [invalidate, target]);
  return groupRef;
}

function BidderFace({
  bidding,
  table,
  client,
  remaining,
}: Props & { bidding: BiddingState; remaining: number | null }) {
  const own = table.snapshot.bank?.factionId;
  const artwork = table.snapshot.factionArtwork;
  const names = table.state.factionNames;
  const bid = bidding.bid;
  const bidArtwork = bid ? artwork?.[bid.factionId] : undefined;
  const canAct = table.canInteract && Boolean(own);
  if (bidding.stage !== 'open') {
    return (
      <Stack gap={4} align="center" className={styles.face}>
        {bidding.stage === 'won' && bid ? (
          <div className={styles.disc} data-bidder-result="won">
            {bidArtwork && <FactionToken logo={bidArtwork.logo} background={bidArtwork.background} />}
            <span className={styles.amount}>{bid.amount}</span>
          </div>
        ) : null}
        {bidding.stage === 'unclaimed' ? (
          <Text size="xs" fw={700} className={styles.timer}>
            No bids
          </Text>
        ) : null}
        {bidding.stage === 'won' && bid ? (
          <Text size="xs" fw={700} className={styles.timer}>
            {names[bid.factionId] ?? bid.factionId} wins with {bid.amount}
          </Text>
        ) : null}
        <Button size="compact-xs" disabled={!canAct} onClick={() => client.command({ kind: 'bid-open' })}>
          Start bidding
        </Button>
      </Stack>
    );
  }
  const mine = canAct && own === bidding.turn;
  const turnName = bidding.turn ? (names[bidding.turn] ?? bidding.turn) : '';
  const label = mine
    ? `${bid ? `Raise the bid to ${bid.amount + 1}` : 'Bid 1'}. Right click to pass.`
    : `Waiting for ${turnName}`;
  return (
    <Stack gap={2} align="center" className={styles.face}>
      <UnstyledButton
        className={styles.disc}
        data-bidder-turn={bidding.turn ?? undefined}
        data-mine={mine || undefined}
        aria-label={label}
        title={label}
        disabled={!mine}
        onClick={() => client.command({ kind: 'bid-raise', round: bidding.round })}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (mine) {
            void client.command({ kind: 'bid-pass', round: bidding.round });
          }
        }}
      >
        {bid ? (
          <>
            {bidArtwork && <FactionToken logo={bidArtwork.logo} background={bidArtwork.background} />}
            <span className={styles.amount}>{bid.amount}</span>
          </>
        ) : (
          <span className={styles.prompt}>{mine ? 'Bid' : 'No bid'}</span>
        )}
      </UnstyledButton>
      {remaining !== null ? (
        <Text component="output" role="timer" size="xs" fw={700} className={styles.timer}>
          {remaining}s · {turnName}
        </Text>
      ) : null}
    </Stack>
  );
}

function Bidder({ client, table }: Props) {
  const roster = table.snapshot.roster;
  const bidding = table.snapshot.bidding ?? idleBidding();
  const eligible = useMemo(
    () => biddingFactions(table.state.stormSectorIndex, roster, table.state.pieces),
    [table.state.stormSectorIndex, roster, table.state.pieces]
  );
  const pointed = pointedFaction(bidding, eligible);
  const seat = roster?.seats.find((entry) => entry.faction?.id === pointed);
  const angle = seat && roster ? (tableSeatAngles(roster.seatCount)[seat.position] ?? null) : null;
  const groupRef = useBidderRotation(angle);
  const geometry = useMemo(createTeardropGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const now = useServerNow();
  const remaining =
    bidding.stage === 'open' && bidding.deadline !== null
      ? Math.max(0, Math.ceil((bidding.deadline - now) / 1000))
      : null;
  return (
    <group position={[0, BIDDER_HOVER_Y, 0]}>
      <group ref={groupRef}>
        <mesh geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial color="#24150a" roughness={0.6} />
        </mesh>
      </group>
      <Html center zIndexRange={[9, 0]}>
        <DarkSchemeIsland>
          <BidderFace client={client} table={table} bidding={bidding} remaining={remaining} />
        </DarkSchemeIsland>
      </Html>
    </group>
  );
}

/** The bidder hovers over the board only during the Bidding phase of a seated game. */
export function BidderScene(props: Props) {
  if (!biddingPhase(props.table) || !props.table.snapshot.roster) {
    return null;
  }
  return <Bidder {...props} />;
}

/** The time the bidder gives each faction, set beside the other phase controls. */
export function BidderSettings({ client, table }: Props) {
  const seconds = table.snapshot.bidding?.seconds ?? idleBidding().seconds;
  const [draft, setDraft] = useState<number | string>(seconds);
  useEffect(() => setDraft(seconds), [seconds]);
  if (!biddingPhase(table)) {
    return null;
  }
  return (
    <Section title="Bidder" description="The bidder passes for a faction that has not acted when its time runs out.">
      <NumberInput
        label="Seconds per bid"
        min={MIN_BID_SECONDS}
        max={MAX_BID_SECONDS}
        value={draft}
        disabled={!table.canInteract || !table.snapshot.bank}
        onChange={setDraft}
        onBlur={() => {
          const next = Number(draft);
          if (Number.isInteger(next) && next >= MIN_BID_SECONDS && next <= MAX_BID_SECONDS && next !== seconds) {
            void client.command({ kind: 'bid-seconds', seconds: next });
          } else {
            setDraft(seconds);
          }
        }}
      />
    </Section>
  );
}
