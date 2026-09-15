import { Button, Checkbox, Group, Image, NumberInput, SegmentedControl, Select, Stack, Text } from '@mantine/core';
import type { NumberInputProps } from '@mantine/core';
import { Html } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import { isBattleLeader } from '@shared/play/battle';
import type { BattlePlan, BattlePlanInput, PublicBattle } from '@shared/play/battle';
import type { TablePiece, Vector3Tuple } from '@shared/play/model';
import { phaseAt, TABLE_PHASES } from '@shared/play/phases';
import { trackerArcSlots } from '@shared/play/tableTrackers';
import { Section } from '@ui/block/Section';
import { TopicIcon } from '@ui/content/TopicIcon';
import { AsymmetricSplitLayout } from '@ui/layout/AsymmetricSplitLayout';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { CalloutSurface } from '@ui/surface/CalloutSurface';
import type { CSSProperties } from 'react';
import { useEffect, useReducer, useState } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';

import { CardBack } from '@game/assets/card/Back';
import { Token } from '@game/assets/faction/token/Token';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';
import { backgroundPresets } from '@game/data/backgrounds';
import { card } from '@game/data/sizes';
import { factionTokenFixtures } from '@game/fixtures/factionTokens';

import { DarkSchemeIsland, darkSchemeIslandAttributes } from '../DarkSchemeIsland';
import styles from './BattleControls.module.css';
import type { TableConnection, TableProjection } from './TableConnection';

type Props = { client: TableConnection; table: TableProjection };
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
      fit="contain"
      h={80}
      w={60}
      fallbackSrc="/vector/icon/traitor.svg"
    />
  );
}

/** One wheel visualization serves the private planner and the public reveal. */
function BattleWheel({
  plan,
  factionId,
  client,
  active,
}: {
  plan: BattlePlan;
  factionId: string;
  client?: TableConnection;
  active?: Set<string>;
}) {
  const artwork = factionTokenFixtures[factionId === 'atreides' ? 'atreides' : 'harkonnen'];
  const leader = plan.pieces.find((piece) => piece.id === plan.leaderId);
  return (
    <div
      className={styles.wheel}
      aria-label={`${factionId} plan, troop strength ${plan.strength}, ${plan.spice} spice`}
    >
      <BackgroundRenderer background={artwork.background} className={styles.wheelFace} />
      <div className={styles.cards}>
        {plan.pieces
          .filter((piece) => plan.cardIds.includes(piece.id) && (!active || active.has(piece.id)))
          .map((piece, index, cards) => (
            <Button
              variant="transparent"
              h="auto"
              p={0}
              styles={{ label: { height: 'auto' } }}
              key={piece.id}
              style={
                {
                  '--fan-angle': `${(index - (cards.length - 1) / 2) * 14}deg`,
                  '--fan-x': `${(index - (cards.length - 1) / 2) * 32}px`,
                } as CSSProperties
              }
              className={styles.piece}
              aria-label={`Drag ${pieceName(piece)} onto table`}
              disabled={!client}
              onPointerDown={(event) => {
                if (event.button === 0 && client) {
                  event.preventDefault();
                  client.beginGesture(piece.id, 'whole');
                }
              }}
            >
              <PieceImage piece={piece} />
            </Button>
          ))}
      </div>
      <Text ta="center" size="xs">
        {factionId}
      </Text>
      <Text className={styles.strength} fw={700}>
        {plan.strength}
      </Text>
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={2}>
          {plan.troops.map((troop) => {
            const face = plan.faces.find((face) => face.id === troop.faceId);
            return (
              <Group gap={2} key={troop.faceId} wrap="nowrap">
                <div className={styles.troop} aria-label={face?.name}>
                  <TroopToken
                    background={artwork.background}
                    image={factionId === 'atreides' ? '/vector/troop/atreides.svg' : '/vector/troop/harkonnen.svg'}
                    star={undefined}
                    hue={undefined}
                    striped={undefined}
                  />
                </div>
                <Text size="xs">{troop.undialed + troop.dialed}</Text>
              </Group>
            );
          })}
        </Stack>
        <Stack gap={2} align="center">
          <Group gap={2}>
            <TopicIcon topic="spice" />
            <Text size="sm">{plan.spice}</Text>
          </Group>
          {leader && (!active || active.has(leader.id)) && (
            <Button
              variant="transparent"
              h="auto"
              p={0}
              styles={{ label: { height: 'auto' } }}
              className={styles.piece}
              disabled={!client}
              aria-label={`Drag ${pieceName(leader)} onto table`}
              onPointerDown={(event) => {
                if (event.button === 0 && client) {
                  event.preventDefault();
                  client.beginGesture(leader.id, 'whole');
                }
              }}
            >
              <PieceImage piece={leader} />
            </Button>
          )}
        </Stack>
      </Group>
      {!!plan.adjustment && (
        <Text size="xs">
          {plan.adjustment > 0 ? '+' : ''}
          {plan.adjustment} adjustment
        </Text>
      )}
    </div>
  );
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
        const number = Number(draft);
        const bounded = Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, number));
        if (
          draft !== null &&
          draft !== '' &&
          Number.isFinite(bounded) &&
          bounded !== value &&
          (props.allowDecimal !== false || Number.isSafeInteger(bounded))
        ) {
          onChange(bounded);
        }
        setDraft(null);
      }}
    />
  );
}

