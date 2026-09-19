import type { ComponentProps, ReactNode } from 'react';

import { Token } from '../faction/token/Token';
import { TroopToken } from '../faction/troop/Troop';
import { BackgroundRenderer } from '../utils/BackgroundRenderer';
import styles from './BattleWheel.module.css';

type Revealed = {
  state: 'revealed';
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
};

type Props = { label: string; className?: string } & (
  | Revealed
  | {
      state: 'unrevealed';
      artwork: ComponentProps<typeof Token>;
      ready: boolean;
    }
);

/** Callers own battle state and piece interactions; this renderer owns both faces and their reveal. */
export function BattleWheel(props: Props) {
  return (
    <div
      className={[styles.wheel, props.className].filter(Boolean).join(' ')}
      data-state={props.state}
      role={props.state === 'unrevealed' ? 'img' : undefined}
      aria-label={props.label}
    >
      {props.state === 'unrevealed' ? (
        <>
          <div className={styles.factionArtwork} aria-hidden="true">
            <Token {...props.artwork} />
          </div>
          <svg className={styles.readinessRing} data-ready={props.ready} viewBox="0 0 196 196" aria-hidden="true">
            <circle cx="98" cy="98" r="96" />
          </svg>
        </>
      ) : (
        <div className={styles.revealed}>
          <RevealedWheel {...props} />
        </div>
      )}
    </div>
  );
}

function RevealedWheel({ background, strength, spice, adjustment, troops, cards = [], leader }: Revealed) {
  return (
    <>
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
        <div className={styles.wheelMaterial}>
          <BackgroundRenderer
            background={{
              image: '/image/texture/004.jpg',
              colors: ['#e7dfc5', '#b9b29a'],
              influence: 0.7,
              invert: false,
              definition: 0.4,
            }}
          />
        </div>
        <div className={styles.strength}>
          <span>{strength}</span>
          <small>Force</small>
        </div>
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
          <div className={styles.leader}>
            <div className={styles.leaderPiece}>
              {leader ?? (
                <span className={styles.noLeader}>
                  <svg viewBox="0 0 100 100" aria-hidden="true">
                    <use href="/vector/decal/cheap-hero.svg#root" />
                  </svg>
                  No leader
                </span>
              )}
            </div>
          </div>
        </div>
        <svg className={styles.wordmark} viewBox="0 0 100 100" aria-hidden="true">
          <use href="/vector/decal/combatwheel-multicolor.svg#root" />
        </svg>
        {!!adjustment && (
          <div
            className={styles.adjustment}
            aria-label={`Force adjustment ${adjustment > 0 ? 'plus' : 'minus'} ${Math.abs(adjustment)}`}
          >
            <span>
              {adjustment > 0 ? '+' : ''}
              {adjustment}
            </span>
            <small>adj.</small>
          </div>
        )}
      </div>
    </>
  );
}
