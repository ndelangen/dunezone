import { Button, NumberInput, SegmentedControl, Text, Select } from '@mantine/core';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { StatusBadge } from '@ui/content/StatusBadge';
import { TopicIcon } from '@ui/content/TopicIcon';
import { CalloutSurface } from '@ui/surface/CalloutSurface';
import type { CSSProperties, ReactNode } from 'react';

/* Accepted throwaway battle prototype for #1148; decisions live on #1016. */
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

import { BATTLE_FACTIONS, BATTLE_SCENARIOS, OUTCOMES, troopStrength } from './battle';
import type { BattleAction, BattleSide, BattleState, BattleVariant, Plan } from './battle';
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
    <Text size="xs">No leader</Text>
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
export function BattleWheel({ plan, side, fan = true }: { plan: Plan; side: BattleSide; fan?: boolean }) {
  const slug = BATTLE_FACTIONS[side];
  const faction = factionById(slug);
  return (
    <div
      className={`${styles.wheel} ${styles.editorWheel}`}
      aria-label={`${faction.name} plan, troop strength ${troopStrength(plan)}, ${plan.funded} spice`}
    >
      {fan ? <BattleCardFan cards={plan.cards} /> : null}
      <div className={styles.wheelFace}>
        <div className={styles.wheelArtwork}>
          <BackgroundRenderer background={faction.background} />
        </div>
        <strong className={styles.strength}>{troopStrength(plan)}</strong>
        <div className={styles.troopReadout}>
          <div className={styles.troop}>
            <TroopToken
              image={side === 0 ? '/vector/troop/fremen.svg' : '/vector/troop/atreides.svg'}
              background={faction.background}
              star={undefined}
              hue={undefined}
              striped={undefined}
            />
          </div>
          <span>{plan.troops}</span>
        </div>
        <div className={styles.leaderReadout}>
          <span className={styles.spice}>
            <svg viewBox="0 0 100 100" aria-label="Spice">
              <use href="/vector/icon/spice.svg#root" width="100" height="100" fill="currentColor" />
            </svg>
            {plan.funded}
          </span>
          <LeaderDisc faction={slug} id={plan.leader} />
        </div>
        {plan.adjustment ? (
          <span className={styles.adjustment}>
            {plan.adjustment > 0 ? '+' : ''}
            {plan.adjustment} adjustment
          </span>
        ) : null}
      </div>
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
        size="xs"
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
            size="xs"
            label="Troops"
            aria-label="Troops"
            value={plan.troops}
            min={0}
            allowDecimal={false}
            disabled={locked}
            onChange={(value) => onChange({ troops: Number(value) })}
          />
          <NumberInput
            size="xs"
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
            size="xs"
            label="Undialed"
            value={plan.troops - plan.funded}
            min={0}
            allowDecimal={false}
            disabled={locked}
            onChange={(value) => onChange({ troops: Number(value) + plan.funded })}
          />
          <NumberInput
            size="xs"
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
        size="xs"
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
        size="xs"
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
            <small>{plan.cards.includes(id) ? 'In plan' : 'In hand'}</small>
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
      <BattleWheel plan={plan} side={side} />
    </div>
  );
  const ready = (
    <div className={styles.ready}>
      <Text size="xs">
        {state.stage === 'revealed'
          ? `${plan.funded} spice spent at reveal`
          : `${11 - plan.funded} available in your bank, ${plan.funded} reserved`}
      </Text>
      {state.stage !== 'revealed' ? (
        <Button
          size="xs"
          color={state.ready[side] ? 'gray' : 'orange'}
          onClick={() => dispatch({ type: 'ready', now: Date.now() })}
        >
          {state.ready[side] ? 'Undo Ready' : 'Ready'}
        </Button>
      ) : null}
    </div>
  );
  return (
    <div className={`${styles.planner} ${styles.battlePlanner}`} data-battle-planner={variant}>
      <div className={styles.plannerHeading}>
        <TopicIcon topic="battle" size={19} />
        <strong>{factionById(BATTLE_FACTIONS[side]).name}</strong>
        <span>{state.stage === 'revealed' ? 'Revealed plan' : 'Private plan'}</span>
      </div>

      <>
        <div className={styles.editBesidePreview}>
          <div>
            {troops}
            {pieces}
          </div>
          {readout}
        </div>
        {ready}
      </>
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

/* Route composition: the territory, claim controls, revealed plans and outcome agreement. */
export function BattleCallout({ state, dispatch, variant, now }: BattleProps & { now: number }) {
  const revealed = state.stage === 'revealed';
  const facingSide = (value: BattleSide) => {
    const choice = state.choices[value];
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
                  draggable={state.viewer !== 'spectator'}
                  onDragEnd={(event) =>
                    dispatch({ type: 'move', piece: `${value}:${id}`, screen: [event.clientX, event.clientY] })
                  }
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
                  <BattleWheel plan={state.plans[value]} side={value} fan={false} />
                </div>
              ) : null}
            </div>
          </div>
        ) : revealed ? (
          <div className={styles.facingWheel}>
            <BattleWheel plan={state.plans[value]} side={value} fan={false} />
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
      size="xs"
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
              size="xs"
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

export function BattleLeftovers({ state }: { state: BattleState }) {
  const settled = state.stage === 'resolved';
  const cards = state.plans
    .flatMap((plan, side) => plan.cards.map((id) => ({ id, side })))
    .filter(
      ({ id, side }) => !state.returned.includes(`${side}:${id}`) && settled && !state.moved.includes(`${side}:${id}`)
    );
  return (
    <div className={styles.leftovers} aria-label="Battle pieces">
      {cards.map(({ id, side }) => (
        <BattleCard key={`${side}:${id}`} id={id} width={45} />
      ))}
      {settled
        ? state.plans.map((plan, side) => (
            <div className={styles.settledLeader} key={side}>
              <LeaderDisc faction={BATTLE_FACTIONS[side]} id={plan.leader} />
            </div>
          ))
        : null}
    </div>
  );
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
