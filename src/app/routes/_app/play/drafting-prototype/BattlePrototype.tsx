import { Button, NumberInput, SegmentedControl, Text, Select, Stack } from '@mantine/core';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { StatusBadge } from '@ui/content/StatusBadge';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { CalloutSurface } from '@ui/surface/CalloutSurface';
import type { CSSProperties, ReactNode, DragEvent } from 'react';

/* Accepted throwaway battle prototype for #1148; decisions live on #1016. */
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

import { BATTLE_FACTIONS, BATTLE_SCENARIOS, OUTCOMES, troopStrength } from './battle';
import type { BattleAction, BattleSide, BattleState, BattleVariant, Plan } from './battle';
import { BattlePlanFace } from './BattlePlanFace';
import styles from './BattlePrototype.module.css';
import { factionById } from './fixture';
import { leadersOf } from './leaders.fixture';
import { FactionToken } from './parts';

export type BattleProps = { state: BattleState; dispatch: (action: BattleAction) => void; variant: BattleVariant };
const CARDS = {
  maulaPistol: treacheryCardFixtures.maulaPistol,
  shield: treacheryCardFixtures.shield,
  chaumas: treacheryCardFixtures.chaumas,
};
const cardData = (id: string) => CARDS[id as keyof typeof CARDS];

/* The caller supplies a card identity; this organ presents its real renderer at table scale. */
export function BattleCard({ id, width = 68 }: { id: string; width?: number }) {
  const card = cardData(id);
  if (!card) {
    return null;
  }
  return (
    <div
      className={styles.card}
      style={{ '--battle-card-width': `${width}px`, '--battle-card-scale': width / 900 } as CSSProperties}
      aria-label={card.name}
    >
      <div className={styles.cardFace}>
        <TreacheryCard {...card} />
      </div>
    </div>
  );
}

export function LeaderDisc({ faction: slug, id }: { faction: string; id: string | null }) {
  const faction = factionById(slug);
  const leader = leadersOf(slug).find((item) => item.memberId === id);
  return leader ? (
    <div className={styles.leader}>
      <LeaderToken {...leader} logo={faction.logo} background={faction.background} />
    </div>
  ) : (
    <Text size="sm">No leader</Text>
  );
}

/* Route organ shared by the private preview and public reveal. */
function BattleCardFan({ cards, renderCard }: { cards: string[]; renderCard?: (id: string) => ReactNode }) {
  return (
    <div className={styles.editorFan}>
      {cards.map((id, index) => (
        <div
          key={id}
          style={
            {
              '--card-angle': `${(index - (cards.length - 1) / 2) * 22}deg`,
              '--card-offset': `${(index - (cards.length - 1) / 2) * 42}px`,
            } as CSSProperties
          }
        >
          {renderCard ? renderCard(id) : <BattleCard id={id} width={82} />}
        </div>
      ))}
    </div>
  );
}

/* Content candidate: the caller owns the plan; this read-only composition shows its declared troop strength and pieces. */
export function BattleWheel({
  plan,
  side,
  fan = true,
  leaderControl,
}: {
  plan: Plan;
  side: BattleSide;
  fan?: boolean;
  leaderControl?: ReactNode;
}) {
  const slug = BATTLE_FACTIONS[side];
  const faction = factionById(slug);
  const leader = leadersOf(slug).find((item) => item.memberId === plan.leader);
  return (
    <div className={`${styles.wheel} ${styles.editorWheel}`}>
      {fan ? <BattleCardFan cards={plan.cards} /> : null}
      <BattlePlanFace
        name={faction.name}
        background={faction.background}
        troopImage={side === 0 ? '/vector/troop/fremen.svg' : '/vector/troop/atreides.svg'}
        leader={leader ? { ...leader, logo: faction.logo, background: faction.background } : null}
        leaderControl={leaderControl}
        strength={troopStrength(plan)}
        troops={plan.troops}
        spice={plan.funded}
        adjustment={plan.adjustment}
      />
    </div>
  );
}

