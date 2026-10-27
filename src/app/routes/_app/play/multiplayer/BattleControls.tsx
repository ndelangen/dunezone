import { Button, Group, Stack, Text } from '@mantine/core';
import type { ButtonProps } from '@mantine/core';
import { Html } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { Board } from '@shared/boards/schema';
import { troopBattleFaces } from '@shared/factions/troopBattle';
import type { BattlePlan, DisclosedPlan, PublicBattle } from '@shared/play/battle';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import type { TablePiece, Vector3Tuple } from '@shared/play/model';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import { resolveRulebookBoardDefinition } from '@shared/rulebooks/boardDefinitions';
import { Section } from '@ui/block/Section';
import { CalloutSurface } from '@ui/surface/CalloutSurface';
import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useReducer, useRef, useSyncExternalStore } from 'react';
import type { Camera } from 'three';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';

import { useMotionAllowed } from '@app/styles/motion';
import { BattleWheel as BattleWheelAsset } from '@game/assets/generic/BattleWheel';
import { factionTokenFixtures } from '@game/fixtures/factionTokens';

import type { TableSession, TableProjection } from '../../../../db/tabletop/TableSession';
import { PointerSessionContext, usePointerSession } from '../../../../widgets/tabletop/PointerSessionContext';
import { TABLE_PLATE_BOUNDS } from '../../../../widgets/tabletop/tablePlateGeometry';
import { LedgerPlan } from '../battlePlan/LedgerPlan';
import { ModeToggle } from '../battlePlan/parts';
import { planLocks, supportMatters } from '../battlePlan/planView';
import type { BattlePlanViewProps, WheelArt } from '../battlePlan/planView';
import { DarkSchemeIsland } from '../DarkSchemeIsland';
import { useHandOrder } from '../panels/hand/useHandOrder';
import { BattleBeacon } from './BattleBeacon';
import styles from './BattleControls.module.css';
import { battleCapsuleY, headerInset } from './battlePlacement';
import { PieceImage, pieceName } from './HandPiece';
import { battleHelp } from './panelGuidance';
import { isSpectator } from './tableFactions';

