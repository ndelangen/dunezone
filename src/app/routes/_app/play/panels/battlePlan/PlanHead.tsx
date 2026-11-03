import { Tooltip, UnstyledButton } from '@mantine/core';
import { dialsFlat } from '@shared/play/battleDialing';
import type { TablePiece } from '@shared/play/model';

import { useMotionAllowed } from '@app/styles/motion';
import { BattleWheel } from '@game/assets/generic/BattleWheel';

import { PieceImage, pieceName } from '../../multiplayer/HandPiece';
import { AdjustButton, OpponentLine, ReadyButton, StrengthSum, useBump } from './parts';
import styles from './PlanHead.module.css';
import { capableFaces, planLocks, planPieces, toggleCard, toggleLeader } from './planView';
import type { BattlePlanViewProps } from './planView';

/**
 * The plan as the battle wheel shows it, always in view at the top of the window: the strength and the opponent, the wheel with its leader and its cards peeking over the window's top edge, and Ready.
 * A click on a piece on the wheel takes it back into the hand.
 */
export function PlanHead({ view }: { view: BattlePlanViewProps }) {
  const { plan, wheelArt } = view;
  const motion = useMotionAllowed();
  const locks = planLocks(view);
  const pieces = planPieces(plan, view.hand);
  const leaders = plan.leaderIds.flatMap((id) => pieces.filter((entry) => entry.id === id));
  const cards = plan.cardIds.flatMap((id) => pieces.filter((entry) => entry.id === id));
  /* A piece landing on the wheel or leaving it gives the wheel a small thunk. */
  const thunk = useBump(`${plan.leaderIds.join()}|${plan.cardIds.join()}`);
  const piece = (entry: TablePiece) => {
    const isLeader = plan.leaderIds.includes(entry.id);
    return (
      /* The tooltip sits on a wrapper, since a disabled button takes no hover and a locked piece still says its name. */
      <Tooltip label={pieceName(entry)} withArrow>
        <span className={styles.tipTarget}>
          <UnstyledButton
            className={styles.piece}
            aria-label={`Take ${pieceName(entry)} back into your hand`}
            disabled={isLeader ? locks.leaderLocked : locks.cardLocked(entry.id)}
            onClick={() => view.onEdit(isLeader ? toggleLeader(plan, entry.id) : toggleCard(plan, entry.id))}
          >
            <PieceImage piece={entry} />
          </UnstyledButton>
        </span>
      </Tooltip>
    );
  };
  return (
    <header className={styles.head}>
      <div className={styles.side}>
        <StrengthSum
          props={view}
          adjust={<AdjustButton plan={plan} disabled={locks.dialLocked} onEdit={view.onEdit} />}
        />
        <OpponentLine opponent={view.opponent} />
      </div>
      <div className={styles.wheelSeat}>
        <div className={styles.wheel} data-thunk={thunk}>
          <BattleWheel
            state="revealed"
            motion={motion}
            wordmark={false}
            label={`Your plan: troop strength ${plan.strength}, ${plan.spice} spice`}
            background={wheelArt.background}
            strength={plan.strength}
            spice={plan.dialing === 'basic' ? undefined : plan.spice}
            support={!dialsFlat(plan.dialing)}
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
            leaders={leaders.map((leader) => (
              <div key={leader.id}>{piece(leader)}</div>
            ))}
          />
        </div>
      </div>
      <div className={styles.ready}>
        <ReadyButton {...view}>Ready</ReadyButton>
      </div>
    </header>
  );
}