function TroopControls({
  plan,
  locked,
  onChange,
}: {
  plan: Plan;
  locked: boolean;
  onChange: (patch: Partial<Plan>) => void;
}) {
  return (
    <div className={styles.fields}>
      <SegmentedControl
        size="sm"
        aria-label="Funding mode"
        disabled={locked}
        value={plan.mode}
        data={[
          { value: 'max', label: 'Max' },
          { value: 'custom', label: 'Custom' },
        ]}
        onChange={(value) => onChange({ mode: value as Plan['mode'] })}
      />
      {plan.mode === 'max' ? (
        <>
          <NumberInput
            size="sm"
            label="Troops"
            aria-label="Troops"
            value={plan.troops}
            min={0}
            allowDecimal={false}
            disabled={locked}
            onChange={(value) => onChange({ troops: Number(value) })}
          />
          <NumberInput
            size="sm"
            label="Spice to dial"
            value={plan.funded}
            min={0}
            max={Math.min(11, plan.troops)}
            allowDecimal={false}
            disabled={locked}
            onChange={(value) => onChange({ funded: Number(value) })}
          />
        </>
      ) : (
        <>
          <NumberInput
            size="sm"
            label="Undialed"
            value={plan.troops - plan.funded}
            min={0}
            allowDecimal={false}
            disabled={locked}
            onChange={(value) => onChange({ troops: Number(value) + plan.funded })}
          />
          <NumberInput
            size="sm"
            label="Dialed"
            value={plan.funded}
            min={0}
            max={11}
            allowDecimal={false}
            disabled={locked}
            onChange={(value) => onChange({ troops: plan.troops - plan.funded + Number(value), funded: Number(value) })}
          />
        </>
      )}
      <NumberInput
        size="sm"
        label="Adjustment"
        value={plan.adjustment}
        step={0.5}
        disabled={locked}
        onChange={(value) => onChange({ adjustment: Number(value) })}
      />
    </div>
  );
}

function PieceControls({
  plan,
  side,
  locked,
  onChange,
}: {
  plan: Plan;
  side: BattleSide;
  locked: boolean;
  onChange: (patch: Partial<Plan>) => void;
}) {
  return (
    <div className={styles.pieceControls}>
      <Select
        size="sm"
        label="Leader"
        placeholder="No leader"
        clearable
        disabled={locked}
        value={plan.leader}
        data={leadersOf(BATTLE_FACTIONS[side]).map((leader) => ({ value: leader.memberId, label: leader.name }))}
        onChange={(value) => onChange({ leader: value })}
        comboboxProps={{ withinPortal: true }}
      />
      <div className={styles.hand} aria-label="Cards from your hand">
        {Object.entries(CARDS).map(([id, card]) => (
          <button
            key={id}
            type="button"
            className={styles.cardChoice}
            aria-label={`${plan.cards.includes(id) ? 'Return' : 'Use'} ${card.name}`}
            aria-pressed={plan.cards.includes(id)}
            disabled={locked}
            onClick={() =>
              onChange({
                cards: plan.cards.includes(id) ? plan.cards.filter((value) => value !== id) : [...plan.cards, id],
              })
            }
          >
            <BattleCard id={id} width={48} />
            <Text component="span" size="sm">
              {plan.cards.includes(id) ? 'In plan' : 'In hand'}
            </Text>
          </button>
        ))}
      </div>
    </div>
  );
}

/* Page composition: the accepted left tab keeps every plan edit private until reveal. */
export function BattlePlanner({ state, dispatch, variant }: BattleProps) {
  const side = state.viewer;
  if (side === 'spectator' || state.stage === 'idle' || state.stage === 'resolved' || !state.claims[side]) {
    return null;
  }
  const plan = state.plans[side];
  const locked = state.ready[side] || state.stage === 'revealed';
  const edit = (patch: Partial<Plan>) => dispatch({ type: 'plan', patch });
  const troops = <TroopControls plan={plan} locked={locked} onChange={edit} />;
  const pieces = <PieceControls plan={plan} side={side} locked={locked} onChange={edit} />;
  const readout = (
    <div className={styles.preview}>
      <CanvasScale canvasWidth={180} canvasHeight={264}>
        <div className={styles.previewCanvas}>
          <BattleWheel plan={plan} side={side} />
        </div>
      </CanvasScale>
    </div>
  );
  const ready = (
    <div className={styles.ready}>
      <Text size="sm">
        {state.stage === 'revealed'
          ? `${plan.funded} spice spent at reveal`
          : `${11 - plan.funded} available in your bank, ${plan.funded} reserved`}
      </Text>
      {state.stage !== 'revealed' ? (
        <Button
          size="sm"
          variant={state.ready[side] ? 'light' : 'filled'}
          onClick={() => dispatch({ type: 'ready', now: Date.now() })}
        >
          {state.ready[side] ? 'Undo Ready' : 'Ready'}
        </Button>
      ) : null}
    </div>
  );
  return (
    <div className={styles.planner} data-battle-planner={variant}>
      <WorkbenchLayout gap="sm">
        <WorkbenchLayout.Workbench>
          <WorkbenchLayout.Chapters>
            <Stack gap="sm">
              {troops}
              {pieces}
            </Stack>
          </WorkbenchLayout.Chapters>
          <WorkbenchLayout.Rail>{readout}</WorkbenchLayout.Rail>
        </WorkbenchLayout.Workbench>
        {ready}
      </WorkbenchLayout>
    </div>
  );
}