type Props = { client: TableSession; table: TableProjection };
type Outcome = NonNullable<NonNullable<PublicBattle['sides'][number]>['choice']>;
const OUTCOME_LABELS: Readonly<Record<Outcome, string>> = {
  left: 'Left side won',
  none: 'No winner',
  right: 'Right side won',
};
type FactionArtwork = TableProjection['snapshot']['factionArtwork'];
type FactionNames = TableProjection['state']['factionNames'];
/* A real game keys factions by their Convex ids, so every battle label reads the roster's name and keeps the id only when the roster has none. */
function rosterName(factionId: string, names: FactionNames) {
  return names[factionId] ?? factionId;
}
type WheelProps = {
  artwork?: FactionArtwork;
  plan: BattlePlan;
  factionId: string;
  factionName: string;
  client?: TableSession;
  active?: Set<string>;
};
function factionArtwork(factionId: string, artwork?: FactionArtwork) {
  return artwork?.[factionId] ?? factionTokenFixtures[factionId === 'atreides' ? 'atreides' : 'harkonnen'];
}
function visiblePiece(piece: TablePiece, active?: Set<string>) {
  return !active || active.has(piece.id);
}
function DraggablePiece({ piece, client, style }: { piece: TablePiece; client?: TableSession; style?: CSSProperties }) {
  const pointerSession = usePointerSession();
  return (
    <Button
      variant="transparent"
      h="auto"
      p={0}
      styles={{ label: { height: 'auto' } }}
      style={style}
      className={styles.piece}
      aria-label={`Drag ${pieceName(piece)} onto table`}
      disabled={!client}
      onPointerDown={(event) => {
        if (event.button !== 0 || !client) {
          return;
        }
        event.preventDefault();
        pointerSession.carry(event.nativeEvent, piece.id, 'whole');
      }}
    >
      <PieceImage piece={piece} />
    </Button>
  );
}
/* The plan's capable troops as the wheel shows them, each dressed in the faction's own troop artwork. */
function wheelTroops(
  plan: BattlePlan,
  factionId: string,
  background: ReturnType<typeof factionArtwork>['background'],
  retained: NonNullable<FactionArtwork>[string] | undefined
) {
  const retainedFaces = retained && new Map(troopBattleFaces(retained.troops).map((entry) => [entry.id, entry.face]));
  return plan.faces
    .filter((face) => face.capable)
    .flatMap((face) => {
      const troop = plan.troops.find((entry) => entry.faceId === face.id);
      const authored = retainedFaces?.get(face.id);
      /* Real games never borrow a fixture house's troop artwork; a captured face is found by its identity, not its name. */
      if (retainedFaces && !authored) {
        return [];
      }
      return [
        {
          id: face.id,
          name: face.name,
          dialed: troop?.dialed ?? 0,
          undialed: troop?.undialed ?? 0,
          artwork: {
            background,
            image:
              authored?.image ??
              (factionId === 'atreides' ? '/vector/troop/atreides.svg' : '/vector/troop/harkonnen.svg'),
            star: authored?.star,
            hue: authored?.hue,
            striped: authored?.striped,
          },
        },
      ];
    });
}
/** Play owns piece visibility, pointer sessions and the Motion verdict; the asset owns the wheel artwork. */
function BattleWheel({ plan, factionId, factionName, client, active, artwork }: WheelProps) {
  const leaders = plan.pieces.filter((piece) => plan.leaderIds.includes(piece.id) && visiblePiece(piece, active));
  const motion = useMotionAllowed();
  const retained = artwork?.[factionId];
  const { background } = factionArtwork(factionId, artwork);
  return (
    <BattleWheelAsset
      state="revealed"
      motion={motion}
      className={styles.wheel}
      label={`${factionName} plan, troop strength ${plan.strength}, ${plan.spice} spice`}
      background={background}
      strength={plan.strength}
      spice={plan.spice}
      adjustment={plan.adjustment}
      troops={wheelTroops(plan, factionId, background, retained)}
      cards={plan.pieces
        .filter((piece) => plan.cardIds.includes(piece.id) && visiblePiece(piece, active))
        .map((piece) => (
          <DraggablePiece key={piece.id} piece={piece} client={client} />
        ))}
      leaders={leaders.map((leader) => (
        <DraggablePiece key={leader.id} piece={leader} client={client} />
      ))}
    />
  );
}

/* The plan's wheel dressed in the faction's own artwork, with what each troop face does and how many of it the faction owns. */
function planDress(plan: BattlePlan, factionId: string, artwork?: FactionArtwork) {
  const retained = artwork?.[factionId];
  const { background } = factionArtwork(factionId, artwork);
  const faces = retained ? troopBattleFaces(retained.troops) : [];
  const wheelArt: WheelArt = {
    background,
    troops: Object.fromEntries(
      wheelTroops(plan, factionId, background, retained).map((troop) => [troop.id, troop.artwork])
    ),
    descriptions: Object.fromEntries(faces.map(({ id, face }) => [id, face.description])),
  };
  /* A troop's two faces are one token, so either face can field as many as the faction owns of that troop. */
  const troopLimit = retained
    ? Object.fromEntries(faces.map(({ id, troopIndex }) => [id, retained.troops[troopIndex]!.count]))
    : undefined;
  const troopOf = Object.fromEntries(faces.map(({ id, troopIndex }) => [id, String(troopIndex)]));
  return { wheelArt, troopLimit, troopOf };
}

type PlanProps = Props & { plan: BattlePlan; battle: PublicBattle };

/** The ids in the player's order, as the wheel lays them out; ids shown to everyone keep their places, as the room keeps them. */
function inOrderOf(pieces: readonly TablePiece[], ids: readonly string[], shown: (id: string) => boolean) {
  const at = (id: string) => pieces.findIndex((piece) => piece.id === id);
  const free = ids.filter((id) => !shown(id)).toSorted((a, b) => at(a) - at(b));
  return ids.map((id) => (shown(id) ? id : free.shift()!));
}

/**
 * The viewer's plan as the Battle plan window shows it: data from the table in, each intent sent to the table.
 * Its pieces come in the player's own order, which the Hand & spice window shares and either window changes;
 * pieces on the private side-table have no place in that order, so they follow at the end and keep their places.
 */
