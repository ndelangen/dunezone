import { Button, NumberInput, SegmentedControl, Text, Select, Accordion } from '@mantine/core';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { StatusBadge } from '@ui/content/StatusBadge';
import { TopicIcon } from '@ui/content/TopicIcon';
import { CalloutSurface } from '@ui/surface/CalloutSurface';
import { Surface } from '@ui/surface/Surface';
import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/* Throwaway route organs for #1148, comparing territory callouts and private planning. */
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

import {
  battleTerritory,
  BATTLE_FACTIONS,
  BATTLE_NAMES,
  BATTLE_SCENARIOS,
  BATTLE_VARIANTS,
  OUTCOMES,
  troopStrength,
} from './battle';
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
export function BattleWheel({
  plan,
  side,
  fan = true,
  editor = false,
}: {
  plan: Plan;
  side: BattleSide;
  fan?: boolean;
  editor?: boolean;
}) {
  const slug = BATTLE_FACTIONS[side];
  const faction = factionById(slug);
  return (
    <div
      className={`${styles.wheel} ${editor ? styles.editorWheel : ''}`}
      aria-label={`${faction.name} plan, troop strength ${troopStrength(plan)}, ${plan.funded} spice`}
    >
      {fan ? (
        editor ? (
          <BattleCardFan cards={plan.cards} />
        ) : (
          <div className={styles.fan}>
            {plan.cards.map((id, i) => (
              <div key={id} style={{ transform: `rotate(${(i - (plan.cards.length - 1) / 2) * 15}deg)` }}>
                <BattleCard id={id} width={76} />
              </div>
            ))}
          </div>
        )
      ) : null}
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
          <span>
            {plan.troops}
            {!editor ? (
              <small>
                {plan.funded} dialed
                <br />
                {plan.troops - plan.funded} undialed
              </small>
            ) : null}
          </span>
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
  if (
    (variant === 'E' ||
      variant === 'F' ||
      variant === 'G' ||
      variant === 'H' ||
      variant === 'I' ||
      variant === 'J' ||
      variant === 'K') &&
    (side === 'spectator' || state.stage === 'idle' || state.stage === 'resolved' || !state.claims[side])
  ) {
    return null;
  }
  if (side === 'spectator') {
    return <Text size="sm">Watching the battle. Private plans belong to the two combatants.</Text>;
  }
  if (state.stage === 'idle' || state.stage === 'resolved') {
    return (
      <div className={styles.planner}>
        <Text size="sm">Place the battle marker on a territory to begin.</Text>
        {state.result ? (
          <Text size="sm">
            Last result: {OUTCOMES.find(([value]) => value === state.result)?.[1]}. Leftover pieces are beside{' '}
            {battleTerritory(state)}.
          </Text>
        ) : null}
      </div>
    );
  }
  if (!state.claims[side]) {
    return <Text size="sm">Claim your side on the table to prepare a plan.</Text>;
  }
  const plan = state.plans[side];
  const locked = state.ready[side] || state.stage === 'revealed';
  const edit = (patch: Partial<Plan>) => dispatch({ type: 'plan', patch });
  const troops = <TroopControls plan={plan} locked={locked} onChange={edit} />;
  const pieces = <PieceControls plan={plan} side={side} locked={locked} onChange={edit} />;
  const readout = (
    <div className={styles.preview}>
      <BattleWheel
        plan={plan}
        side={side}
        editor={variant === 'G' || variant === 'H' || variant === 'I' || variant === 'J' || variant === 'K'}
      />
      {variant !== 'E' &&
      variant !== 'F' &&
      variant !== 'G' &&
      variant !== 'H' &&
      variant !== 'I' &&
      variant !== 'J' &&
      variant !== 'K' ? (
        <Text size="xs">Troop strength {troopStrength(plan)}. Leader strength is separate.</Text>
      ) : null}
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
      ) : variant === 'E' ||
        variant === 'F' ||
        variant === 'G' ||
        variant === 'H' ||
        variant === 'I' ||
        variant === 'J' ||
        variant === 'K' ? null : (
        <Text size="xs">Choose the result on the table.</Text>
      )}
    </div>
  );
  return (
    <div className={`${styles.planner} ${styles[`planner${variant}`]}`} data-battle-planner={variant}>
      <div className={styles.plannerHeading}>
        <TopicIcon topic="battle" size={19} />
        <strong>
          {factionById(BATTLE_FACTIONS[side]).name}
          {variant !== 'F' &&
          variant !== 'G' &&
          variant !== 'H' &&
          variant !== 'I' &&
          variant !== 'J' &&
          variant !== 'K'
            ? ` at ${battleTerritory(state)}`
            : ''}
        </strong>
        <span>{state.stage === 'revealed' ? 'Revealed plan' : 'Private plan'}</span>
      </div>
      {variant === 'A' ||
      variant === 'D' ||
      variant === 'E' ||
      variant === 'F' ||
      variant === 'G' ||
      variant === 'H' ||
      variant === 'I' ||
      variant === 'J' ||
      variant === 'K' ? (
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
      ) : null}
      {variant === 'B' ? (
        <>
          <div className={styles.previewBesidePieces}>
            {readout}
            {pieces}
          </div>
          {troops}
          {ready}
        </>
      ) : null}
      {variant === 'C' ? (
        <>
          <div className={styles.guided}>
            <Accordion defaultValue="troops" variant="default">
              <Accordion.Item value="troops">
                <Accordion.Control>Forces and funding</Accordion.Control>
                <Accordion.Panel>{troops}</Accordion.Panel>
              </Accordion.Item>
              <Accordion.Item value="pieces">
                <Accordion.Control>Leader and cards</Accordion.Control>
                <Accordion.Panel>{pieces}</Accordion.Panel>
              </Accordion.Item>
            </Accordion>
            {readout}
          </div>
          {ready}
        </>
      ) : null}
    </div>
  );
}

