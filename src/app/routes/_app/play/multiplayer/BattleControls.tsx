import { Button, Checkbox, Group, Menu, NumberInput, Radio, Select, Stack, Text, VisuallyHidden } from '@mantine/core';
import type { ButtonProps, NumberInputProps } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { Html } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { Board } from '@shared/boards/schema';
import { troopBattleFaces } from '@shared/factions/troopBattle';
import { isBattleLeader } from '@shared/play/battle';
import type {
  BattlePlan,
  BattlePlanInput,
  BattleFace,
  Disclosure,
  DisclosedPlan,
  PublicBattle,
} from '@shared/play/battle';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { hiddenZoneView, nextHiddenZoneSpot } from '@shared/play/hiddenZone';
import type { TablePiece, Vector3Tuple } from '@shared/play/model';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import { resolveRulebookBoardDefinition } from '@shared/rulebooks/boardDefinitions';
import { Section } from '@ui/block/Section';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { CalloutSurface } from '@ui/surface/CalloutSurface';
import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import type { Camera } from 'three';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';

import { useMotionAllowed } from '@app/styles/motion';
import { BattleWheel as BattleWheelAsset } from '@game/assets/generic/BattleWheel';
import { factionTokenFixtures } from '@game/fixtures/factionTokens';

import type { TableSession, TableProjection } from '../../../../db/tabletop/TableSession';
import { PointerSessionContext, usePointerSession } from '../../../../widgets/tabletop/PointerSessionContext';
import { TABLE_PLATE_BOUNDS } from '../../../../widgets/tabletop/tablePlateGeometry';
import { DarkSchemeIsland } from '../DarkSchemeIsland';
import { useTableControls } from '../tableControls';
import { BattleBeacon } from './BattleBeacon';
import styles from './BattleControls.module.css';
import { battleCapsuleY, headerInset } from './battlePlacement';
import { PieceImage, pieceName } from './HandPiece';
import { HandPieceMenu, handMenuAnchor } from './HiddenZone';
import type { HandMenuAnchor } from './HiddenZone';
import { battleHelp, handHelp } from './panelGuidance';
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
  const leader = plan.pieces.find((piece) => piece.id === plan.leaderId);
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
      leader={leader && visiblePiece(leader, active) ? <DraggablePiece piece={leader} client={client} /> : undefined}
    />
  );
}

function completedNumber(draft: string | number | null, props: NumberInputProps): number | null {
  if (draft === null || draft === '') {
    return null;
  }
  const bounded = Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, Number(draft)));
  if (!Number.isFinite(bounded)) {
    return null;
  }
  if (props.allowDecimal === false && !Number.isSafeInteger(bounded)) {
    return null;
  }
  return bounded;
}

/** Keep incomplete numeric text local and commit one complete value on blur or Enter. */
function BattleNumberInput({
  value,
  onChange,
  ...props
}: Omit<NumberInputProps, 'value' | 'onChange'> & { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | number | null>(null);
  return (
    <NumberInput
      {...props}
      allowNegative={props.min === undefined || props.min < 0}
      value={draft ?? value}
      onChange={setDraft}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        const next = completedNumber(draft, props);
        if (next !== null && next !== value) {
          onChange(next);
        }
        setDraft(null);
      }}
    />
  );
}

