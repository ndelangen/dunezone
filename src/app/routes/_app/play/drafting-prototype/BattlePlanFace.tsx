import type { ComponentProps } from 'react';

import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';

import styles from './BattlePlanFace.module.css';

export type BattlePlanFaceProps = {
  name: string;
  background: ComponentProps<typeof BackgroundRenderer>['background'];
  troopImage: ComponentProps<typeof TroopToken>['image'];
  leader: ComponentProps<typeof LeaderToken> | null;
  strength: number;
  troops: number;
  spice: number;
  adjustment?: number;
};

/* Battle route organ: the caller supplies the plan and artwork; this renders the accepted wheel face. */
export function BattlePlanFace({
  name,
  background,
  troopImage,
  leader,
  strength,
  troops,
  spice,
  adjustment = 0,
}: BattlePlanFaceProps) {
  return (
    <div className={styles.face} aria-label={`${name} plan, troop strength ${strength}, ${spice} spice`}>
      <div className={styles.artwork}>
        <BackgroundRenderer background={background} />
      </div>
      <strong className={styles.strength}>{strength}</strong>
      <div className={styles.troops}>
        <div className={styles.troop}>
          <TroopToken image={troopImage} background={background} star={undefined} hue={undefined} striped={undefined} />
        </div>
        <span>{troops}</span>
      </div>
      <div className={styles.leaderReadout}>
        <span className={styles.spice}>
          <svg viewBox="0 0 100 100" aria-label="Spice">
            <use href="/vector/icon/spice.svg#root" width="100" height="100" fill="currentColor" />
          </svg>
          {spice}
        </span>
        <div className={styles.leader}>{leader ? <LeaderToken {...leader} /> : <span>No leader</span>}</div>
      </div>
      {adjustment ? (
        <span className={styles.adjustment}>
          {adjustment > 0 ? '+' : ''}
          {adjustment} adjustment
        </span>
      ) : null}
    </div>
  );
}
