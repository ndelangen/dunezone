import { troopBattleFaces } from '@shared/factions/troopBattle';
import type { BattlePlan, PublicBattle } from '@shared/play/battle';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import type { TablePiece } from '@shared/play/model';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { factionArtwork, rosterName, wheelTroops } from '../../multiplayer/BattleControls';
import type { FactionArtwork } from '../../multiplayer/BattleControls';
import { battleHelp } from '../../multiplayer/panelGuidance';
import { isSpectator } from '../../multiplayer/tableFactions';
import { useHandOrder } from '../hand/useHandOrder';
import { BattlePlanPanel } from './BattlePlanPanel';
import type { BattlePlanViewProps, WheelArt } from './planView';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

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

/* The plan from the table, in its own component so the hand order it reads is only kept while there is a plan. */
function LivePlan(props: PlanProps) {
  return <BattlePlanPanel plan={usePlanView(props)} notice="" help={battleHelp(props.table)} />;
}

/** The Battle plan window's content at a live table: the viewer's own plan, or why there is none. */
export function ConnectedBattlePlanPanel({ client, table }: Props) {
  const { battle, battlePlan } = table.snapshot;
  if (battlePlan && battle && table.snapshot.bank) {
    return <LivePlan client={client} table={table} plan={battlePlan} battle={battle} />;
  }
  return <BattlePlanPanel plan={null} notice={battleNotice(table, battle)} help={battleHelp(table)} />;
}