type PlanEditor = { plan: BattlePlan; locked: boolean; update: (patch: Partial<BattlePlanInput>) => void };
function TroopFaceFields({
  plan,
  face,
  locked,
  update,
  single,
  spiceLimit,
}: PlanEditor & { face: BattleFace; single: boolean; spiceLimit: number }) {
  const troop = plan.troops.find((troop) => troop.faceId === face.id) ?? {
    faceId: face.id,
    undialed: 0,
    dialed: 0,
  };
  const set = (value: Partial<typeof troop>) =>
    update({
      troops: [...plan.troops.filter((entry) => entry.faceId !== face.id), { ...troop, ...value }],
    });
  const otherSpice = plan.troops.reduce((total, entry) => {
    if (entry.faceId === face.id) {
      return total;
    }
    const otherFace = plan.faces.find((candidate) => candidate.id === entry.faceId);
    return total + entry.dialed * (otherFace?.supportCost ?? 0);
  }, 0);
  const dialedMax = face.supportCost
    ? Math.max(0, Math.floor((spiceLimit - otherSpice) / face.supportCost))
    : undefined;
  return (
    <div className={styles.faceFields}>
      <BattleNumberInput
        label={
          plan.mode === 'max' ? (single ? 'Troops' : face.name) : single ? 'Unsupported' : `${face.name} unsupported`
        }
        value={plan.mode === 'max' ? troop.undialed + troop.dialed : troop.undialed}
        min={0}
        allowDecimal={false}
        disabled={locked}
        onChange={(value) => set({ undialed: Number(value), ...(plan.mode === 'max' ? { dialed: 0 } : {}) })}
      />
      {plan.mode === 'custom' && (
        <BattleNumberInput
          label={single ? 'Supported' : `${face.name} supported`}
          value={troop.dialed}
          min={0}
          max={dialedMax}
          allowDecimal={false}
          disabled={locked}
          onChange={(value) => set({ dialed: Number(value) })}
        />
      )}
    </div>
  );
}
function TroopFields(props: PlanEditor & { spiceLimit: number }) {
  const faces = props.plan.faces.filter((face) => face.capable);
  return faces.map((face) => <TroopFaceFields key={face.id} face={face} single={faces.length === 1} {...props} />);
}

function PlanInventory({ plan, locked, update, pieces }: PlanEditor & { pieces: TablePiece[] }) {
  const cards = pieces.filter((piece) => piece.kind === 'card');
  return (
    <>
      <Select
        label="Leader"
        placeholder="No leader"
        clearable
        disabled={locked || plan.disclosed.leader}
        value={plan.leaderId}
        data={pieces.filter(isBattleLeader).map((piece) => ({ value: piece.id, label: pieceName(piece) }))}
        onChange={(leaderId) => update({ leaderId })}
      />
      <div className={styles.hand} role="group" aria-label="Cards from your hand">
        {cards.map((piece) => {
          const selected = plan.cardIds.includes(piece.id);
          const disclosed = plan.disclosed.cardIds.includes(piece.id);
          return (
            <Button
              key={piece.id}
              className={styles.cardChoice}
              color="selected"
              variant={selected ? 'light' : 'transparent'}
              h="auto"
              p="xs"
              styles={{ label: { display: 'grid', justifyItems: 'center', gap: 'var(--space-xs)', height: 'auto' } }}
              aria-label={`${selected ? 'Remove' : 'Add'} ${pieceName(piece)} ${selected ? 'from' : 'to'} battle plan`}
              aria-pressed={selected}
              disabled={locked || disclosed}
              onClick={() =>
                update({
                  cardIds: selected ? plan.cardIds.filter((id) => id !== piece.id) : [...plan.cardIds, piece.id],
                })
              }
            >
              <PieceImage piece={piece} />
              <Text component="span" size="xs">
                {selected ? 'In plan' : 'In hand'}
              </Text>
            </Button>
          );
        })}
        {!cards.length && (
          <Text size="sm" c="dimmed">
            No cards in hand.
          </Text>
        )}
      </div>
    </>
  );
}