function usePlanView({ client, table, plan, battle }: PlanProps): BattlePlanViewProps {
  const hand = table.snapshot.hand ?? [];
  const aside = hand.filter((piece) => piece.hiddenZone);
  const order = useHandOrder(client, table, [...hand.filter((piece) => !piece.hiddenZone), ...plan.pieces]);
  const bank = table.snapshot.bank!;
  const factionId = bank.factionId;
  const own = battle.sides.find((side) => side?.factionId === factionId);
  const other = battle.sides.find((side) => side && side.factionId !== factionId);
  const names = snapshotFactionLabels(table.snapshot);
  return {
    plan: {
      ...plan,
      leaderIds: inOrderOf(order.pieces, plan.leaderIds, () => plan.disclosed.leader),
      cardIds: inOrderOf(order.pieces, plan.cardIds, (id) => plan.disclosed.cardIds.includes(id)),
    },
    hand: [...order.pieces, ...aside],
    balance: bank.balance,
    stage: battle.stage,
    ready: own?.ready ?? false,
    canAct: table.canHandleTable,
    opponent: other ? { name: rosterName(other.factionId, names), ready: other.ready } : null,
    ...planDress(plan, factionId, table.snapshot.factionArtwork),
    onEdit: (patch) => client.editBattlePlan(patch),
    onReorder: (piece, before) => {
      if (!piece.hiddenZone) {
        order.reorder(piece, aside.some((entry) => entry.id === before) ? null : before);
      }
    },
    onReady: (ready) => client.command({ kind: 'battle-ready', battleId: battle.id, ready }),
    onDisclose: (disclosure, shown) =>
      client.command({ kind: 'battle-disclose', battleId: battle.id, disclosure, shown }),
  };
}

/** Max or Custom support, in the Battle plan window's title bar while the viewer has a plan. */
export function BattleModeToggle({ client, table }: Props) {
  const { battle, battlePlan: plan, bank } = table.snapshot;
  if (!plan || !battle || !bank) {
    return null;
  }
  const own = battle.sides.find((side) => side?.factionId === bank.factionId);
  return (
    <ModeToggle
      mode={plan.mode}
      disabled={
        planLocks({ plan, stage: battle.stage, ready: own?.ready ?? false, canAct: table.canHandleTable }).dialLocked
      }
      free={!supportMatters(plan)}
      onChange={(mode) => client.editBattlePlan({ mode })}
    />
  );
}

function BattleResults({
  results: battleResults,
  artwork,
  names,
}: {
  results: NonNullable<TableProjection['snapshot']['battleResults']>;
  artwork?: FactionArtwork;
  names: FactionNames;
}) {
  return (
    <Section hiddenHeading title="Battle results">
      {battleResults.length ? (
        battleResults.map((result) => (
          <Stack key={result.id} gap="xs">
            <Text>
              {result.territory}: {result.factions.map((id) => rosterName(id, names)).join(' against ')}.{' '}
              {OUTCOME_LABELS[result.outcome]}.
            </Text>
            <Group pt={40}>
              {result.plans.map((plan, side) => (
                <BattleWheel
                  key={side}
                  plan={plan}
                  factionId={result.factions[side]}
                  factionName={rosterName(result.factions[side], names)}
                  artwork={artwork}
                />
              ))}
            </Group>
          </Stack>
        ))
      ) : (
        <Text size="sm">No agreed battle results yet.</Text>
      )}
    </Section>
  );
}

/* Without a plan of its own, the panel says why: no battle, the plans are out, or the viewer cannot claim a side. */
function battleNotice(table: TableProjection, battle: PublicBattle | null | undefined) {
  if (!battle) {
    return 'No battle in progress.';
  }
  if (battle.stage === 'revealed') {
    return 'Both plans are revealed on the table.';
  }
  if (isSpectator(table) || battle.sides.every(Boolean)) {
    return 'Only the two sides see their plans until the reveal.';
  }
  return 'Claim a side on the table to prepare your private plan.';
}

function PlanWindow(props: PlanProps) {
  return <LedgerPlan {...usePlanView(props)} />;
}

