/* @jsxImportSource ../three-jsx */
import { Html } from '@react-three/drei/webgpu';
import { biddingFactions, idleBidding } from '@shared/play/bidding';
import type { BiddingState } from '@shared/play/bidding';
import { phaseAt, STANDARD_PHASES } from '@shared/play/phases';
import { BOARD_RADIUS, BOARD_SURFACE_Y } from '@shared/play/tableGeometry';
import { PLAYER_RING_RADIUS, tableSeatAngles } from '@shared/play/tableSettings';
import { useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Shape } from 'three';

import { DarkSchemeIsland } from '../DarkSchemeIsland';
import { OpenRound, RoundResult } from './BidderFace';
import { useBidderRotation } from './bidderRotation';
import type { TableProjection, TableSession } from './TableSession';
import { useServerNow } from './useServerNow';

type Props = { client: TableSession; table: TableProjection };

/* The round base covers about a third of the planet's radius (Norbert, #1007). */
const BIDDER_RADIUS = BOARD_RADIUS * 0.35;
/* The token rests on the Seat's station at the player ring; the point stops a hand's width short of its edge. */
const BIDDER_TIP = PLAYER_RING_RADIUS - 0.5;
const BIDDER_DEPTH = 0.08;
const BIDDER_HOVER_Y = BOARD_SURFACE_Y + 0.35;

export function biddingPhase(table: TableProjection) {
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
          {bidding.stage === 'open' ? (
            <OpenRound client={client} table={table} bidding={bidding} remaining={remaining} />
          ) : (
            <RoundResult client={client} table={table} bidding={bidding} />
          )}
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