/* Route organ: readiness belongs to the plan's perimeter; the centre remains free for the countdown. */
function ReadinessRing({ ready, side }: { ready: boolean; side: BattleSide }) {
  return (
    <svg
      className={styles.readinessRing}
      data-ready={ready}
      viewBox="0 0 200 200"
      role="img"
      aria-label={`${side === 0 ? 'Fremen' : 'Atreides'} ${ready ? 'ready' : 'preparing'}`}
    >
      <circle cx="100" cy="100" r="96" />
    </svg>
  );
}

/* Route composition: claim controls, revealed plans and outcome agreement at the dropped indicator. */
export function BattleCallout({ state, dispatch, variant, now }: BattleProps & { now: number }) {
  const revealed = state.stage === 'revealed';
  const facingSide = (value: BattleSide) => {
    const choice = state.choices[value];
    const leaderId = state.plans[value].leader;
    const leaderPiece = `${value}:leader`;
    const leaderMoved = state.moved.includes(leaderPiece);
    const shownPlan = leaderMoved ? { ...state.plans[value], leader: null } : state.plans[value];
    const drag = (piece: string) => ({
      draggable: state.viewer !== 'spectator',
      onDragStart: (event: DragEvent<HTMLDivElement>) => {
        event.dataTransfer.setData('text/battle-piece', piece);
        event.dataTransfer.effectAllowed = 'move';
      },
    });
    const leaderControl =
      leaderId && !leaderMoved ? (
        <div
          {...drag(leaderPiece)}
          className={styles.dragPiece}
          aria-label={`Move ${leadersOf(BATTLE_FACTIONS[value]).find((leader) => leader.memberId === leaderId)?.name}`}
        >
          <LeaderDisc faction={BATTLE_FACTIONS[value]} id={leaderId} />
        </div>
      ) : null;
    return (
      <div className={styles.facingSide} data-battle-side={value}>
        {state.claims[value] && !revealed ? <ReadinessRing ready={state.ready[value]} side={value} /> : null}
        {revealed ? (
          <div className={styles.publicFan}>
            <BattleCardFan
              cards={state.plans[value].cards.filter(
                (id) => !state.moved.includes(`${value}:${id}`) && !state.returned.includes(`${value}:${id}`)
              )}
              renderCard={(id) => (
                <div
                  {...drag(`${value}:${id}`)}
                  aria-label={`Move ${cardData(id).name}`}
                  onDoubleClick={() => state.viewer === value && dispatch({ type: 'return', piece: `${value}:${id}` })}
                >
                  <BattleCard id={id} width={82} />
                </div>
              )}
            />
          </div>
        ) : null}
        {state.claims[value] ? (
          <div className={styles.revealDisc} data-revealed={revealed}>
            <div className={styles.revealTurn}>
              <div className={styles.revealBack} aria-hidden={revealed}>
                <FactionToken faction={factionById(BATTLE_FACTIONS[value])} size={11.25} />
              </div>
              {revealed ? (
                <div className={styles.revealFront}>
                  <BattleWheel plan={shownPlan} side={value} fan={false} leaderControl={leaderControl} />
                </div>
              ) : null}
            </div>
          </div>
        ) : revealed ? (
          <div className={styles.facingWheel}>
            <BattleWheel plan={shownPlan} side={value} fan={false} leaderControl={leaderControl} />
          </div>
        ) : state.claims[value] ? (
          <FactionToken faction={factionById(BATTLE_FACTIONS[value])} size={11.25} />
        ) : (
          <Button
            size="md"
            variant="filled"
            color="gray"
            radius={90}
            w={180}
            h={180}
            disabled={state.viewer !== value}
            onClick={() => dispatch({ type: 'claim', side: value })}
          >
            Claim {value === 0 ? 'left' : 'right'}
          </Button>
        )}
        {state.claims[value] && (!revealed || choice) && revealed ? (
          <div className={styles.facingStatus}>
            <StatusBadge tone={revealed ? 'brand' : state.ready[value] ? 'positive' : 'pending'}>
              {revealed
                ? OUTCOMES.find(([result]) => result === choice)?.[1]
                : state.ready[value]
                  ? 'Ready'
                  : 'Preparing'}
            </StatusBadge>
          </div>
        ) : null}
      </div>
    );
  };
  const winAction = (value: 'left' | 'none' | 'right') => (
    <Button
      size="sm"
      variant="filled"
      color={state.viewer !== 'spectator' && state.choices[state.viewer] === value ? 'selected' : 'gray'}
      aria-label={OUTCOMES.find(([outcome]) => outcome === value)?.[1]}
      aria-pressed={state.viewer !== 'spectator' && state.choices[state.viewer] === value}
      disabled={state.viewer === 'spectator'}
      className={value !== 'none' ? styles.fittedWin : undefined}
      data-outcome={value}
      w={value === 'none' ? 72 : 80}
      px={value !== 'none' ? 6 : undefined}
      fz={value !== 'none' ? 12 : undefined}
      h={value === 'none' ? 44 : 32}
      onClick={() => dispatch({ type: 'outcome', outcome: value })}
    >
      {value === 'none' ? (
        <>
          No
          <br />
          winner
        </>
      ) : value === 'left' ? (
        'Left won'
      ) : (
        'Right won'
      )}
    </Button>
  );
  const body = (
    <CalloutSurface
      radius={112}
      actions={
        <div className={`${styles.sketchActions} ${styles.fittedActions}`}>
          {revealed ? (
            <>
              {winAction('left')}
              {winAction('right')}
            </>
          ) : state.stage === 'countdown' ? null : (
            <Button
              size="sm"
              variant="filled"
              color="gray"
              disabled={state.viewer === 'spectator'}
              onClick={() => dispatch({ type: 'cancel' })}
            >
              Cancel battle
            </Button>
          )}
        </div>
      }
    >
      <div className={styles.facingBody}>
        {facingSide(0)}
        <div className={styles.facingCentre}>
          {revealed ? (
            <div className={styles.integratedAction}>{winAction('none')}</div>
          ) : state.stage === 'countdown' ? (
            <div
              className={styles.countdown}
              key={Math.ceil(((state.deadline ?? now) - now) / 1000)}
              aria-live="polite"
            >
              {Math.max(0, Math.ceil(((state.deadline ?? now) - now) / 1000))}
            </div>
          ) : null}
        </div>
        {facingSide(1)}
      </div>
    </CalloutSurface>
  );
  return (
    <div
      className={`${styles.callout} ${styles.battleCallout}`}
      data-battle-callout={variant}
      data-battle-stage={state.stage}
    >
      {body}
    </div>
  );
}