/** The viewer's own plan for the battle on the table, or why there is none. */
export function BattleControls({ client, table }: Props) {
  const { battle, battlePlan } = table.snapshot;
  if (battlePlan && battle && table.snapshot.bank) {
    return <PlanWindow client={client} table={table} plan={battlePlan} battle={battle} />;
  }
  return (
    <Section hiddenHeading title="Battle" description={battleHelp(table)}>
      <Text size="sm">{battleNotice(table, battle)}</Text>
    </Section>
  );
}

/** Agreed battle results remain readable independently of the current battle and phase. */
export function BattleHistory({ table }: Pick<Props, 'table'>) {
  return (
    <BattleResults
      results={table.snapshot.battleResults ?? []}
      artwork={table.snapshot.factionArtwork}
      names={snapshotFactionLabels(table.snapshot)}
    />
  );
}

type Placement = { anchor: [number, number]; capsule: [number, number] };
const UNPLACED: Placement = { anchor: [0, 0], capsule: [0, 0] };
/* Equal as their JSON would be, so a placement that cannot be projected counts as unchanged too. */
function sameCoordinate(before: number, next: number) {
  return before === next || (Number.isNaN(before) && Number.isNaN(next));
}
function samePlacement(before: Placement, next: Placement) {
  return (
    sameCoordinate(before.anchor[0], next.anchor[0]) &&
    sameCoordinate(before.anchor[1], next.anchor[1]) &&
    sameCoordinate(before.capsule[0], next.capsule[0]) &&
    sameCoordinate(before.capsule[1], next.capsule[1])
  );
}
function battlePlacement(
  battleAnchor: PublicBattle['anchor'],
  camera: Camera,
  size: { width: number; height: number },
  canvas: HTMLCanvasElement
): Placement {
  const projected = new Vector3(...battleAnchor).project(camera);
  const anchor: [number, number] = [
    Math.round(((projected.x + 1) * size.width) / 2),
    Math.round(((1 - projected.y) * size.height) / 2),
  ];
  return { anchor, capsule: [size.width / 2, battleCapsuleY(anchor[1], size.height, headerInset(canvas))] };
}
function useBattlePlacement(battle: PublicBattle | null | undefined) {
  const { camera, size, renderer } = useThree();
  const [placement, place] = useReducer(
    (before: Placement, next: Placement) => (samePlacement(before, next) ? before : next),
    UNPLACED
  );
  /* The placement last sent, so a frame that leaves it where it was sends nothing. */
  const placed = useRef(UNPLACED);
  useFrame(() => {
    if (!battle) {
      return;
    }
    const next = battlePlacement(battle.anchor, camera, size, renderer.domElement);
    if (!samePlacement(placed.current, next)) {
      placed.current = next;
      place(next);
    }
  });
  return placement;
}
function dropPosition(event: DragEvent, canvas: HTMLCanvasElement, camera: Camera) {
  const bounds = canvas.getBoundingClientRect();
  const ray = new Raycaster();
  ray.setFromCamera(
    new Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(event.clientY - bounds.top) / bounds.height) * 2 + 1
    ),
    camera
  );
  const point = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -0.18), new Vector3());
  return point && ([point.x, 0.18, point.z] as Vector3Tuple);
}
/* The plate reaches past the board to the card bays and shelves, and a hand piece may land anywhere on it. */
function onTablePlate([x, , z]: Vector3Tuple) {
  const { minX, maxX, minZ, maxZ } = TABLE_PLATE_BOUNDS;
  return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
}
/* These parts group several territories, and the storm sectors cut across all of them, so none of them names where a battle is. */
const BOARD_GROUPS = new Set(['strongholds', 'rock', 'sand', 'sectors']);
/**
 * The territory a table point falls in, read from the rulebook board that the table map draws edge to edge across the board disc.
 * The disc maps onto the board's unit square by the board radius, and each territory's outline is tested in that square.
 * A point outside every territory keeps the generic name.
 */
