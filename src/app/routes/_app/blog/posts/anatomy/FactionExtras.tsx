import { publishingCustomCard } from '@shared/assets/fixtures/publishingCustomCard';
import { publishingDeckCardback } from '@shared/assets/fixtures/publishingDeckCardback';
import { publishingTokenFace } from '@shared/assets/fixtures/publishingTokenFace';
import clsx from 'clsx';
import { Fragment, useRef } from 'react';

import { CardBack } from '@game/assets/card/Back';
import { CustomCard } from '@game/assets/card/Custom';
import { CustomToken } from '@game/assets/token/Custom';
import { card, disc } from '@game/data/sizes';

import styles from './FactionExtras.module.css';
import { FACTION, OUTPUTS, Scaled } from './FactionRecipe';
import { useSeen } from './useSeen';

/*
 * The figure for a faction's extras: the whole Atreides set laid out in one compact tray, and a custom deck and token bundle from the asset catalogue slotting in beside it.
 * The faction's own pieces are the same live renderers as the main figure, only smaller and without the lines, since this figure is about the set rather than how it is made.
 * The extras slide in once the figure scrolls into view, and stay put under reduced motion.
 */

const { about: _about, ...cardFace } = publishingCustomCard;

/** The set in two rows: the paper pieces first, then the shield with the tokens beside it. */
const SET_ORDER = ['sheet', 'leaderTokens', 'traitors', 'alliance', 'shield', 'troopToken', 'token'] as const;

/** The bundle's tokens: the publishing fixture's face with three different labels and symbols. */
const BUNDLE_TOKENS = [
  { ...publishingTokenFace, top: 'KARAMA', image: '/vector/icon/projectile.svg' },
  { ...publishingTokenFace, top: 'PRESCIENCE', image: '/vector/icon/ambassador.svg' },
  { ...publishingTokenFace, top: 'SPICE', image: '/vector/icon/projectile.svg' },
] as const;

export function FactionExtras() {
  const rootRef = useRef<HTMLDivElement>(null);
  const seen = useSeen(rootRef);

  return (
    <div ref={rootRef} className={clsx(styles.root, seen && styles.seen)}>
      <p className={styles.title}>{FACTION.name}: the full set</p>
      <div className={styles.tray}>
        <div className={styles.own}>
          {SET_ORDER.map((id) => (
            <Fragment key={id}>
              {OUTPUTS[id].art()}
              {id === 'alliance' && <span className={styles.rowBreak} />}
            </Fragment>
          ))}
        </div>
        <div className={styles.extras}>
          <p className={styles.extrasTitle}>+ Custom assets</p>
          <div className={styles.extrasArt}>
            <span className={styles.fan}>
              <Scaled size={card}>
                <CardBack {...publishingDeckCardback} name="Battle reference" />
              </Scaled>
              <Scaled size={card}>
                <CustomCard {...cardFace} />
              </Scaled>
            </span>
            <span className={styles.stack}>
              {BUNDLE_TOKENS.map((face) => (
                <Scaled key={face.top} size={disc} scale={0.55} round>
                  <CustomToken {...face} circle />
                </Scaled>
              ))}
            </span>
          </div>
        </div>
      </div>
      <p className={styles.caption}>
        Everything in the tray is drawn from the faction itself, except what sits in the dashed bay: that deck and those
        tokens are made on their own and linked in.
      </p>
    </div>
  );
}
