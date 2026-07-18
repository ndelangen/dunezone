import { Fragment } from 'react/jsx-runtime';

import { Fan } from '../../components/block/Fan';
import { card as cardSize } from '../../data/sizes';
import { type FactionInput, FactionRender } from '../../schema/faction';
import { AllianceCard } from '../faction/alliance/Alliance';
import { LeaderToken } from '../faction/leader/Leader';
import { FactionSheetPage1, FactionSheetPage2 } from '../faction/sheet/Sheet';
import { Shield } from '../faction/shield/Shield';
import { TraitorCard } from '../faction/traitor/Traitor';
import { TroopToken } from '../faction/troop/Troop';
import styles from './Scene.module.css';

export function Scene(input: FactionInput) {
  const leaders = FactionRender.leaders.parse(input);
  const traitors = FactionRender.traitors.parse(input);
  const troops = FactionRender.troops.parse(input);
  const shield = FactionRender.shield.parse(input);
  const sheet = FactionRender.sheet.parse(input);
  const alliance = FactionRender.alliance.parse(input);

  return (
    <div className={styles.scene}>
      <div className={styles.shield}>
        <Shield {...shield} />
      </div>

      <div className={styles.alliance}>
        <AllianceCard {...alliance} />
      </div>

      <div className={styles.traitors}>
        <Fan
          size={cardSize}
          spacing={-8}
          style={{ boxShadow: '0.5vw 0.5vw 0.5vw rgba(0, 0, 0, 0.5)', borderRadius: '1vw' }}
        >
          {traitors.reverse().map((traitor) => (
            <Fragment key={traitor.image}>
              <TraitorCard {...traitor} />
            </Fragment>
          ))}
        </Fan>
      </div>
      <div className={styles.troops}>
        {troops.map((troop, index) => (
          <div key={troop.image} className={styles.troop}>
            {new Array(input.troops[index].count).fill(0).map((_, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: meh
                key={index}
                className={styles.disc}
                style={{ top: -(index * 5.9), left: Math.random() / 3 }}
              >
                <TroopToken {...troop} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className={styles.spice}>
        {new Array(input.rules.spiceCount).fill(0).map((_, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: meh
            key={index}
            className={styles.disc}
            style={{
              top: -(index * 5),
              left: Math.random() / 3,
              width: '30px',
              height: '30px',
              background: `url('/generated/token/custom/spice.jpg') no-repeat center center`,
              backgroundSize: 'cover',
            }}
          ></div>
        ))}
      </div>
      <div className={styles.leaders}>
        {leaders.map((leader) => (
          <div key={leader.image} className={styles.leader}>
            <LeaderToken {...leader} />
          </div>
        ))}
      </div>

      <div className={styles.sheet}>
        <div className={styles.sheetpage}>
          <FactionSheetPage2 {...sheet} />
        </div>
        <div className={styles.sheetpage}>
          <FactionSheetPage1 {...sheet} />
        </div>
      </div>
    </div>
  );
}