async function territoryAt(position: Vector3Tuple, board?: Board) {
  if (board) {
    const { boardTerritoryAt, CENTER, RADIUS } = await import('@shared/boards/territories');
    return (
      boardTerritoryAt(board, [
        CENTER[0] + (position[0] * RADIUS) / BOARD_RADIUS,
        CENTER[1] + (position[2] * RADIUS) / BOARD_RADIUS,
      ])?.name ?? 'Marked territory'
    );
  }
  const parts = resolveRulebookBoardDefinition('arrakis')?.geometry.parts ?? [];
  const context = document.createElement('canvas').getContext('2d');
  const x = position[0] / (2 * BOARD_RADIUS) + 0.5;
  const y = position[2] / (2 * BOARD_RADIUS) + 0.5;
  const territory = parts.find(
    (part) =>
      !BOARD_GROUPS.has(part.key) &&
      part.highlight?.paths.some(({ d, transform }) => {
        const outline = new Path2D();
        outline.addPath(new Path2D(d), transform && new DOMMatrix(transform));
        return context?.isPointInPath(outline, x, y, 'evenodd');
      })
  );
  return territory?.label ?? 'Marked territory';
}
async function sendDrop(client: TableSession, event: DragEvent, position: Vector3Tuple) {
  const pieceId = event.dataTransfer?.getData('application/dune-hand');
  if (pieceId && onTablePlate(position)) {
    client.command({ kind: 'hand-play', pieceId, position });
  }
}
/** Marks a battle at a table point, named for the territory under it, unless the table moved on while the name loaded. */
async function markBattle(client: TableSession, position: Vector3Tuple) {
  const before = client.getTable();
  const territory = await territoryAt(position, before?.snapshot.board?.definition);
  const current = client.getTable();
  if (current?.canHandleTable && before?.snapshot.revision === current.snapshot.revision) {
    client.command({ kind: 'battle-start', anchor: position, territory });
  }
}
function useInventoryDrop({ client, table }: Props) {
  const { camera, renderer } = useThree();
  useEffect(() => {
    const canvas = renderer.domElement;
    const over = (event: DragEvent) => event.preventDefault();
    const drop = (event: DragEvent) => {
      event.preventDefault();
      if (!table.canHandleTable) {
        return;
      }
      const position = dropPosition(event, canvas, camera);
      if (position) {
        void sendDrop(client, event, position).catch(() => {
          /* A failed geometry load leaves the marker available for another drop. */
        });
      }
    };
    canvas.addEventListener('dragover', over);
    canvas.addEventListener('drop', drop);
    return () => {
      canvas.removeEventListener('dragover', over);
      canvas.removeEventListener('drop', drop);
    };
  }, [camera, renderer, client, table.canHandleTable]);
}
type ActiveProps = Props & { battle: PublicBattle; own: number };
function OutcomeButton({ client, table, battle, own, outcome }: ActiveProps & { outcome: Outcome }) {
  return (
    <Button
      size="xs"
      className={outcome === 'none' ? undefined : styles.outcome}
      data-outcome={outcome}
      aria-label={OUTCOME_LABELS[outcome]}
      color="brand"
      variant={own >= 0 && battle.sides[own]?.choice === outcome ? 'filled' : 'default'}
      disabled={!table.canHandleTable || own < 0}
      onClick={() => client.command({ kind: 'battle-outcome', battleId: battle.id, outcome })}
    >
      {outcome === 'none' ? 'No winner' : outcome === 'left' ? 'Left won' : 'Right won'}
    </Button>
  );
}
/* One button ends the battle at both stages it is offered in: before the reveal it cancels, after it the battle is resolved. */
function CancelBattleButton({
  client,
  table,
  battle,
  size,
  variant,
  className,
  fullWidth,
}: ActiveProps & Pick<ButtonProps, 'size' | 'variant' | 'className' | 'fullWidth'>) {
  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      fullWidth={fullWidth}
      disabled={!table.canHandleTable}
      onClick={() => client.command({ kind: 'battle-cancel', battleId: battle.id })}
    >
      {battle.stage === 'revealed' ? 'Resolve battle' : 'Cancel battle'}
    </Button>
  );
}
function BattleActions(props: ActiveProps) {
  const { battle } = props;
  if (battle.stage === 'preparing') {
    return <CancelBattleButton {...props} size="xs" className={styles.cancel} variant="default" fullWidth />;
  }
  if (battle.stage !== 'revealed') {
    return null;
  }
  return (
    <>
      <OutcomeButton {...props} outcome="left" />
      <OutcomeButton {...props} outcome="right" />
    </>
  );
}
/* After one side calls a winner, the battle stays open until the other side agrees; this says who it waits on. */
function waitingOn({ battle, table, own }: ActiveProps) {
  const called = battle.sides.findIndex((side) => side?.choice);
  if (called < 0 || own < 0) {
    return null;
  }
  const other = battle.sides[own === 0 ? 1 : 0]!;
  const names = snapshotFactionLabels(table.snapshot);
  /* Once the other side has called too, their call is the news: the two calls differ, or the battle would have settled. */
  if (!other.choice) {
    return `Waiting for ${rosterName(other.factionId, names)} to agree`;
  }
  const call = OUTCOME_LABELS[other.choice];
  return `${rosterName(other.factionId, names)} says ${call.toLowerCase()}`;
}
function BattleCentre(props: ActiveProps) {
  if (props.battle.stage === 'revealed') {
    /* Anyone seated can end a revealed battle; it settles with the winner a side called, unless the sides called different winners. */
    const waiting = waitingOn(props);
    return (
      <Stack gap={4} align="center">
        {waiting && (
          <Text size="xs" ta="center" maw={140} aria-live="polite">
            {waiting}
          </Text>
        )}
        <OutcomeButton {...props} outcome="none" />
        <CancelBattleButton {...props} size="compact-xs" variant="subtle" className={styles.resolve} />
      </Stack>
    );
  }
  if (props.battle.stage !== 'countdown') {
    return null;
  }
  return <BattleCountdown client={props.client} />;
}
/* The seconds left re-render on their own each second; the battle around them waits for the table to change. */
function BattleCountdown({ client }: { client: TableSession }) {
  const seconds = useSyncExternalStore(
    client.subscribeBattleCountdown,
    client.getBattleCountdownSeconds,
    client.getBattleCountdownSeconds
  );
  return (
    <Text size="xl" fw={700} role="timer">
      {seconds}
    </Text>
  );
}
/*
 * Parts revealed early lie on the closed wheel exactly where the reveal will draw them: the layer shares the revealed
 * wheel's 170 px frame and zoom steps, so cards fan above it, the dial's number sits in the strength slot and the
 * leader in the leader slot. The closed wheel underneath stays the asset's own, readiness ring included.
 */
