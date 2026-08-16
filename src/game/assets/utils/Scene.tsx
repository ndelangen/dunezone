import { FactionRender } from '@shared/factions/schema';
import type { FactionInput } from '@shared/factions/schema';
import { Fragment } from 'react/jsx-runtime';

import { Fan } from '../../components/block/Fan';
import { backgroundPresets } from '../../data/backgrounds';
import { card as cardSize } from '../../data/sizes';
import { AllianceCard } from '../faction/alliance/Alliance';
import { LeaderToken } from '../faction/leader/Leader';
import { FactionSheetPage1, FactionSheetPage2 } from '../faction/sheet/Sheet';
import { Shield } from '../faction/shield/Shield';
import { TraitorCard } from '../faction/traitor/Traitor';
import { TroopToken } from '../faction/troop/Troop';
import { CustomToken } from '../token/Custom';
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
            {Array.from({ length: input.troops[index].count }, (_, index) => (
              <div key={index} className={styles.disc} style={{ top: -(index * 5.9), left: (index % 3) / 10 }}>
                <TroopToken {...troop} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className={styles.spice}>
        {Array.from({ length: input.rules.spiceCount }, (_, index) => (
          <div
            key={index}
            className={styles.disc}
            style={{
              top: -(index * 5),
              left: (index % 3) / 10,
              width: '30px',
              height: '30px',
            }}
          >
            <CustomToken background={backgroundPresets.spiceToken} image="/vector/icon/spice.svg" circle={false} />
          </div>
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
