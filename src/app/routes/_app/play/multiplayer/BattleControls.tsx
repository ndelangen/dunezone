import { Button, Group, Image, NumberInput, SegmentedControl, Select, Stack, Text } from '@mantine/core';
import type { NumberInputProps } from '@mantine/core';
import { Html } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import { isBattleLeader } from '@shared/play/battle';
import type { BattlePlan, BattlePlanInput, CombatFace, PublicBattle } from '@shared/play/battle';
import type { TablePiece, Vector3Tuple } from '@shared/play/model';
import { phaseAt, TABLE_PHASES } from '@shared/play/phases';
import { trackerArcSlots } from '@shared/play/tableTrackers';
import { Section } from '@ui/block/Section';
import { TopicIcon } from '@ui/content/TopicIcon';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { CalloutSurface } from '@ui/surface/CalloutSurface';
import type { CSSProperties } from 'react';
import { useEffect, useReducer, useState } from 'react';
import type { Camera } from 'three';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';

import { CardBack } from '@game/assets/card/Back';
import { BattleWheel as BattleWheelAsset } from '@game/assets/generic/BattleWheel';
import { backgroundPresets } from '@game/data/backgrounds';
import { card } from '@game/data/sizes';
import { factionTokenFixtures } from '@game/fixtures/factionTokens';

import { DarkSchemeIsland } from '../DarkSchemeIsland';
import { PointerSessionContext, usePointerSession } from '../PointerSessionContext';
import styles from './BattleControls.module.css';
import type { TableSession, TableProjection } from './TableSession';

type Props = { client: TableSession; table: TableProjection };
const outcomes = [
  ['left', 'Left side won'],
  ['none', 'No winner'],
  ['right', 'Right side won'],
] as const;
function pieceName(piece: TablePiece) {
  return piece.items[0]?.artwork?.name ?? piece.label;
}
function PieceImage({ piece }: { piece: TablePiece }) {
  if (piece.kind === 'card' && !piece.items[0]?.artwork?.front) {
    return (
      <div style={{ width: 60 }} aria-label={pieceName(piece)}>
        <CanvasScale canvasWidth={card.width} canvasHeight={card.height}>
          <CardBack
            name={pieceName(piece)}
            image="/vector/icon/traitor.svg"
            background={backgroundPresets.traitor}
            imageOffset={[0, 10]}
            imageScale={1.1}
          />
        </CanvasScale>
      </div>
    );
  }
  return (
    <Image
      src={piece.items[0]?.artwork?.front}
      alt={pieceName(piece)}
      draggable={false}
      fit="contain"
      radius={isBattleLeader(piece) ? '50%' : undefined}
      h={piece.kind === 'card' ? 80 : 60}
      w={60}
      fallbackSrc="/vector/icon/traitor.svg"
    />
  );
}