function PlanFields({ client, table, plan, battle }: Props & { plan: BattlePlan; battle: PublicBattle }) {
  const factionId = table.snapshot.bank!.factionId;
  const side = battle.sides.find((side) => side?.factionId === factionId)!;
  const locked = !table.canInteract || side.ready || battle.stage !== 'preparing';
  const update = (patch: Partial<BattlePlanInput>) => {
    client.editBattlePlan(patch);
  };
  const pieces = [...(table.snapshot.hand ?? []), ...plan.pieces];
  return (
    <AsymmetricSplitLayout rail="slim">
      <AsymmetricSplitLayout.Wide>
        <Stack gap="sm">
          <SegmentedControl
            aria-label="Funding mode"
            disabled={locked}
            value={plan.mode}
            data={[
              { value: 'max', label: 'Max' },
              { value: 'custom', label: 'Custom' },
            ]}
            onChange={(mode) => update({ mode: mode as BattlePlan['mode'] })}
          />
          {plan.faces
            .filter((face) => face.capable)
            .map((face) => {
              const troop = plan.troops.find((troop) => troop.faceId === face.id) ?? {
                faceId: face.id,
                undialed: 0,
                dialed: 0,
              };
              const set = (value: Partial<typeof troop>) =>
                update({
                  troops: [...plan.troops.filter((entry) => entry.faceId !== face.id), { ...troop, ...value }],
                });
              return (
                <Group key={face.id} grow align="end">
                  <BattleNumberInput
                    label={plan.mode === 'max' ? face.name : `${face.name} undialed`}
                    value={plan.mode === 'max' ? troop.undialed + troop.dialed : troop.undialed}
                    min={0}
                    allowDecimal={false}
                    disabled={locked}
                    onChange={(value) =>
                      set({ undialed: Number(value), ...(plan.mode === 'max' ? { dialed: 0 } : {}) })
                    }
                  />
                  {plan.mode === 'custom' && (
                    <BattleNumberInput
                      label={`${face.name} dialed`}
                      value={troop.dialed}
                      min={0}
                      allowDecimal={false}
                      disabled={locked}
                      onChange={(value) => set({ dialed: Number(value) })}
                    />
                  )}
                </Group>
              );
            })}
          {plan.mode === 'max' ? (
            <BattleNumberInput
              label="Committed spice"
              value={plan.spice}
              min={0}
              allowDecimal={false}
              disabled={locked}
              onChange={(value) => update({ spice: Number(value) })}
            />
          ) : (
            <Text>Committed spice: {plan.spice}</Text>
          )}
          <Text size="sm">
            Available bank: {table.snapshot.bank!.balance}. Troop strength excludes leader strength.
          </Text>
          <BattleNumberInput
            label="Adjustment"
            value={plan.adjustment}
            step={0.5}
            disabled={locked}
            onChange={(value) => update({ adjustment: Number(value) })}
          />
          <Select
            label="Leader"
            placeholder="No leader"
            clearable
            disabled={locked}
            value={plan.leaderId}
            data={pieces.filter(isBattleLeader).map((piece) => ({ value: piece.id, label: pieceName(piece) }))}
            attributes={{ dropdown: darkSchemeIslandAttributes }}
            onChange={(leaderId) => update({ leaderId })}
          />
          <Text size="sm">Cards from your hand</Text>
          {pieces
            .filter((piece) => piece.kind === 'card')
            .map((piece) => (
              <Checkbox
                key={piece.id}
                label={pieceName(piece)}
                checked={plan.cardIds.includes(piece.id)}
                disabled={locked}
                onChange={(event) =>
                  update({
                    cardIds: event.currentTarget.checked
                      ? [...plan.cardIds, piece.id]
                      : plan.cardIds.filter((id) => id !== piece.id),
                  })
                }
              />
            ))}
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
      </AsymmetricSplitLayout.Wide>
      <AsymmetricSplitLayout.Narrow>
        <BattleWheel plan={plan} factionId={factionId} />
      </AsymmetricSplitLayout.Narrow>
    </AsymmetricSplitLayout>
  );
}

