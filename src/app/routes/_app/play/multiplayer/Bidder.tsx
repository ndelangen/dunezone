/* @jsxImportSource @app/widgets/tabletop/three-jsx */

import { Html } from '@react-three/drei/webgpu';
import { BID_WARNING_MS, biddingFactions, idleBidding } from '@shared/play/bidding';
import type { BiddingState } from '@shared/play/bidding';
import { factionTokenOf, factionTokenRingAngle } from '@shared/play/factionToken';
import type { TablePiece } from '@shared/play/model';
import { phaseAt, STANDARD_PHASES } from '@shared/play/phases';
import type { TableRoster } from '@shared/play/schema';
import { stormOrder } from '@shared/play/stormSector';
import { BOARD_RADIUS, BOARD_SURFACE_Y } from '@shared/play/tableGeometry';
import { PLAYER_RING_RADIUS, tableSeatAngles } from '@shared/play/tableSettings';
import { playUiColors } from '@shared/uiPalette';
import { DarkSchemeIsland } from '@ui/surface/DarkSchemeIsland';
import { useContext, useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Shape } from 'three';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import styles from './Bidder.module.css';
import { OpenRound, RoundResult } from './BidderFace';
import { faceHalfHeight, faceHalfWidth, faceOnCanvas } from './bidderFacePosition';
import { useBidderRotation } from './bidderRotation';
import { ServerClockContext, useServerNow } from './useServerNow';

type Props = { client: TableSession; table: TableProjection; faded?: boolean };

/* How much of the bidder a player who faded it still sees. */
const FADED_OPACITY = 0.1;

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

/* The bidder points at the faction's token where it stands on the ring, or at its seat when the table has no token. */
function pointedAngle(roster: TableRoster | undefined, pieces: readonly TablePiece[], factionId: string | null) {
  const token = factionId ? factionTokenOf(pieces, factionId) : undefined;
  if (token) {
    return factionTokenRingAngle(token.position);
  }
  const seat = roster?.seats.find((entry) => entry.faction?.id === factionId);
  return seat && roster ? (tableSeatAngles(roster.seatCount)[seat.position] ?? null) : null;
}

function Bidder({ client, table, faded = false }: Props) {
  const roster = table.snapshot.roster;
  const bidding = table.snapshot.bidding ?? idleBidding();
  const order = useMemo(
    () => stormOrder(table.state.stormSectorIndex, roster, table.state.pieces),
    [table.state.stormSectorIndex, roster, table.state.pieces]
  );
  const eligible = useMemo(
    () => biddingFactions(table.state.stormSectorIndex, roster, table.state.pieces),
    [table.state.stormSectorIndex, roster, table.state.pieces]
  );
  const pointed = pointedFaction(bidding, eligible);
  const angle = pointedAngle(roster, table.state.pieces, pointed);
  const groupRef = useBidderRotation(angle);
  const geometry = useMemo(() => createTeardropGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  /* Between rounds the face holds a button per faction, so it needs more room from the canvas edge than a round's disc. */
  const factions = bidding.stage === 'open' ? null : order.length;
  const halfWidth = faceHalfWidth(factions);
  const halfHeight = faceHalfHeight(factions);
  const placeFace = useMemo(() => faceOnCanvas(halfWidth, halfHeight), [halfWidth, halfHeight]);
  /* An untimed round shows no clock, so the tick leaves it alone. */
  const tick = useServerNow(bidding.timed);
  /* The shared reading can be up to a second older than a new deadline, so a new deadline takes a fresh one and never opens a second high. */
  const serverClock = useContext(ServerClockContext);
  const reading = useMemo(() => (bidding.deadline === null ? 0 : serverClock()), [serverClock, bidding.deadline]);
  const now = Math.max(tick, reading);
  const remaining =
    bidding.timed && bidding.stage === 'open' && bidding.deadline !== null
      ? Math.max(0, Math.ceil((bidding.deadline - BID_WARNING_MS - now) / 1000))
      : null;
  return (
    <group position={[0, BIDDER_HOVER_Y, 0]}>
      <group ref={groupRef}>
        <mesh geometry={geometry} castShadow={!faded} receiveShadow>
          {/* Three compiles transparency into the material, so fading swaps in a new one. */}
          <meshStandardMaterial
            key={faded ? 'faded' : 'solid'}
            color={playUiColors.bidderGround}
            roughness={0.6}
            transparent={faded}
            opacity={faded ? FADED_OPACITY : 1}
            depthWrite={!faded}
          />
        </mesh>
      </group>
      <Html center zIndexRange={[9, 0]} calculatePosition={placeFace}>
        <DarkSchemeIsland>
          <div className={faded ? styles.faded : undefined}>
            {bidding.stage === 'open' ? (
              <OpenRound
                client={client}
                table={table}
                bidding={bidding}
                now={now}
                remaining={remaining}
                warningRemaining={
                  remaining === 0 && bidding.deadline !== null
                    ? Math.max(0, Math.ceil((bidding.deadline - now) / 1000))
                    : null
                }
              />
            ) : (
              <RoundResult client={client} table={table} bidding={bidding} order={order} eligible={eligible} />
            )}
          </div>
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