function EarlyRevealWheel({
  early,
  factionName,
  children,
}: {
  early: DisclosedPlan;
  factionName: string;
  children: ReactNode;
}) {
  const { leaders = [], dial, cards } = early;
  const motion = useMotionAllowed();
  return (
    <div className={styles.early}>
      {children}
      <div className={clsx(styles.wheel, styles.earlyLayer)} data-motion={motion ? 'ok' : 'reduce'}>
        {cards.length ? (
          <ul className={styles.earlyCards} aria-label={`${factionName} cards revealed early`}>
            {cards.map((piece, index) => {
              const offset = index - (cards.length - 1) / 2;
              return (
                <li
                  key={piece.id}
                  className={styles.earlyCard}
                  style={{ transform: `translateX(calc(-50% + ${offset * 32}px)) rotate(${offset * 14}deg)` }}
                >
                  <PieceImage piece={piece} />
                </li>
              );
            })}
          </ul>
        ) : null}
        {dial ? (
          <div
            className={styles.earlyDial}
            role="img"
            aria-label={`${factionName} dial revealed early: ${dial.strength}`}
          >
            <span>{dial.strength}</span>
            <small>Strength</small>
          </div>
        ) : null}
        {leaders.map((leader, index) => (
          <div
            key={leader.id}
            className={styles.earlyLeader}
            style={index ? { translate: `${-index * 10}px ${-index * 8}px`, zIndex: -index } : undefined}
            aria-label={`${factionName} leader revealed early`}
            role="group"
          >
            <PieceImage piece={leader} />
          </div>
        ))}
      </div>
    </div>
  );
}
function SideContents({
  client,
  table,
  battle,
  own,
  index,
  active,
}: ActiveProps & { index: 0 | 1; active: Set<string> }) {
  const side = battle.sides[index];
  const motion = useMotionAllowed();
  const names = snapshotFactionLabels(table.snapshot);
  if (battle.revealed) {
    return (
      <BattleWheel
        plan={battle.revealed[index]}
        factionId={side!.factionId}
        factionName={rosterName(side!.factionId, names)}
        artwork={table.snapshot.factionArtwork}
        client={table.canHandleTable ? client : undefined}
        active={active}
      />
    );
  }
  const early = battle.disclosed?.[index];
  if (side) {
    const name = rosterName(side.factionId, names);
    const closed = (
      <BattleWheelAsset
        state="unrevealed"
        motion={motion}
        label={`${name}, ${index === 0 ? 'left side, aggressor' : 'right side'}, ${side.ready ? 'Ready' : 'Preparing'}`}
        artwork={factionArtwork(side.factionId, table.snapshot.factionArtwork)}
        ready={side.ready}
      />
    );
    if (early && (early.leaders?.length || early.dial || early.cards.length)) {
      return (
        <EarlyRevealWheel early={early} factionName={name}>
          {closed}
        </EarlyRevealWheel>
      );
    }
    return closed;
  }
  return (
    <Button
      className={styles.claim}
      aria-label={index ? 'Claim right side' : 'Claim left side'}
      styles={{ label: { whiteSpace: 'normal' } }}
      variant="default"
      disabled={!table.canHandleTable || own >= 0}
      onClick={() => client.command({ kind: 'battle-claim', battleId: battle.id, side: index })}
    >
      {index ? 'Claim right' : 'Claim left'}
    </Button>
  );
}
function BattleSides(props: ActiveProps) {
  const { battle, table } = props;
  const active = new Set(
    table.snapshot.table.pieces.filter((piece) => piece.battleOverlay === battle.id).map((piece) => piece.id)
  );
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm" pos="relative">
      {([0, 1] as const).map((index) => {
        const side = battle.sides[index];
        return (
          <div className={styles.side} key={index}>
            <SideContents {...props} index={index} active={active} />
            {side?.choice && (
              <Text className={styles.choice} size="xs">
                {OUTCOME_LABELS[side.choice]}
              </Text>
            )}
          </div>
        );
      })}
      <div className={styles.centre}>
        <BattleCentre {...props} />
      </div>
    </Group>
  );
}
function BattleCallout({ client, table, battle, placement }: Props & { battle: PublicBattle; placement: Placement }) {
  const pointerSession = usePointerSession();
  const canvas = useThree((state) => state.renderer.domElement);
  const { anchor, capsule } = placement;
  const faction = table.snapshot.bank?.factionId;
  const own = faction ? battle.sides.findIndex((side) => side?.factionId === faction) : -1;
  const props = { client, table, battle, own };
  /* Html reads its position only in its own frame and the table draws on demand, so the capsule is projected in that frame: `capsule` from state commits after the frame that computed it, and Html would not read it until something else asked for a frame. */
  return (
    <Html
      position={battle.anchor}
      center
      zIndexRange={[10, 0]}
      calculatePosition={(_, camera, size) => battlePlacement(battle.anchor, camera, size, canvas).capsule}
    >
      <PointerSessionContext value={pointerSession}>
        <DarkSchemeIsland>
          <div className={styles.callout} data-battle-stage={battle.stage}>
            <CalloutSurface
              pointer={[anchor[0] - capsule[0], anchor[1] - capsule[1]]}
              actions={
                <Group className={styles.actions} gap={4} justify="space-between" wrap="nowrap">
                  <BattleActions {...props} />
                </Group>
              }
            >
              <BattleSides {...props} />
            </CalloutSurface>
          </div>
        </DarkSchemeIsland>
      </PointerSessionContext>
    </Html>
  );
}
/** The scene owns pointer projection; every drop remains an intent sent to the game authority. */
export function BattleScene(props: Props) {
  const battle = props.table.snapshot.battle;
  const placement = useBattlePlacement(battle);
  useInventoryDrop(props);
  return (
    <>
      <BattleBeacon
        table={props.table}
        battle={battle}
        onDrop={(position) => {
          void markBattle(props.client, position).catch(() => {
            /* A failed geometry load leaves the beacon at the tracker for another drop. */
          });
        }}
      />
      {battle ? <BattleCallout {...props} battle={battle} placement={placement} /> : null}
    </>
  );
}