/** Shows or hides parts of the player's own plan for everyone before the reveal; the table leaves who may do so to the players. */
function EarlyReveal({
  client,
  battle,
  plan,
  pieces,
  disabled,
}: {
  client: TableSession;
  battle: PublicBattle;
  plan: BattlePlan;
  pieces: TablePiece[];
  disabled: boolean;
}) {
  const toggle = (disclosure: Disclosure, shown: boolean) =>
    client.command({ kind: 'battle-disclose', battleId: battle.id, disclosure, shown });
  const cards = plan.cardIds.flatMap((id) => pieces.filter((piece) => piece.id === id));
  return (
    <Stack gap="xs" role="group" aria-label="Reveal early">
      <Text size="sm" fw={600}>
        Reveal early
      </Text>
      <Checkbox
        label="Leader"
        disabled={disabled || (!plan.leaderId && !plan.disclosed.leader)}
        checked={plan.disclosed.leader}
        onChange={(event) => toggle({ element: 'leader' }, event.currentTarget.checked)}
      />
      <Checkbox
        label="Dial"
        disabled={disabled}
        checked={plan.disclosed.dial}
        onChange={(event) => toggle({ element: 'dial' }, event.currentTarget.checked)}
      />
      {cards.map((piece) => (
        <Checkbox
          key={piece.id}
          label={pieceName(piece)}
          disabled={disabled}
          checked={plan.disclosed.cardIds.includes(piece.id)}
          onChange={(event) => toggle({ element: 'card', cardId: piece.id }, event.currentTarget.checked)}
        />
      ))}
    </Stack>
  );
}

function PlanFields({ client, table, plan, battle }: Props & { plan: BattlePlan; battle: PublicBattle }) {
  const bank = table.snapshot.bank!;
  const factionId = bank.factionId;
  const side = battle.sides.find((side) => side?.factionId === factionId)!;
  const locked = !table.canHandleTable || side.ready || battle.stage !== 'preparing';
  const dialLocked = locked || plan.disclosed.dial;
  const update = (patch: Partial<BattlePlanInput>) => {
    client.editBattlePlan(patch);
  };
  const pieces = [...(table.snapshot.hand ?? []), ...plan.pieces].filter(
    (piece, index, all) => all.findIndex((candidate) => candidate.id === piece.id) === index
  );
  const preview = { ...plan, pieces };
  const availableSpice = bank.balance + plan.spice;
  return (
    <WorkbenchLayout gap="sm">
      <WorkbenchLayout.Workbench>
        <WorkbenchLayout.Chapters>
          <Stack gap="md">
            <div className={styles.editorFields}>
              <Radio.Group
                className={styles.supportMode}
                label={<VisuallyHidden>Support mode</VisuallyHidden>}
                disabled={dialLocked}
                value={plan.mode}
                onChange={(mode) => update({ mode: mode as BattlePlan['mode'] })}
              >
                <Group gap="lg" wrap="wrap">
                  {[
                    { value: 'max', label: 'Max' },
                    { value: 'custom', label: 'Custom' },
                  ].map(({ value, label }) => (
                    <Radio key={value} value={value} label={label} />
                  ))}
                </Group>
              </Radio.Group>
              <TroopFields plan={plan} locked={dialLocked} update={update} spiceLimit={availableSpice} />
              {plan.mode === 'max' ? (
                <BattleNumberInput
                  label="Committed spice"
                  value={plan.spice}
                  min={0}
                  max={availableSpice}
                  allowDecimal={false}
                  disabled={dialLocked}
                  onChange={(value) => update({ spice: Number(value) })}
                />
              ) : null}
              <BattleNumberInput
                label="Adjustment"
                value={plan.adjustment}
                step={0.5}
                disabled={dialLocked}
                onChange={(value) => update({ adjustment: Number(value) })}
              />
            </div>
            <PlanInventory plan={plan} locked={locked} update={update} pieces={pieces} />
            <Text size="sm">
              {bank.balance} in your spice reserve, {plan.spice} set aside. Troop strength excludes leader strength.
            </Text>
            {battle.stage !== 'revealed' && (
              <Button
                disabled={!table.canHandleTable}
                variant={side.ready ? 'default' : 'filled'}
                onClick={() => client.command({ kind: 'battle-ready', battleId: battle.id, ready: !side.ready })}
              >
                {side.ready ? 'Undo Ready' : 'Ready for battle'}
              </Button>
            )}
            {battle.stage === 'preparing' && (
              <EarlyReveal
                client={client}
                battle={battle}
                plan={plan}
                pieces={pieces}
                disabled={!table.canHandleTable}
              />
            )}
          </Stack>
        </WorkbenchLayout.Chapters>
        <WorkbenchLayout.Rail>
          <div className={styles.preview}>
            <BattleWheel
              plan={preview}
              factionId={factionId}
              factionName={rosterName(factionId, snapshotFactionLabels(table.snapshot))}
              artwork={table.snapshot.factionArtwork}
            />
          </div>
        </WorkbenchLayout.Rail>
      </WorkbenchLayout.Workbench>
    </WorkbenchLayout>
  );
}

