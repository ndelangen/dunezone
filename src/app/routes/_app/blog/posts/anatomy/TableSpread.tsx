import { Anchor } from '@mantine/core';
import { FactionRender } from '@shared/factions/schema';
import { Link } from '@tanstack/react-router';
import type { CSSProperties, ReactNode } from 'react';

import { FactionSheetPagePreview } from '@app/print/sheet/FactionSheetPagePreview';
import { AllianceCard } from '@game/assets/faction/alliance/Alliance';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Shield } from '@game/assets/faction/shield/Shield';
import { Token } from '@game/assets/faction/token/Token';
import { TraitorCard } from '@game/assets/faction/traitor/Traitor';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { card, disc, page, shield } from '@game/data/sizes';

import { Scaled, SheetFrame } from './Scaled';
import { SMUGGLERS } from './smugglers';
import styles from './TableSpread.module.css';

/*
 * The post's closing picture: a community faction's whole set spread out on a table, the way it lands at the start of a game.
 * Every piece is the site's own renderer fed the Smugglers faction, so nothing here is a stored picture either.
 * Each piece has its own place and tilt in a grid, so the spread reads as laid down by hand and still reflows on a phone.
 */

const FACTION = SMUGGLERS;
const leaders = FactionRender.leaders.parse(FACTION);
const traitors = FactionRender.traitors.parse(FACTION);
const troops = FactionRender.troops.parse(FACTION);

function Placed({ area, tilt, children }: { area: string; tilt: number; children: ReactNode }) {
  return (
    <span className={styles.placed} style={{ gridArea: area, '--tilt': `${tilt}deg` } as CSSProperties}>
      {children}
    </span>
  );
}

/* Art is built when the figure renders, not when the module loads, so the media resolver sees every key a render asks for. */
export function TableSpread() {
  const troop = troops[0];
  return (
    <figure className={styles.root}>
      <div className={styles.table}>
        <Placed area="sheet" tilt={-3}>
          <Scaled size={page} scale={2.6}>
            <SheetFrame>
              <FactionSheetPagePreview faction={FACTION} pageNumber={1} />
            </SheetFrame>
          </Scaled>
        </Placed>
        <Placed area="shield" tilt={1.5}>
          <Scaled size={shield} scale={1.3}>
            <Shield {...FactionRender.shield.parse(FACTION)} />
          </Scaled>
        </Placed>
        <Placed area="leaders" tilt={0}>
          <span className={styles.leaders}>
            {leaders.map((leader, index) => (
              <span key={leader.name} className={styles.leader} style={{ '--index': index } as CSSProperties}>
                <Scaled size={disc} scale={0.85} round>
                  <LeaderToken {...leader} />
                </Scaled>
              </span>
            ))}
          </span>
        </Placed>
        <Placed area="traitors" tilt={-6}>
          <span className={styles.fan}>
            {traitors.slice(0, 3).map((traitor) => (
              <Scaled key={traitor.name} size={card} scale={1.25}>
                <TraitorCard {...traitor} />
              </Scaled>
            ))}
          </span>
        </Placed>
        <Placed area="alliance" tilt={4}>
          <Scaled size={card} scale={1.25}>
            <AllianceCard {...FactionRender.alliance.parse(FACTION)} />
          </Scaled>
        </Placed>
        <Placed area="token" tilt={0}>
          <Scaled size={disc} scale={1.05} round>
            <Token {...FactionRender.token.parse(FACTION)} />
          </Scaled>
        </Placed>
        {troop ? (
          <Placed area="troops" tilt={0}>
            <span className={styles.troops}>
              {[0, 1, 2, 3].map((index) => (
                <Scaled key={index} size={disc} scale={0.5} round>
                  <TroopToken {...troop} />
                </Scaled>
              ))}
            </span>
          </Placed>
        ) : null}
      </div>
      <figcaption className={styles.caption}>
        <Anchor
          renderRoot={(props) => <Link {...props} to="/factions/$factionId" params={{ factionId: 'smugglers' }} />}
          inherit
        >
          Smugglers
        </Anchor>
        , a homebrew faction by Argelius, with its sheet, shield, leaders, traitors, alliance card, faction token and
        troops all drawn from the one faction.
      </figcaption>
    </figure>
  );
}