/* Control candidate: its caller owns the claim; this control offers the empty faction position. */
function ClaimCircle({ side, state, dispatch }: Pick<BattleProps, 'state' | 'dispatch'> & { side: BattleSide }) {
  const claimed = state.claims[side];
  const faction = factionById(BATTLE_FACTIONS[side]);
  return (
    <div className={styles.claim}>
      <Text size="xs">{side === 0 ? 'Aggressor · ties win' : 'Defender'}</Text>
      {claimed ? (
        <>
          <FactionToken faction={faction} size={4.4} />
          <strong>{faction.name}</strong>
          <Text size="xs">{state.ready[side] ? 'Ready' : 'Preparing'}</Text>
        </>
      ) : (
        <Button
          className={styles.claimButton}
          variant="subtle"
          color="gray"
          radius="50%"
          w={100}
          h={100}
          disabled={state.viewer !== side}
          onClick={() => dispatch({ type: 'claim', side })}
        >
          Claim {side === 0 ? 'left' : 'right'}
        </Button>
      )}
    </div>
  );
}

function RevealedCards({ state, dispatch, column }: Pick<BattleProps, 'state' | 'dispatch'> & { column?: BattleSide }) {
  return (
    <div className={styles.revealedCards}>
      {state.plans
        .flatMap((plan, side) => plan.cards.map((id) => ({ id, side })))
        .filter(({ side }) => column === undefined || side === column)
        .filter(({ id, side }) => !state.moved.includes(`${side}:${id}`) && !state.returned.includes(`${side}:${id}`))
        .map(({ id, side }) => (
          <div
            key={`${side}:${id}`}
            draggable={state.viewer !== 'spectator'}
            onDragEnd={(event) =>
              dispatch({ type: 'move', piece: `${side}:${id}`, screen: [event.clientX, event.clientY] })
            }
            onDoubleClick={() => state.viewer === side && dispatch({ type: 'return', piece: `${side}:${id}` })}
          >
            <BattleCard id={id} width={58} />
          </div>
        ))}
    </div>
  );
}

