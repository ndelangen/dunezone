import { UnstyledButton } from '@mantine/core';
import type { TablePiece } from '@shared/play/model';
import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

import { useMotionAllowed } from '@app/styles/motion';
import { BattleWheel } from '@game/assets/generic/BattleWheel';

import { WindowHero } from '../compass/windowHero';
import { PieceImage, pieceName } from '../multiplayer/HandPiece';
import { AdjustButton, BattleLine, ReadyButton, RevealToggle, StrengthSum, useBump } from './parts';
import styles from './PlanHead.module.css';
import { capableFaces, disclosure, planLocks, planPieces, toggleCard, toggleLeader } from './planView';
import type { BattlePlanViewProps } from './planView';

type Props = {
  view: BattlePlanViewProps;
  /** Drawn behind and around the wheel, such as dial rings. */
  around?: ReactNode;
  /** Attributes for the box that holds the wheel, such as a drop zone's handlers. */
  wheelBox?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, unknown>;
  /** A plan piece as the wheel holds it; by default a click takes it back into the hand. */
  renderPiece?: (piece: TablePiece) => ReactNode;
  /** Show each part's early-reveal eye beside the wheel, for windows that list no pieces of their own. */
  reveals?: boolean;
};

/**
 * The plan as the battle wheel shows it, kept in view while the rest of the window scrolls: the wheel with its leader and cards, the battle, the whole strength, and Ready.
 */
export function PlanHead({ view, around, wheelBox, renderPiece, reveals }: Props) {
  const { plan, wheelArt } = view;
  const motion = useMotionAllowed();
  const locks = planLocks(view);
  const pieces = planPieces(plan, view.hand);
  const leader = pieces.find((entry) => entry.id === plan.leaderId);
  const cards = plan.cardIds.flatMap((id) => pieces.filter((entry) => entry.id === id));
  /* A piece landing on the wheel or leaving it gives the wheel a small thunk. */
  const thunk = useBump(`${plan.leaderId}|${plan.cardIds.join()}`);
  const piece =
    renderPiece ??
    ((entry: TablePiece) => {
      const isLeader = entry.id === plan.leaderId;
      return (
        <UnstyledButton
          className={styles.piece}
          aria-label={`Take ${pieceName(entry)} back into your hand`}
          title={pieceName(entry)}
          disabled={isLeader ? locks.leaderLocked : locks.cardLocked(entry.id)}
          onClick={() => view.onEdit(isLeader ? toggleLeader(plan, entry.id) : toggleCard(plan, entry.id))}
        >
          <PieceImage piece={entry} />
        </UnstyledButton>
      );
    });
  return (
    <>
      <WindowHero>
        <div {...wheelBox} className={clsx(styles.wheelBox, wheelBox?.className)}>
          {around}
          <div className={styles.wheel} data-thunk={thunk}>
            <BattleWheel
              state="revealed"
              motion={motion}
              wordmark={false}
              label={`Your plan: troop strength ${plan.strength}, ${plan.spice} spice`}
              background={wheelArt.background}
              strength={plan.strength}
              spice={plan.spice}
              adjustment={plan.adjustment}
              troops={capableFaces(plan).flatMap((face) => {
                const troop = plan.troops.find((entry) => entry.faceId === face.id);
                const artwork = wheelArt.troops[face.id];
                return artwork
                  ? [
                      {
                        id: face.id,
                        name: face.name,
                        dialed: troop?.dialed ?? 0,
                        undialed: troop?.undialed ?? 0,
                        artwork,
                      },
                    ]
                  : [];
              })}
              cards={cards.map((card) => (
                <div key={card.id}>{piece(card)}</div>
              ))}
              leader={leader ? piece(leader) : undefined}
            />
          </div>
        </div>
      </WindowHero>
      <header className={styles.head}>
        <BattleLine territory={view.territory} opponent={view.opponent} />
        <div className={styles.sumRow}>
          <StrengthSum props={view} />
          <AdjustButton plan={plan} disabled={locks.dialLocked} onEdit={view.onEdit} />
          <span className={styles.ready}>
            <ReadyButton {...view} />
          </span>
        </div>
        {reveals ? (
          <div className={styles.reveals} aria-label="Show parts before the reveal">
            {leader ? (
              <span className={styles.revealPart}>
                <RevealToggle
                  className={styles.reveal}
                  plan={plan}
                  part={disclosure.leader}
                  name="your leader"
                  disabled={locks.revealLocked}
                  onDisclose={view.onDisclose}
                />
                Leader
              </span>
            ) : null}
            {cards.map((card) => (
              <span key={card.id} className={styles.revealPart}>
                <RevealToggle
                  className={styles.reveal}
                  plan={plan}
                  part={disclosure.card(card.id)}
                  name={pieceName(card)}
                  disabled={locks.revealLocked}
                  onDisclose={view.onDisclose}
                />
                {pieceName(card)}
              </span>
            ))}
            <span className={styles.revealPart}>
              <RevealToggle
                className={styles.reveal}
                plan={plan}
                part={disclosure.dial}
                name="your dial"
                disabled={locks.revealLocked}
                onDisclose={view.onDisclose}
              />
              Dial
            </span>
          </div>
        ) : null}
      </header>
    </>
  );
}
