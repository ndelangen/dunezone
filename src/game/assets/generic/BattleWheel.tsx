import type { ComponentProps, ReactNode } from 'react';

import { TroopToken } from '../faction/troop/Troop';
import { BackgroundRenderer } from '../utils/BackgroundRenderer';
import styles from './BattleWheel.module.css';

type Props = {
  label: string;
  background: ComponentProps<typeof BackgroundRenderer>['background'];
  strength: number;
  spice: number;
  adjustment: number;
  troops: readonly {
    id: string;
    name: string;
    dialed: number;
    undialed: number;
    artwork: ComponentProps<typeof TroopToken>;
  }[];
  cards?: readonly ReactNode[];
  leader?: ReactNode;
  className?: string;
};

/** Callers own battle values and piece interactions; this renderer owns the wheel and its readouts. */
export function BattleWheel({
  label,
  background,
  strength,
  spice,
  adjustment,
  troops,
  cards = [],
  leader,
  className,
}: Props) {
  return (
    <div className={[styles.wheel, className].filter(Boolean).join(' ')} aria-label={label}>
      <div className={styles.cards}>
        {cards.map((card, index) => (
          <div
            key={index}
            className={styles.card}
            style={{
              transform: `translateX(calc(-50% + ${(index - (cards.length - 1) / 2) * 32}px)) rotate(${(index - (cards.length - 1) / 2) * 14}deg)`,
            }}
          >
            {card}
          </div>
        ))}
      </div>
      <div className={styles.wheelFace}>
        <div className={styles.wheelArtwork}>
          <BackgroundRenderer background={background} />
        </div>
        <div className={styles.strength}>{strength}</div>
        <div className={styles.troopReadout}>
          {troops.map((troop) => (
            <div className={styles.troopRow} key={troop.id}>
              <div className={styles.troop} aria-label={troop.name}>
                <TroopToken {...troop.artwork} />
              </div>
              <span>
                {troop.undialed + troop.dialed}
                <small>
                  {troop.dialed} dialed
                  <br />
                  {troop.undialed} undialed
                </small>
              </span>
            </div>
          ))}
        </div>
        <div className={styles.leaderReadout}>
          <div className={styles.spice}>
            <span className={styles.spiceIcon} aria-hidden />
            {spice}
          </div>
          <div className={styles.leader}>{leader ?? <span className={styles.noLeader}>No leader</span>}</div>
        </div>
        {!!adjustment && (
          <div className={styles.adjustment}>
            {adjustment > 0 ? '+' : ''}
            {adjustment} adjustment
          </div>
        )}
      </div>
    </div>
  );
}
