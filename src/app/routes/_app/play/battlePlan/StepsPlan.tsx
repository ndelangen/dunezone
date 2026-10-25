import { UnstyledButton } from '@mantine/core';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { pieceName } from '../multiplayer/HandPiece';
import { BattleLine, ModeSwitch, PieceTile, ReadyButton, RevealToggle, Stepper, StrengthSum } from './parts';
import {
  availableSpice,
  capableFaces,
  cardsOf,
  disclosure,
  formatStrength,
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
import styles from './StepsPlan.module.css';

type StepKey = 'leader' | 'cards' | 'dial';
const ORDER: readonly StepKey[] = ['leader', 'cards', 'dial'];

/**
 * Variant C, the steps: leader, cards, dial, one open at a time and the rest folded to a line that says what was chosen.
 * Each pick moves on by itself, so a plan is a click per step;
 * the troops and spice are one-click number chips.
 */
export function StepsPlan(props: BattlePlanViewProps) {
  const { plan, hand, balance, onEdit, onDisclose } = props;
  const locks = planLocks(props);
  const pieces = planPieces(plan, hand);
  const faces = capableFaces(plan);
  /* A step is done once the player chose something, "none" included. */
  const [done, setDone] = useState<ReadonlySet<StepKey>>(
    () => new Set(plan.leaderId || plan.troops.length ? ORDER : [])
  );
  const [open, setOpen] = useState<StepKey | null>(() => ORDER.find((step) => !done.has(step)) ?? null);
  const finish = (step: StepKey) => {
    const next = new Set(done).add(step);
    setDone(next);
    setOpen(ORDER.find((candidate) => !next.has(candidate)) ?? null);
  };
  const leader = pieces.find((entry) => entry.id === plan.leaderId);
  const cards = cardsOf(pieces);
  const dialSummary =
    plan.mode === 'max'
      ? `${faces.reduce((total, face) => total + totalOf(plan, face.id), 0)} troops · ${plan.spice} spice`
      : faces
          .map((face) => `${face.name} ${troopsOf(plan, face.id).undialed}+${troopsOf(plan, face.id).dialed}`)
          .join(' · ');
  const step = (key: StepKey, index: number, title: string, summary: ReactNode, body: ReactNode, extra?: ReactNode) => (
    <Step
      key={key}
      index={index}
      title={title}
      summary={summary}
      open={open === key}
      done={done.has(key)}
      locked={locks.locked}
      onOpen={() => setOpen(open === key ? null : key)}
      extra={extra}
    >
      {body}
    </Step>
  );
  return (
    <div className={styles.steps}>
      <BattleLine territory={props.territory} opponent={props.opponent} />
      <ol className={styles.list}>
        {step(
          'leader',
          1,
          'Leader',
          leader
            ? `${pieceName(leader)}${props.leaderStrength?.[leader.id] !== undefined ? ` · ${props.leaderStrength[leader.id]}` : ''}`
            : done.has('leader')
              ? 'No leader'
              : null,
          <div className={styles.choices}>
            {leadersOf(pieces).map((entry) => (
              <PieceTile
                key={entry.id}
                piece={entry}
                selected={plan.leaderId === entry.id}
                disabled={locks.leaderLocked}
                onToggle={() => {
                  onEdit(toggleLeader(plan, entry.id));
                  if (plan.leaderId !== entry.id) {
                    finish('leader');
                  }
                }}
              />
            ))}
            <UnstyledButton
              className={styles.none}
              disabled={locks.leaderLocked}
              onClick={() => {
                onEdit({ leaderId: null });
                finish('leader');
              }}
            >
              No leader
            </UnstyledButton>
          </div>,
          leader ? (
            <RevealToggle
              className={styles.inlineReveal}
              plan={plan}
              part={disclosure.leader}
              name="your leader"
              disabled={locks.revealLocked}
              onDisclose={onDisclose}
            />
          ) : null
        )}
        {step(
          'cards',
          2,
          'Cards',
          plan.cardIds.length
            ? plan.cardIds
                .map((id) => pieces.find((entry) => entry.id === id))
                .filter(Boolean)
                .map((entry) => pieceName(entry!))
                .join(', ')
            : done.has('cards')
              ? 'No cards'
              : null,
          <div className={styles.choices}>
            {cards.map((entry) => (
              <PieceTile
                key={entry.id}
                piece={entry}
                width={38}
                selected={plan.cardIds.includes(entry.id)}
                disabled={locks.cardLocked(entry.id)}
                onToggle={() => onEdit(toggleCard(plan, entry.id))}
                reveal={
                  <RevealToggle
                    plan={plan}
                    part={disclosure.card(entry.id)}
                    name="this card"
                    disabled={locks.revealLocked}
                    onDisclose={onDisclose}
                  />
                }
              />
            ))}
            <UnstyledButton className={styles.next} disabled={locks.locked} onClick={() => finish('cards')}>
              {plan.cardIds.length ? 'Next' : 'No cards'}
            </UnstyledButton>
          </div>
        )}
        {step(
          'dial',
          3,
          'Dial',
          done.has('dial') || plan.troops.length ? dialSummary : null,
          <div className={styles.dial}>
            <div className={styles.dialHead}>
              <ModeSwitch mode={plan.mode} disabled={locks.dialLocked} onChange={(mode) => onEdit({ mode })} />
              <RevealToggle
                className={styles.inlineReveal}
                plan={plan}
                part={disclosure.dial}
                name="your dial"
                disabled={locks.revealLocked}
                onDisclose={onDisclose}
              />
            </div>
            {plan.mode === 'max' ? (
              <>
                {faces.map((face) => (
                  <Chips
                    key={face.id}
                    label={faces.length === 1 ? 'Troops' : face.name}
                    value={totalOf(plan, face.id)}
                    max={troopLimitOf(props, face.id)}
                    disabled={locks.dialLocked}
                    onPick={(total) => onEdit(setTotal(plan, face.id, total))}
                  />
                ))}
                <Chips
                  label="Spice"
                  value={plan.spice}
                  max={availableSpice(plan, balance)}
                  hint={fullSupport(plan, balance)}
                  disabled={locks.dialLocked}
                  onPick={(spice) => onEdit({ spice })}
                />
              </>
            ) : (
              faces.map((face) => (
                <div key={face.id} className={styles.custom}>
                  <span>{face.name}</span>
                  <Stepper
                    size="sm"
                    label={`${face.name} unsupported`}
                    value={troopsOf(plan, face.id).undialed}
                    max={troopLimitOf(props, face.id) - troopsOf(plan, face.id).dialed}
                    disabled={locks.dialLocked}
                    suffix="plain"
                    onChange={(undialed) => onEdit({ troops: withTroops(plan, face.id, { undialed }) })}
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
                    suffix="spiced"
                    onChange={(dialed) => onEdit({ troops: withTroops(plan, face.id, { dialed }) })}
                  />
                </div>
              ))
            )}
            <div className={styles.adjust}>
              <span>Adjust</span>
              <Stepper
                size="sm"
                label="Adjustment"
                value={plan.adjustment}
                min={-20}
                max={20}
                step={0.5}
                format={formatStrength}
                disabled={locks.dialLocked}
                onChange={(adjustment) => onEdit({ adjustment })}
              />
              <UnstyledButton className={styles.next} disabled={locks.locked} onClick={() => finish('dial')}>
                Done
              </UnstyledButton>
            </div>
          </div>
        )}
      </ol>
      <footer className={styles.footer}>
        <StrengthSum props={props} compact />
        <ReadyButton {...props} />
      </footer>
    </div>
  );
}

function Step({
  index,
  title,
  summary,
  open,
  done,
  locked,
  onOpen,
  extra,
  children,
}: {
  index: number;
  title: string;
  summary: ReactNode;
  open: boolean;
  done: boolean;
  locked: boolean;
  onOpen: () => void;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className={styles.step} data-open={open || undefined} data-done={done || undefined}>
      <div className={styles.stepHead}>
        <UnstyledButton className={styles.stepButton} aria-expanded={open} onClick={onOpen} disabled={locked && !done}>
          <span className={styles.badge} aria-hidden="true">
            {done ? <Check size={12} strokeWidth={3} /> : index}
          </span>
          <span className={styles.stepTitle}>{title}</span>
          {summary && !open ? <span className={styles.summary}>{summary}</span> : null}
        </UnstyledButton>
        {extra}
      </div>
      <div className={clsx(styles.body)} inert={!open}>
        <div className={styles.bodyInner}>{children}</div>
      </div>
    </li>
  );
}

/** Every count from none to the most there can be, one click each; the hinted chip is the count that supports every troop. */
function Chips({
  label,
  value,
  max,
  hint,
  disabled,
  onPick,
}: {
  label: string;
  value: number;
  max: number;
  hint?: number;
  disabled: boolean;
  onPick: (value: number) => void;
}) {
  return (
    <div className={styles.chipRow} role="radiogroup" aria-label={label}>
      <span className={styles.chipLabel}>{label}</span>
      <span className={styles.chips}>
        {Array.from({ length: max + 1 }, (_, count) => (
          <UnstyledButton
            key={count}
            role="radio"
            aria-checked={value === count}
            data-hint={hint === count && hint !== value ? true : undefined}
            className={styles.chip}
            disabled={disabled}
            onClick={() => onPick(count)}
            title={hint === count ? 'Supports every troop' : undefined}
          >
            {count}
          </UnstyledButton>
        ))}
      </span>
    </div>
  );
}
