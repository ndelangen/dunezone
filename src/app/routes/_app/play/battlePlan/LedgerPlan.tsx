import { UnstyledButton } from '@mantine/core';

import styles from './LedgerPlan.module.css';
import {
  AdjustField,
  BattleLine,
  ModeSwitch,
  PieceTile,
  ReadyButton,
  RevealToggle,
  Stepper,
  StrengthSum,
} from './parts';
import {
  availableSpice,
  capableFaces,
  cardsOf,
  disclosure,
  fullSupport,
  leadersOf,
  planLocks,
  planPieces,
  setTotal,
  supportedMax,
  toggleCard,
  toggleLeader,
  totalOf,
  troopLimitOf,
  troopsOf,
  withTroops,
} from './planView';
import type { BattlePlanViewProps } from './planView';

/**
 * Variant A, the ledger: the whole plan on one sheet, a row per part, so every change is one click where it shows.
 * Leaders and cards are tiles to tap, every number a stepper, the sum and Ready stay pinned at the bottom.
 */
export function LedgerPlan(props: BattlePlanViewProps) {
  const { plan, hand, balance, onEdit, onDisclose } = props;
  const locks = planLocks(props);
  const pieces = planPieces(plan, hand);
  const faces = capableFaces(plan);
  const single = faces.length === 1;
  return (
    <div className={styles.ledger}>
      <BattleLine territory={props.territory} opponent={props.opponent} />
      <section className={styles.row} aria-label="Leader">
        <span className={styles.label}>Leader</span>
        <div className={styles.strip}>
          {leadersOf(pieces).map((piece) => (
            <PieceTile
              key={piece.id}
              piece={piece}
              selected={plan.leaderId === piece.id}
              disabled={locks.leaderLocked}
              onToggle={() => onEdit(toggleLeader(plan, piece.id))}
              reveal={
                <RevealToggle
                  plan={plan}
                  part={disclosure.leader}
                  name="your leader"
                  disabled={locks.revealLocked}
                  onDisclose={onDisclose}
                />
              }
            />
          ))}
        </div>
      </section>
      <section className={styles.row} aria-label="Cards">
        <span className={styles.label}>Cards</span>
        <div className={styles.strip}>
          {cardsOf(pieces).map((piece) => (
            <PieceTile
              key={piece.id}
              piece={piece}
              width={38}
              selected={plan.cardIds.includes(piece.id)}
              disabled={locks.cardLocked(piece.id)}
              onToggle={() => onEdit(toggleCard(plan, piece.id))}
              reveal={
                <RevealToggle
                  plan={plan}
                  part={disclosure.card(piece.id)}
                  name="this card"
                  disabled={locks.revealLocked}
                  onDisclose={onDisclose}
                />
              }
            />
          ))}
          {cardsOf(pieces).length ? null : <span className={styles.empty}>No cards in hand</span>}
        </div>
      </section>
      <section className={styles.dial} aria-label="Dial">
        <header className={styles.dialHead}>
          <ModeSwitch mode={plan.mode} disabled={locks.dialLocked} onChange={(mode) => onEdit({ mode })} />
          <AdjustField plan={plan} disabled={locks.dialLocked} onEdit={onEdit} />
          <RevealToggle
            className={styles.dialReveal}
            plan={plan}
            part={disclosure.dial}
            name="your dial"
            disabled={locks.revealLocked}
            onDisclose={onDisclose}
          />
        </header>
        {faces.map((face) =>
          plan.mode === 'max' ? (
            <label key={face.id} className={styles.field}>
              <span>{single ? 'Troops' : face.name}</span>
              <Stepper
                label={single ? 'Troops' : face.name}
                value={totalOf(plan, face.id)}
                max={troopLimitOf(props, face.id)}
                disabled={locks.dialLocked}
                onChange={(total) => onEdit(setTotal(plan, face.id, total))}
              />
            </label>
          ) : (
            <div key={face.id} className={styles.field}>
              <span>{single ? 'Troops' : face.name}</span>
              <span className={styles.pair}>
                <Stepper
                  size="sm"
                  label={`${face.name} unsupported`}
                  value={troopsOf(plan, face.id).undialed}
                  max={troopLimitOf(props, face.id) - troopsOf(plan, face.id).dialed}
                  disabled={locks.dialLocked}
                  onChange={(undialed) => onEdit({ troops: withTroops(plan, face.id, { undialed }) })}
                  suffix="plain"
                />
                <Stepper
                  size="sm"
                  label={`${face.name} supported`}
                  value={troopsOf(plan, face.id).dialed}
                  max={Math.min(
                    supportedMax(plan, face, balance) ?? Infinity,
                    troopLimitOf(props, face.id) - troopsOf(plan, face.id).undialed
                  )}
                  disabled={locks.dialLocked}
                  onChange={(dialed) => onEdit({ troops: withTroops(plan, face.id, { dialed }) })}
                  suffix="spiced"
                />
              </span>
            </div>
          )
        )}
        {plan.mode === 'max' ? (
          <div className={styles.field}>
            <span>Spice</span>
            <span className={styles.pair}>
              <Stepper
                label="Spice"
                value={plan.spice}
                max={availableSpice(plan, balance)}
                disabled={locks.dialLocked}
                onChange={(spice) => onEdit({ spice })}
                suffix={`of ${availableSpice(plan, balance)}`}
              />
              <UnstyledButton
                className={styles.quick}
                disabled={locks.dialLocked || plan.spice === fullSupport(plan, balance)}
                onClick={() => onEdit({ spice: fullSupport(plan, balance) })}
                title="Support every troop, as far as your spice goes"
              >
                All
              </UnstyledButton>
            </span>
          </div>
        ) : null}
      </section>
      <footer className={styles.footer}>
        <StrengthSum props={props} compact />
        <ReadyButton {...props} />
      </footer>
    </div>
  );
}