function OutcomeControls({ state, dispatch }: Pick<BattleProps, 'state' | 'dispatch'>) {
  return (
    <div className={styles.outcome}>
      <div className={styles.choices}>
        {state.choices.map((choice, side) => (
          <Text key={side} size="xs">
            {factionById(BATTLE_FACTIONS[side]).name}: {OUTCOMES.find(([value]) => value === choice)?.[1] ?? 'choosing'}
          </Text>
        ))}
      </div>
      <div className={styles.outcomeButtons}>
        {OUTCOMES.map(([value, label]) => (
          <Button
            key={value}
            size="xs"
            color="orange"
            variant={state.viewer !== 'spectator' && state.choices[state.viewer] === value ? 'filled' : 'subtle'}
            disabled={state.viewer === 'spectator'}
            onClick={() => dispatch({ type: 'outcome', outcome: value })}
          >
            {label}
          </Button>
        ))}
      </div>
      <Text size="xs">
        {state.choices[0] && state.choices[1] && state.choices[0] !== state.choices[1]
          ? 'Different choices. The battle stays open.'
          : 'The battle ends when both choices match.'}
      </Text>
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
  const side = (value: BattleSide) =>
    revealed ? (
      <div className={styles.revealedSide}>
        <Text size="xs">{value === 0 ? 'Aggressor · ties win' : 'Defender'}</Text>
        <BattleWheel
          plan={state.plans[value]}
          side={value}
          fan={false}
          editor={variant === 'G' || variant === 'H' || variant === 'I' || variant === 'J' || variant === 'K'}
        />
        <Text size="xs">{factionById(BATTLE_FACTIONS[value]).name}</Text>
      </div>
    ) : (
      <ClaimCircle side={value} state={state} dispatch={dispatch} />
    );
  const heading = (
    <div className={styles.calloutHeading}>
      <TopicIcon topic="battle" size={17} />
      <strong>{battleTerritory(state)}</strong>
      <span>
        {revealed
          ? 'Plans revealed'
          : state.stage === 'countdown'
            ? `Reveal in ${Math.max(0, Math.ceil(((state.deadline ?? now) - now) / 1000))}`
            : 'Battle preparation'}
      </span>
    </div>
  );
  const centre =
    state.stage === 'countdown' ? (
      <div className={styles.countdown} aria-live="polite">
        {Math.max(0, Math.ceil(((state.deadline ?? now) - now) / 1000))}
      </div>
    ) : revealed ? (
      <RevealedCards state={state} dispatch={dispatch} />
    ) : (
      <Text size="xs" ta="center">
        Plans stay
        <br />
        private
      </Text>
    );
  const footer = revealed ? (
    <OutcomeControls state={state} dispatch={dispatch} />
  ) : state.stage === 'preparing' ? (
    <Button
      size="xs"
      variant="subtle"
      color="gray"
      disabled={state.viewer === 'spectator'}
      onClick={() => dispatch({ type: 'cancel' })}
    >
      Cancel battle
    </Button>
  ) : (
    <Text size="xs" ta="center">
      Undo Ready is in your private panel.
    </Text>
  );
  let body: ReactNode;
  if (
    variant === 'E' ||
    variant === 'F' ||
    variant === 'G' ||
    variant === 'H' ||
    variant === 'I' ||
    variant === 'J' ||
    variant === 'K'
  ) {
    const facingSide = (value: BattleSide) => {
      const choice = state.choices[value];
      return (
        <div className={styles.facingSide} data-battle-side={value}>
          {(variant === 'H' || variant === 'I' || variant === 'J' || variant === 'K') &&
          state.claims[value] &&
          !revealed ? (
            <ReadinessRing ready={state.ready[value]} side={value} />
          ) : null}
          {(variant === 'G' || variant === 'H' || variant === 'I' || variant === 'J' || variant === 'K') && revealed ? (
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
                    onDoubleClick={() =>
                      state.viewer === value && dispatch({ type: 'return', piece: `${value}:${id}` })
                    }
                  >
                    <BattleCard id={id} width={82} />
                  </div>
                )}
              />
            </div>
          ) : null}
          {(variant === 'F' ||
            variant === 'G' ||
            variant === 'H' ||
            variant === 'I' ||
            variant === 'J' ||
            variant === 'K') &&
          state.claims[value] ? (
            <div className={styles.revealDisc} data-revealed={revealed}>
              <div className={styles.revealTurn}>
                <div className={styles.revealBack} aria-hidden={revealed}>
                  <FactionToken faction={factionById(BATTLE_FACTIONS[value])} size={11.25} />
                </div>
                {revealed ? (
                  <div className={styles.revealFront}>
                    <BattleWheel
                      plan={state.plans[value]}
                      side={value}
                      fan={false}
                      editor={
                        variant === 'G' || variant === 'H' || variant === 'I' || variant === 'J' || variant === 'K'
                      }
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : revealed ? (
            <div className={styles.facingWheel}>
              <BattleWheel
                plan={state.plans[value]}
                side={value}
                fan={false}
                editor={variant === 'G' || variant === 'H' || variant === 'I' || variant === 'J' || variant === 'K'}
              />
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
          {state.claims[value] &&
          (!revealed || choice) &&
          ((variant !== 'F' &&
            variant !== 'G' &&
            variant !== 'H' &&
            variant !== 'I' &&
            variant !== 'J' &&
            variant !== 'K') ||
            revealed) ? (
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
        className={variant === 'K' && value !== 'none' ? styles.fittedWin : undefined}
        data-outcome={value}
        w={value === 'none' ? 72 : variant === 'J' || variant === 'K' ? (variant === 'K' ? 80 : 77) : undefined}
        px={(variant === 'J' || variant === 'K') && value !== 'none' ? 6 : undefined}
        fz={(variant === 'J' || variant === 'K') && value !== 'none' ? 12 : undefined}
        h={value === 'none' ? 44 : variant === 'K' ? 32 : undefined}
        onClick={() => dispatch({ type: 'outcome', outcome: value })}
      >
        {value === 'none' ? (
          <>
            No
            <br />
            winner
          </>
        ) : variant === 'J' || variant === 'K' ? (
          value === 'left' ? (
            'Left won'
          ) : (
            'Right won'
          )
        ) : (
          OUTCOMES.find(([outcome]) => outcome === value)?.[1]
        )}
      </Button>
    );
    const integratedSide = (value: BattleSide) => (
      <div className={styles.integratedSide}>
        {facingSide(value)}
        <div className={styles.integratedAction}>{revealed ? winAction(value === 0 ? 'left' : 'right') : null}</div>
      </div>
    );
    body = (
      <CalloutSurface
        radius={112}
        actions={
          variant === 'J' || variant === 'K' ? (
            <div className={`${styles.sketchActions} ${variant === 'K' ? styles.fittedActions : ''}`}>
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
          ) : variant === 'I' || state.stage === 'countdown' ? null : (
            <div className={styles.facingActions}>
              {revealed ? (
                OUTCOMES.map(([value, label]) => (
                  <Button
                    key={value}
                    size="xs"
                    variant="filled"
                    color={state.viewer !== 'spectator' && state.choices[state.viewer] === value ? 'selected' : 'gray'}
                    aria-pressed={state.viewer !== 'spectator' && state.choices[state.viewer] === value}
                    disabled={state.viewer === 'spectator'}
                    onClick={() => dispatch({ type: 'outcome', outcome: value })}
                  >
                    {label}
                  </Button>
                ))
              ) : (
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
          )
        }
      >
        <div className={styles.facingBody}>
          {variant === 'I' ? integratedSide(0) : facingSide(0)}
          <div className={styles.facingCentre}>
            {variant !== 'F' &&
            variant !== 'G' &&
            variant !== 'H' &&
            variant !== 'I' &&
            variant !== 'J' &&
            variant !== 'K' ? (
              <strong>{battleTerritory(state)}</strong>
            ) : null}
            {revealed ? (
              variant === 'I' || variant === 'J' || variant === 'K' ? (
                <div className={styles.integratedAction}>{winAction('none')}</div>
              ) : variant === 'G' || variant === 'H' ? null : (
                <div className={styles.facingCards}>
                  <RevealedCards state={state} dispatch={dispatch} column={0} />
                  <RevealedCards state={state} dispatch={dispatch} column={1} />
                </div>
              )
            ) : state.stage === 'countdown' ? (
              <div
                className={styles.countdown}
                key={Math.ceil(((state.deadline ?? now) - now) / 1000)}
                aria-live="polite"
              >
                {Math.max(0, Math.ceil(((state.deadline ?? now) - now) / 1000))}
              </div>
            ) : variant === 'I' ? (
              <Button
                size="xs"
                variant="filled"
                color="gray"
                w={72}
                h={44}
                aria-label="Cancel battle"
                disabled={state.viewer === 'spectator'}
                onClick={() => dispatch({ type: 'cancel' })}
              >
                Cancel
                <br />
                battle
              </Button>
            ) : variant === 'H' || variant === 'J' || variant === 'K' ? null : variant === 'F' || variant === 'G' ? (
              <div className={styles.centredStatus} role="status">
                {state.claims.map((claimed, value) =>
                  claimed ? (
                    <span key={value}>
                      {value === 0 ? 'Fremen' : 'Atreides'} {state.ready[value] ? 'ready' : 'preparing'}
                    </span>
                  ) : null
                )}
              </div>
            ) : null}
          </div>
          {variant === 'I' ? integratedSide(1) : facingSide(1)}
        </div>
      </CalloutSurface>
    );
  } else if (variant === 'D') {
    body = (
      <CalloutSurface
        actions={
          revealed ? (
            <div className={styles.capsuleActions}>
              {OUTCOMES.map(([value, label]) => (
                <Button
                  key={value}
                  size="xs"
                  color={value === 'left' ? 'red' : value === 'right' ? 'teal' : 'gray'}
                  variant={state.viewer !== 'spectator' && state.choices[state.viewer] === value ? 'filled' : 'subtle'}
                  disabled={state.viewer === 'spectator'}
                  onClick={() => dispatch({ type: 'outcome', outcome: value })}
                >
                  {label}
                </Button>
              ))}
            </div>
          ) : (
            <div className={styles.capsuleActions}>{footer}</div>
          )
        }
      >
        <div className={styles.capsuleBody}>
          <div className={styles.capsuleSide}>
            {side(0)}
            {revealed ? (
              <Text size="xs">{OUTCOMES.find(([value]) => value === state.choices[0])?.[1] ?? 'Choosing result'}</Text>
            ) : null}
          </div>
          <div className={styles.capsuleCentre}>
            {heading}
            {revealed ? (
              <div className={styles.cardColumns}>
                <RevealedCards state={state} dispatch={dispatch} column={0} />
                <RevealedCards state={state} dispatch={dispatch} column={1} />
              </div>
            ) : (
              centre
            )}
            {revealed ? (
              <Text size="xs" ta="center">
                {state.choices[0] && state.choices[1] && state.choices[0] !== state.choices[1]
                  ? 'Different choices'
                  : 'Both sides must agree'}
              </Text>
            ) : null}
          </div>
          <div className={styles.capsuleSide}>
            {side(1)}
            {revealed ? (
              <Text size="xs">{OUTCOMES.find(([value]) => value === state.choices[1])?.[1] ?? 'Choosing result'}</Text>
            ) : null}
          </div>
        </div>
      </CalloutSurface>
    );
  } else if (variant === 'C') {
    body = (
      <>
        {heading}
        <div className={styles.wings}>
          <Surface withBorder={false} padding="sm">
            {side(0)}
          </Surface>
          <div className={styles.between}>{centre}</div>
          <Surface withBorder={false} padding="sm">
            {side(1)}
          </Surface>
        </div>
        <Surface withBorder={false} padding="sm">
          {footer}
        </Surface>
      </>
    );
  } else if (variant === 'B') {
    body = (
      <Surface withBorder={false} padding="sm">
        <div className={styles.bridge}>
          {side(0)}
          <div className={styles.bridgeCentre}>
            {heading}
            {centre}
            {footer}
          </div>
          {side(1)}
        </div>
      </Surface>
    );
  } else {
    body = (
      <Surface withBorder={false} padding="sm">
        {heading}
        <div className={styles.combatants}>
          {side(0)}
          <div className={styles.between}>{centre}</div>
          {side(1)}
        </div>
        {footer}
      </Surface>
    );
  }
  return (
    <div
      className={`${styles.callout} ${styles[`callout${variant}`]}`}
      data-battle-callout={variant}
      data-battle-stage={state.stage}
    >
      {body}
      {variant !== 'D' &&
      variant !== 'E' &&
      variant !== 'F' &&
      variant !== 'G' &&
      variant !== 'H' &&
      variant !== 'I' &&
      variant !== 'J' &&
      variant !== 'K' ? (
        <span className={styles.territoryLink} aria-hidden="true" />
      ) : null}
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

export function BattleSwitcher({ state, dispatch, variant }: BattleProps) {
  const navigate = useNavigate();
  const search = useSearch({ from: '/_app/play/demo' });
  const go = (delta: number) =>
    void navigate({
      to: '/play/demo',
      replace: true,
      search: {
        ...search,
        variant: 'play',
        battle:
          BATTLE_VARIANTS[(BATTLE_VARIANTS.indexOf(variant) + delta + BATTLE_VARIANTS.length) % BATTLE_VARIANTS.length],
      },
    });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [role="spinbutton"], [role="combobox"], [contenteditable="true"]')) {
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        go(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  if (!import.meta.env.DEV) {
    return null;
  }
  return (
    <div className={styles.switcher} aria-label="Battle prototype controls">
      <div className={styles.switcherRow}>
        <Button size="compact-xs" color="gray" onClick={() => go(-1)} aria-label="Previous battle variant">
          ←
        </Button>
        <strong>
          {variant} · {BATTLE_NAMES[variant]}
        </strong>
        <Button size="compact-xs" color="gray" onClick={() => go(1)} aria-label="Next battle variant">
          →
        </Button>
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