/* Returned treachery cards stay in their owning faction's hand, visible only to that fixture viewer. */
export function BattleHand({ state }: { state: BattleState }) {
  if (state.viewer === 'spectator') {
    return null;
  }
  const side = state.viewer;
  const cards = state.plans[side].cards.filter(
    (id) => state.returned.includes(`${side}:${id}`) && !state.moved.includes(`${side}:${id}`)
  );
  return cards.length ? (
    <div className={styles.hand} aria-label="Returned battle cards">
      {cards.map((id) => (
        <div
          key={id}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('text/battle-piece', `${side}:${id}`);
            event.dataTransfer.effectAllowed = 'move';
          }}
          aria-label={`Move ${cardData(id).name}`}
        >
          <BattleCard id={id} />
        </div>
      ))}
    </div>
  ) : null;
}

export function BattleSwitcher({ state, dispatch }: BattleProps) {
  const navigate = useNavigate();
  const search = useSearch({ from: '/_app/play/demo' });
  if (!import.meta.env.DEV) {
    return null;
  }
  return (
    <div className={styles.switcher} aria-label="Battle prototype controls">
      <div className={styles.switcherRow}>
        <strong>Battle</strong>
        <select
          aria-label="Battle scenario"
          value={state.scenario}
          onChange={(event) =>
            void navigate({
              to: '/play/demo',
              replace: true,
              search: { ...search, scenario: event.target.value as BattleState['scenario'] },
            })
          }
        >
          {BATTLE_SCENARIOS.map((scenario) => (
            <option key={scenario}>{scenario}</option>
          ))}
        </select>
        <select
          aria-label="Fixture viewer"
          value={state.viewer}
          onChange={(event) =>
            dispatch({
              type: 'viewer',
              viewer: event.target.value === 'spectator' ? 'spectator' : (Number(event.target.value) as BattleSide),
            })
          }
        >
          <option value={0}>Fremen</option>
          <option value={1}>Atreides</option>
          <option value="spectator">Spectator</option>
        </select>
      </div>
      <small>
        Prototype only · {state.stage} · {state.ready.filter(Boolean).length}/2 ready · {state.moved.length} moved ·{' '}
        {state.returned.length} returned
      </small>
    </div>
  );
}