export function HandControls({ client, table, hand }: Props & { hand: TablePiece[] }) {
  const selected = table.snapshot.table.pieces.find((piece) => piece.id === table.state.selectedPieceId);
  const [menu, setMenu] = useState<HandMenuAnchor | null>(null);
  const controls = useTableControls();
  /* The hidden zone is a tab beside this one, as wide, so a piece moved there lands in what its narrow view shows. */
  const { ref, width } = useElementSize<HTMLDivElement>();
  return (
    <Section hiddenHeading title="Your hand and leaders" description={handHelp(table)}>
      <Stack gap="sm" ref={ref}>
        {/* The compass controls drop the button (Norbert, 2026-10-24): there a piece's ring menu takes it into the hand. */}
        {controls === 'classic' && (
          <Button
            variant="default"
            disabled={!selected || !table.handControls?.canTake(selected.id)}
            onClick={() => selected && table.handControls?.take(selected.id)}
          >
            Take selected piece into hand
          </Button>
        )}
        <Group gap="sm">
          {hand
            .filter((piece) => !piece.hiddenZone)
            .map((piece) => (
              <Button
                variant="transparent"
                h="auto"
                radius={isBattleLeader(piece) ? '50%' : undefined}
                p={0}
                styles={{ label: { height: 'auto' } }}
                key={piece.id}
                className={styles.piece}
                draggable={table.canHandleTable}
                aria-label={`Drag ${pieceName(piece)} from hand`}
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/dune-hand', piece.id);
                  const target = event.currentTarget;
                  event.dataTransfer.setDragImage(target, target.offsetWidth / 2, target.offsetHeight / 2);
                }}
                onContextMenu={(event) => setMenu(handMenuAnchor(event, piece.id))}
              >
                <PieceImage piece={piece} />
              </Button>
            ))}
        </Group>
      </Stack>
      <HandPieceMenu anchor={menu} label="Hand actions" onClose={() => setMenu(null)}>
        <Menu.Item
          disabled={!table.canHandleTable}
          onClick={() => {
            if (menu) {
              client.command({
                kind: 'hand-zone',
                pieceId: menu.pieceId,
                at: nextHiddenZoneSpot(hand, width > 0 ? hiddenZoneView(width, Infinity).extent : undefined),
              });
            }
            setMenu(null);
          }}
        >
          Move to hidden zone
        </Menu.Item>
      </HandPieceMenu>
    </Section>
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

export function BattleControls({ client, table }: Props) {
  const { battle, battlePlan, hand } = table.snapshot;
  return (
    <>
      <Section hiddenHeading title="Battle" description={battleHelp(table)}>
        {battlePlan && battle ? (
          <PlanFields client={client} table={table} plan={battlePlan} battle={battle} />
        ) : (
          <Text size="sm">{battleNotice(table, battle)}</Text>
        )}
      </Section>
      {hand && <HandControls client={client} table={table} hand={hand} />}
    </>
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
  const { leader, dial, cards } = early;
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
        {leader ? (
          <div className={styles.earlyLeader} aria-label={`${factionName} leader revealed early`} role="group">
            <PieceImage piece={leader} />
          </div>
        ) : null}
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
    if (early && (early.leader || early.dial || early.cards.length)) {
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