export function BattleControls({ client, table }: Props) {
  const { battle, battlePlan, hand, battleResults = [] } = table.snapshot;
  const selected = table.snapshot.table.pieces.find((piece) => piece.id === table.state.selectedPieceId);
  return (
    <>
      <Section
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
      {hand && (
        <Section
          title="Your hand and leaders"
          description="Drag pieces onto the table face down. Committed pieces stay in your plan until cancellation or reveal."
        >
          <Stack gap="sm">
            <Button
              variant="default"
              disabled={
                !table.canInteract ||
                !selected ||
                selected.items.length !== 1 ||
                !!selected.inventory ||
                selected.locked ||
                (selected.kind !== 'card' && !isBattleLeader(selected))
              }
              onClick={() => selected && client.command({ kind: 'hand-take', pieceId: selected.id })}
            >
              Take selected piece into hand
            </Button>
            <Group>
              {hand.map((piece) => (
                <Button
                  variant="transparent"
                  h="auto"
                  p={0}
                  styles={{ label: { height: 'auto' } }}
                  key={piece.id}
                  className={styles.piece}
                  draggable={table.canInteract}
                  aria-label={`Drag ${pieceName(piece)} from hand`}
                  onDragStart={(event) => event.dataTransfer.setData('application/dune-hand', piece.id)}
                >
                  <PieceImage piece={piece} />
                  <Text size="xs">{pieceName(piece)}</Text>
                </Button>
              ))}
            </Group>
          </Stack>
        </Section>
      )}
      <Section title="Battle results">
        {battleResults.length ? (
          battleResults.map((result) => (
            <Stack key={result.id} gap="xs">
              <Text>
                {result.territory}: {result.factions.join(' against ')}.{' '}
                {outcomes.find(([outcome]) => outcome === result.outcome)?.[1]}.
              </Text>
              <Group>
                {result.plans.map((plan, side) => (
                  <BattleWheel key={side} plan={plan} factionId={result.factions[side]} />
                ))}
              </Group>
            </Stack>
          ))
        ) : (
          <Text size="sm">No agreed battle results yet.</Text>
        )}
      </Section>
    </>
  );
}

