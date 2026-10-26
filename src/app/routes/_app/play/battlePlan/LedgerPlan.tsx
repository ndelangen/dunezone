import { Tooltip, UnstyledButton } from '@mantine/core';
import type { BattleFace } from '@shared/play/battle';
import { TopicIcon } from '@ui/content/TopicIcon';
import { SortableRow } from '@ui/control/SortableRow';
import { Fragment } from 'react';

import styles from './LedgerPlan.module.css';
import { DialGrid, DialRow, PieceTile, RevealToggle, TroopLabel } from './parts';
import { PlanHead } from './PlanHead';
import {
  capableFaces,
  cardsOf,
  disclosure,
  fullSupport,
  leadersOf,
  planLocks,
  planPieces,
  setTotal,
  snapSpice,
  spiceMatters,
  supportableSpice,
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
 * The ledger: the whole plan on one sheet under the wheel, a row per part, so every change is one click where it shows.
 * Leaders and cards are tiles to tap;
 * every count is a slider to sweep and a stepper to nudge.
 */
export function LedgerPlan(props: BattlePlanViewProps) {
  const { plan, hand, canAct, onEdit, onReorder, onDisclose } = props;
  const locks = planLocks(props);
  const pieces = planPieces(plan, hand);
  const cards = cardsOf(pieces, plan.cardIds);
  const order = pieces.map((piece) => piece.id);
  return (
    <div className={styles.ledger}>
      <PlanHead view={props} />
      <div className={styles.sheet}>
        <section className={styles.row} aria-label="Leader">
          <span className={styles.label}>
            Leader
            {plan.leaderIds.length ? (
              <RevealToggle
                className={styles.labelReveal}
                plan={plan}
                part={disclosure.leader}
                name={plan.leaderIds.length > 1 ? 'your leaders' : 'your leader'}
                disabled={locks.revealLocked}
                onDisclose={onDisclose}
              />
            ) : null}
          </span>
          <div className={styles.strip}>
            <SortableRow items={leadersOf(pieces)} disabled={!canAct} className={styles.tiles} onMove={onReorder}>
              {(piece) => (
                <PieceTile
                  piece={piece}
                  selected={plan.leaderIds.includes(piece.id)}
                  disabled={locks.leaderLocked}
                  onToggle={() => onEdit(toggleLeader(plan, piece.id, order))}
                />
              )}
            </SortableRow>
          </div>
        </section>
        <section className={styles.row} aria-label="Cards">
          <span className={styles.label}>Cards</span>
          <div className={styles.strip}>
            <SortableRow items={cards} disabled={!canAct} className={styles.tiles} onMove={onReorder}>
              {(piece) => (
                <PieceTile
                  piece={piece}
                  width={38}
                  selected={plan.cardIds.includes(piece.id)}
                  disabled={locks.cardLocked(piece.id)}
                  onToggle={() => onEdit(toggleCard(plan, piece.id, order))}
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
              )}
            </SortableRow>
            {cards.length ? null : <span className={styles.empty}>No cards in hand</span>}
          </div>
        </section>
        <section className={styles.dial} aria-label="Dial">
          <RevealToggle
            className={styles.dialReveal}
            plan={plan}
            part={disclosure.dial}
            name="your dial"
            disabled={locks.revealLocked}
            onDisclose={onDisclose}
          />
          <DialGrid label="Troops and spice">
            <DialRows {...props} disabled={locks.dialLocked} />
          </DialGrid>
        </section>
      </div>
    </div>
  );
}

/**
 * The dial's rows.
 * Max: each troop type's count, then the spice that supports as many of them as it reaches.
 * Custom: each troop type's plain and spiced counts.
 * A faction that dials for free has no spice row.
 */
function DialRows(props: BattlePlanViewProps & { disabled: boolean }) {
  const { plan, balance, onEdit, disabled } = props;
  const faces = capableFaces(plan);
  /* A faction with one troop type has just its troops to name. */
  const named = (face: BattleFace) => (faces.length === 1 ? 'Troops' : face.name);
  if (plan.mode === 'custom') {
    return faces.map((face) => {
      const own = troopsOf(plan, face.id);
      const limit = troopLimitOf(props, face.id);
      return (
        <Fragment key={face.id}>
          <DialRow
            label={<TroopLabel face={face} wheelArt={props.wheelArt} />}
            sub="plain"
            name={`${named(face)} plain`}
            value={own.undialed}
            max={limit - own.dialed}
            disabled={disabled}
            onChange={(undialed) => onEdit({ troops: withTroops(plan, face.id, { undialed }) })}
          />
          <DialRow
            sub="spiced"
            name={`${named(face)} spiced`}
            value={own.dialed}
            max={Math.min(limit - own.undialed, supportedMax(plan, face, balance) ?? limit)}
            disabled={disabled}
            onChange={(dialed) => onEdit({ troops: withTroops(plan, face.id, { dialed }) })}
            spice
          />
        </Fragment>
      );
    });
  }
  return (
    <>
      {faces.map((face) => (
        <DialRow
          key={face.id}
          label={<TroopLabel face={face} wheelArt={props.wheelArt} />}
          name={named(face)}
          value={totalOf(plan, face.id)}
          max={troopLimitOf(props, face.id)}
          disabled={disabled}
          onChange={(total) => onEdit(setTotal(plan, face.id, total))}
        />
      ))}
      {spiceMatters(plan) ? (
        <DialRow
          label={<TopicIcon topic="spice" size={18} className={styles.spiceIcon} />}
          sub={
            <Tooltip label="Support every troop, as far as your spice goes" withArrow>
              <UnstyledButton
                className={styles.quick}
                disabled={disabled || plan.spice === fullSupport(plan, balance)}
                onClick={() => onEdit({ spice: fullSupport(plan, balance) })}
              >
                All
              </UnstyledButton>
            </Tooltip>
          }
          name="Spice"
          value={plan.spice}
          max={supportableSpice(plan, balance).at(-1) ?? 0}
          disabled={disabled}
          onChange={(wanted) => {
            const spice = snapSpice(plan, balance, wanted);
            if (spice !== plan.spice) {
              onEdit({ spice });
            }
          }}
          spice
        />
      ) : null}
    </>
  );
}