type FactionArtwork = TableProjection['snapshot']['factionArtwork'];
type WheelProps = {
  artwork?: FactionArtwork;
  plan: BattlePlan;
  factionId: string;
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
/** Play owns piece visibility and pointer sessions; the asset owns the wheel artwork. */
function BattleWheel({ plan, factionId, client, active, artwork }: WheelProps) {
  const leader = plan.pieces.find((piece) => piece.id === plan.leaderId);
  return (
    <BattleWheelAsset
      state="revealed"
      className={styles.wheel}
      label={`${factionId} plan, troop strength ${plan.strength}, ${plan.spice} spice`}
      background={factionArtwork(factionId, artwork).background}
      strength={plan.strength}
      spice={plan.spice}
      adjustment={plan.adjustment}
      troops={plan.faces
        .filter((face) => face.capable)
        .flatMap((face) => {
          const troop = plan.troops.find((entry) => entry.faceId === face.id);
          const retained = artwork?.[factionId];
          const authored = retained?.troops
            .flatMap((entry) => [entry, ...(entry.back ? [entry.back] : [])])
            .find((entry) => entry.name === face.name);
          /* Real games never borrow a fixture house's troop artwork. Combat authoring supplies the named faces. */
          if (retained && !authored) {
            return [];
          }
          return [
            {
              id: face.id,
              name: face.name,
              dialed: troop?.dialed ?? 0,
              undialed: troop?.undialed ?? 0,
              artwork: {
                background: factionArtwork(factionId, artwork).background,
                image:
                  authored?.image ??
                  (factionId === 'atreides' ? '/vector/troop/atreides.svg' : '/vector/troop/harkonnen.svg'),
                star: authored?.star,
                hue: authored?.hue,
                striped: authored?.striped,
              },
            },
          ];
        })}
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
}: PlanEditor & { face: CombatFace; single: boolean; spiceLimit: number }) {
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
    return total + entry.dialed * (otherFace?.fundingCost ?? 0);
  }, 0);
  const dialedMax = face.fundingCost
    ? Math.max(0, Math.floor((spiceLimit - otherSpice) / face.fundingCost))
    : undefined;
  return (
    <div className={styles.faceFields}>
      <BattleNumberInput
        label={plan.mode === 'max' ? (single ? 'Troops' : face.name) : single ? 'Undialed' : `${face.name} undialed`}
        value={plan.mode === 'max' ? troop.undialed + troop.dialed : troop.undialed}
        min={0}
        allowDecimal={false}
        disabled={locked}
        onChange={(value) => set({ undialed: Number(value), ...(plan.mode === 'max' ? { dialed: 0 } : {}) })}
      />
      {plan.mode === 'custom' && (
        <BattleNumberInput
          label={single ? 'Dialed' : `${face.name} dialed`}
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
        disabled={locked}
        value={plan.leaderId}
        data={pieces.filter(isBattleLeader).map((piece) => ({ value: piece.id, label: pieceName(piece) }))}
        onChange={(leaderId) => update({ leaderId })}
      />
      <div className={styles.hand} aria-label="Cards from your hand">
        {cards.map((piece) => {
          const selected = plan.cardIds.includes(piece.id);
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
              disabled={locked}
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

function PlanFields({ client, table, plan, battle }: Props & { plan: BattlePlan; battle: PublicBattle }) {
  const factionId = table.snapshot.bank!.factionId;
  const side = battle.sides.find((side) => side?.factionId === factionId)!;
  const locked = !table.canInteract || side.ready || battle.stage !== 'preparing';
  const update = (patch: Partial<BattlePlanInput>) => {
    client.editBattlePlan(patch);
  };
  const pieces = [...(table.snapshot.hand ?? []), ...plan.pieces].filter(
    (piece, index, all) => all.findIndex((candidate) => candidate.id === piece.id) === index
  );
  const preview = { ...plan, pieces };
  const availableSpice = table.snapshot.bank!.balance + plan.spice;
  return (
    <WorkbenchLayout gap="sm">
      <WorkbenchLayout.Workbench>
        <WorkbenchLayout.Chapters>
          <Stack gap="md">
            <div className={styles.editorFields}>
              <SegmentedControl
                className={styles.fundingMode}
                aria-label="Funding mode"
                disabled={locked}
                value={plan.mode}
                data={[
                  { value: 'max', label: 'Max' },
                  { value: 'custom', label: 'Custom' },
                ]}
                onChange={(mode) => update({ mode: mode as BattlePlan['mode'] })}
              />
              <TroopFields plan={plan} locked={locked} update={update} spiceLimit={availableSpice} />
              {plan.mode === 'max' ? (
                <BattleNumberInput
                  label="Committed spice"
                  value={plan.spice}
                  min={0}
                  max={availableSpice}
                  allowDecimal={false}
                  disabled={locked}
                  onChange={(value) => update({ spice: Number(value) })}
                />
              ) : null}
              <BattleNumberInput
                label="Adjustment"
                value={plan.adjustment}
                step={0.5}
                disabled={locked}
                onChange={(value) => update({ adjustment: Number(value) })}
              />
            </div>
            <PlanInventory plan={plan} locked={locked} update={update} pieces={pieces} />
            <Text size="sm">
              {table.snapshot.bank!.balance} available in your bank, {plan.spice} reserved. Troop strength excludes
              leader strength.
            </Text>
            {battle.stage !== 'revealed' && (
              <Button
                disabled={!table.canInteract}
                variant={side.ready ? 'default' : 'filled'}
                onClick={() => client.command({ kind: 'battle-ready', battleId: battle.id, ready: !side.ready })}
              >
                {side.ready ? 'Undo Ready' : 'Ready for battle'}
              </Button>
            )}
          </Stack>
        </WorkbenchLayout.Chapters>
        <WorkbenchLayout.Rail>
          <div className={styles.preview}>
            <BattleWheel plan={preview} factionId={factionId} artwork={table.snapshot.factionArtwork} />
          </div>
        </WorkbenchLayout.Rail>
      </WorkbenchLayout.Workbench>
    </WorkbenchLayout>
  );
}

function canTakeSelected(piece: TablePiece | undefined) {
  if (!piece) {
    return false;
  }
  if (piece.inventory || piece.locked) {
    return false;
  }
  if (piece.items.length !== 1) {
    return false;
  }
  return piece.kind === 'card' || isBattleLeader(piece);
}
export function HandControls({ client, table, hand }: Props & { hand: TablePiece[] }) {
  const selected = table.snapshot.table.pieces.find((piece) => piece.id === table.state.selectedPieceId);
  return (
    <Section
      helpOnly
      title="Your hand and leaders"
      description={
        table.snapshot.stage === 'setup'
          ? 'Drag pieces onto the table face down.'
          : 'Drag pieces onto the table face down. Committed pieces stay in your plan until cancellation or reveal.'
      }
    >
      <Stack gap="sm">
        <Button
          variant="default"
          disabled={!table.canInteract || !canTakeSelected(selected)}
          onClick={() => selected && client.command({ kind: 'hand-take', pieceId: selected.id })}
        >
          Take selected piece into hand
        </Button>
        <Group gap="sm">
          {hand.map((piece) => (
            <Button
              variant="transparent"
              h="auto"
              radius={isBattleLeader(piece) ? '50%' : undefined}
              p={0}
              styles={{ label: { height: 'auto' } }}
              key={piece.id}
              className={styles.piece}
              draggable={table.canInteract}
              aria-label={`Drag ${pieceName(piece)} from hand`}
              onDragStart={(event) => {
                event.dataTransfer.setData('application/dune-hand', piece.id);
                const target = event.currentTarget;
                event.dataTransfer.setDragImage(target, target.offsetWidth / 2, target.offsetHeight / 2);
              }}
            >
              <PieceImage piece={piece} />
            </Button>
          ))}
        </Group>
      </Stack>
    </Section>
  );
}
function BattleResults({
  results: battleResults,
  artwork,
}: {
  results: NonNullable<TableProjection['snapshot']['battleResults']>;
  artwork?: FactionArtwork;
}) {
  return (
    <Section helpOnly title="Battle results">
      {battleResults.length ? (
        battleResults.map((result) => (
          <Stack key={result.id} gap="xs">
            <Text>
              {result.territory}: {result.factions.join(' against ')}.{' '}
              {outcomes.find(([outcome]) => outcome === result.outcome)?.[1]}.
            </Text>
            <Group pt={40}>
              {result.plans.map((plan, side) => (
                <BattleWheel key={side} plan={plan} factionId={result.factions[side]} artwork={artwork} />
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

export function BattleControls({ client, table }: Props) {
  const { battle, battlePlan, hand, battleResults = [] } = table.snapshot;
  return (
    <>
      <Section
        helpOnly
        title="Battle"
        description={battle ? `Battle at ${battle.territory}` : 'Drag the battle marker onto a territory to begin.'}
      >
        {battlePlan && battle ? (
          <PlanFields client={client} table={table} plan={battlePlan} battle={battle} />
        ) : (
          <Text size="sm">
            {battle ? 'Claim a side on the table to prepare your private plan.' : 'No battle in progress.'}
          </Text>
        )}
      </Section>
      {hand && <HandControls client={client} table={table} hand={hand} />}
      {!!battleResults.length && <BattleResults results={battleResults} artwork={table.snapshot.factionArtwork} />}
    </>
  );
}

type Placement = { anchor: [number, number]; capsule: [number, number] };
function battlePlacement(
  battleAnchor: PublicBattle['anchor'],
  camera: Camera,
  size: { width: number; height: number }
): Placement {
  const projected = new Vector3(...battleAnchor).project(camera);
  const anchor: [number, number] = [
    Math.round(((projected.x + 1) * size.width) / 2),
    Math.round(((1 - projected.y) * size.height) / 2),
  ];
  const verticalMidpoint = size.height / 2;
  const territoryIsAbove = anchor[1] < verticalMidpoint;
  const capsuleY = territoryIsAbove
    ? Math.max(verticalMidpoint + 1, Math.min(size.height - 150, anchor[1] + 250))
    : Math.min(verticalMidpoint - 1, Math.max(160, anchor[1] - 250));
  return { anchor, capsule: [size.width / 2, capsuleY] };
}
function useBattlePlacement(battle: PublicBattle | null | undefined) {
  const { camera, size } = useThree();
  const [placement, place] = useReducer(
    (before: Placement, next: Placement) => (JSON.stringify(before) === JSON.stringify(next) ? before : next),
    { anchor: [0, 0], capsule: [0, 0] }
  );
  useFrame(() => {
    if (!battle) {
      return;
    }
    place(battlePlacement(battle.anchor, camera, size));
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
  if (!point || Math.hypot(point.x, point.z) > 5.5) {
    return null;
  }
  return [point.x, 0.18, point.z] as Vector3Tuple;
}
function sendDrop(client: TableSession, event: DragEvent, position: Vector3Tuple) {
  const pieceId = event.dataTransfer?.getData('application/dune-hand');
  if (pieceId) {
    client.command({ kind: 'hand-play', pieceId, position });
  } else if (event.dataTransfer?.getData('application/dune-battle')) {
    client.command({ kind: 'battle-start', anchor: position, territory: 'Marked territory' });
  }
}
function useInventoryDrop({ client, table }: Props) {
  const { camera, renderer } = useThree();
  useEffect(() => {
    const canvas = renderer.domElement;
    const over = (event: DragEvent) => event.preventDefault();
    const drop = (event: DragEvent) => {
      event.preventDefault();
      if (!table.canInteract) {
        return;
      }
      const position = dropPosition(event, canvas, camera);
      if (position) {
        sendDrop(client, event, position);
      }
    };
    canvas.addEventListener('dragover', over);
    canvas.addEventListener('drop', drop);
    return () => {
      canvas.removeEventListener('dragover', over);
      canvas.removeEventListener('drop', drop);
    };
  }, [camera, renderer, client, table.canInteract]);
}
function BattleMarker({ table }: Props) {
  if (phaseAt(table.snapshot.phase).id !== 'battle') {
    return null;
  }
  const slot = trackerArcSlots(TABLE_PHASES.length).find((entry) => entry.phaseIndex === 6)!;
  return (
    <Html position={[slot.position[0], slot.position[1] + 0.1, slot.position[2] + 0.55]} center>
      <DarkSchemeIsland>
        <Button
          aria-label="Drag battle marker onto territory"
          draggable={table.canInteract}
          disabled={!table.canInteract}
          onDragStart={(event) => event.dataTransfer.setData('application/dune-battle', 'marker')}
        >
          <TopicIcon topic="battle" />
        </Button>
      </DarkSchemeIsland>
    </Html>
  );
}
type ActiveProps = Props & { battle: PublicBattle; own: number };
function OutcomeButton({ client, table, battle, own, outcome }: ActiveProps & { outcome: 'left' | 'none' | 'right' }) {
  return (
    <Button
      size="xs"
      className={outcome === 'none' ? undefined : styles.outcome}
      data-outcome={outcome}
      aria-label={outcomes.find(([choice]) => choice === outcome)![1]}
      variant={own >= 0 && battle.sides[own]?.choice === outcome ? 'filled' : 'default'}
      disabled={!table.canInteract || own < 0}
      onClick={() => client.command({ kind: 'battle-outcome', battleId: battle.id, outcome })}
    >
      {outcome === 'none' ? 'No winner' : outcome === 'left' ? 'Left won' : 'Right won'}
    </Button>
  );
}
function BattleActions(props: ActiveProps) {
  const { client, table, battle } = props;
  if (battle.stage === 'preparing') {
    return (
      <Button
        size="xs"
        className={styles.cancel}
        variant="default"
        fullWidth
        disabled={!table.canInteract}
        onClick={() => client.command({ kind: 'battle-cancel', battleId: battle.id })}
      >
        Cancel battle
      </Button>
    );
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
function BattleCentre(props: ActiveProps) {
  if (props.battle.stage === 'revealed') {
    return <OutcomeButton {...props} outcome="none" />;
  }
  if (props.battle.stage !== 'countdown') {
    return null;
  }
  return (
    <Text size="xl" fw={700} role="timer">
      {props.table.battleCountdownSeconds}
    </Text>
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
  if (battle.revealed) {
    return (
      <BattleWheel
        plan={battle.revealed[index]}
        factionId={side!.factionId}
        artwork={table.snapshot.factionArtwork}
        client={table.canInteract ? client : undefined}
        active={active}
      />
    );
  }
  if (side) {
    return (
      <BattleWheelAsset
        state="unrevealed"
        label={`${side.factionId}, ${index === 0 ? 'left side, aggressor' : 'right side'}, ${side.ready ? 'Ready' : 'Preparing'}`}
        artwork={factionArtwork(side.factionId, table.snapshot.factionArtwork)}
        ready={side.ready}
      />
    );
  }
  return (
    <Button
      className={styles.claim}
      aria-label={index ? 'Claim right side' : 'Claim left side'}
      styles={{ label: { whiteSpace: 'normal' } }}
      variant="default"
      disabled={!table.canInteract || own >= 0}
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
                {outcomes.find(([choice]) => choice === side.choice)?.[1]}
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
  const { anchor, capsule } = placement;
  const own = battle.sides.findIndex((side) => side?.factionId === table.snapshot.bank?.factionId);
  const props = { client, table, battle, own };
  /* Html reads its position only in its own frame and the table draws on demand, so the capsule is projected in that frame: `capsule` from state commits after the frame that computed it, and Html would not read it until something else asked for a frame. */
  return (
    <Html
      position={battle.anchor}
      center
      zIndexRange={[10, 0]}
      calculatePosition={(_, camera, size) => battlePlacement(battle.anchor, camera, size).capsule}
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
  return battle ? <BattleCallout {...props} battle={battle} placement={placement} /> : <BattleMarker {...props} />;
}