/** The scene owns pointer projection; every drop remains an intent sent to the game authority. */
export function BattleScene({ client, table }: Props) {
  const { camera, renderer, size } = useThree();
  const battle = table.snapshot.battle;
  const [placement, place] = useReducer(
    (
      before: { anchor: [number, number]; capsule: [number, number] },
      next: { anchor: [number, number]; capsule: [number, number] }
    ) => (JSON.stringify(before) === JSON.stringify(next) ? before : next),
    { anchor: [0, 0], capsule: [0, 0] }
  );
  useFrame(() => {
    if (!battle) {
      return;
    }
    const projected = new Vector3(...battle.anchor).project(camera);
    const anchor: [number, number] = [
      Math.round(((projected.x + 1) * size.width) / 2),
      Math.round(((1 - projected.y) * size.height) / 2),
    ];
    const halfWidth = Math.min(270, size.width * 0.44);
    place({
      anchor,
      capsule: [
        Math.max(halfWidth + 10, Math.min(size.width - halfWidth - 10, anchor[0])),
        Math.max(160, Math.min(size.height - 150, anchor[1] > 340 ? anchor[1] - 170 : anchor[1] + 170)),
      ],
    });
  });
  useEffect(() => {
    const canvas = renderer.domElement;
    const over = (event: DragEvent) => {
      event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      event.preventDefault();
      if (!table.canInteract) {
        return;
      }
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
        return;
      }
      const position: Vector3Tuple = [point.x, 0.18, point.z];
      const pieceId = event.dataTransfer?.getData('application/dune-hand');
      if (pieceId) {
        client.command({ kind: 'hand-play', pieceId, position });
      } else if (event.dataTransfer?.getData('application/dune-battle')) {
        client.command({ kind: 'battle-start', anchor: position, territory: 'Marked territory' });
      }
    };
    canvas.addEventListener('dragover', over);
    canvas.addEventListener('drop', drop);
    return () => {
      canvas.removeEventListener('dragover', over);
      canvas.removeEventListener('drop', drop);
    };
  }, [camera, renderer, client, table.canInteract]);
  if (!battle) {
    if (phaseAt(table.snapshot.phase).id !== 'battle') {
      return null;
    }
    return (
      <Html
        position={(() => {
          const slot = trackerArcSlots(TABLE_PHASES.length).find((slot) => slot.phaseIndex === 6)!;
          return [slot.position[0], slot.position[1] + 0.1, slot.position[2] + 0.55];
        })()}
        center
      >
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
  const { anchor: anchorScreen, capsule } = placement;
  const own = battle.sides.findIndex((side) => side?.factionId === table.snapshot.bank?.factionId);
  const active = new Set(
    table.snapshot.table.pieces.filter((piece) => piece.battleOverlay === battle.id).map((piece) => piece.id)
  );
  return (
    <Html position={battle.anchor} center zIndexRange={[10, 0]} calculatePosition={() => capsule}>
      <DarkSchemeIsland>
        <div className={styles.callout} data-battle-stage={battle.stage}>
          <CalloutSurface
            pointer={[anchorScreen[0] - capsule[0], anchorScreen[1] - capsule[1]]}
            actions={
              <Group gap={4} justify="space-between" wrap="nowrap">
                {battle.stage === 'preparing' ? (
                  <Button
                    size="xs"
                    variant="default"
                    fullWidth
                    disabled={!table.canInteract}
                    onClick={() => client.command({ kind: 'battle-cancel', battleId: battle.id })}
                  >
                    Cancel battle
                  </Button>
                ) : battle.stage === 'revealed' ? (
                  outcomes
                    .filter(([outcome]) => outcome !== 'none')
                    .map(([outcome, label]) => (
                      <Button
                        key={outcome}
                        size="xs"
                        variant={own >= 0 && battle.sides[own]?.choice === outcome ? 'filled' : 'default'}
                        disabled={!table.canInteract || own < 0}
                        onClick={() => client.command({ kind: 'battle-outcome', battleId: battle.id, outcome })}
                      >
                        {label}
                      </Button>
                    ))
                ) : null}
              </Group>
            }
          >
            <Group justify="space-between" wrap="nowrap" gap="sm" pos="relative">
              {([0, 1] as const).map((index) => {
                const side = battle.sides[index];
                return (
                  <div className={styles.side} key={index} data-ready={side?.ready ?? false}>
                    {battle.revealed ? (
                      <BattleWheel
                        plan={battle.revealed[index]}
                        factionId={side!.factionId}
                        client={table.canInteract ? client : undefined}
                        active={active}
                      />
                    ) : side ? (
                      <Stack align="center" gap="xs">
                        <div className={styles.faction}>
                          <Token {...factionTokenFixtures[side.factionId === 'atreides' ? 'atreides' : 'harkonnen']} />
                        </div>
                        <Text>{side.factionId}</Text>
                        {index === 0 && <Text size="xs">Aggressor. Wins ties by default.</Text>}
                        <Text size="sm">{side.ready ? 'Ready' : 'Preparing'}</Text>
                      </Stack>
                    ) : (
                      <Button
                        variant="default"
                        disabled={!table.canInteract || own >= 0}
                        onClick={() => client.command({ kind: 'battle-claim', battleId: battle.id, side: index })}
                      >
                        {index ? 'Claim right side' : 'Claim left side'}
                      </Button>
                    )}
                    {side?.choice && <Text size="xs">{outcomes.find(([choice]) => choice === side.choice)?.[1]}</Text>}
                  </div>
                );
              })}
              <div className={styles.centre}>
                {battle.stage === 'revealed' ? (
                  <Button
                    size="xs"
                    variant={own >= 0 && battle.sides[own]?.choice === 'none' ? 'filled' : 'default'}
                    disabled={!table.canInteract || own < 0}
                    onClick={() => client.command({ kind: 'battle-outcome', battleId: battle.id, outcome: 'none' })}
                  >
                    No winner
                  </Button>
                ) : battle.stage === 'countdown' ? (
                  <Text size="xl" fw={700} role="timer">
                    {table.battleCountdownSeconds}
                  </Text>
                ) : null}
              </div>
            </Group>
          </CalloutSurface>
        </div>
      </DarkSchemeIsland>
    </Html>
  );
}
