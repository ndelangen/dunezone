import { FactionRender } from '@shared/factions/schema';
import type { FactionInput } from '@shared/factions/schema';
import type { ReactNode } from 'react';

import { FactionSheetPagePreview } from '@app/print/sheet/FactionSheetPagePreview';
import { AllianceCard } from '@game/assets/faction/alliance/Alliance';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Shield } from '@game/assets/faction/shield/Shield';
import { Token } from '@game/assets/faction/token/Token';
import { TraitorCard } from '@game/assets/faction/traitor/Traitor';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { card, disc, page, shield } from '@game/data/sizes';

import styles from './outputs.module.css';
import { Scaled, SheetFrame, ShieldCutout } from './Scaled';

/*
 * The assets a faction is drawn into, each as the site's own renderer fed through `FactionRender`, so the figures draw what the site draws.
 * Art is built when a figure renders, not when the module loads, so the media resolver sees every key a render asks for.
 */

export type OutputId = 'sheet' | 'leaderTokens' | 'traitors' | 'troopToken' | 'token' | 'alliance' | 'shield';

export const OUTPUT_ORDER: readonly OutputId[] = [
  'sheet',
  'leaderTokens',
  'traitors',
  'troopToken',
  'token',
  'alliance',
  'shield',
];

export function outputsFor(faction: FactionInput): Record<OutputId, { label: string; art: () => ReactNode }> {
  const leaders = FactionRender.leaders.parse(faction);
  const traitors = FactionRender.traitors.parse(faction);
  const troop = FactionRender.troops.parse(faction)[0];
  return {
    sheet: {
      label: 'Faction sheet',
      art: () => (
        <span className={styles.pages}>
          {([1, 2] as const).map((pageNumber) => (
            <Scaled key={pageNumber} size={page} scale={1.15}>
              <SheetFrame>
                <FactionSheetPagePreview faction={faction} pageNumber={pageNumber} />
              </SheetFrame>
            </Scaled>
          ))}
        </span>
      ),
    },
    leaderTokens: {
      label: 'Leader tokens',
      art: () => (
        <span className={styles.stack}>
          {leaders.map((leader) => (
            <Scaled key={leader.name} size={disc} scale={0.75} round>
              <LeaderToken {...leader} />
            </Scaled>
          ))}
        </span>
      ),
    },
    traitors: {
      label: 'Traitor cards',
      art: () => (
        <span className={styles.fan}>
          {traitors.map((traitor) => (
            <Scaled key={traitor.name} size={card}>
              <TraitorCard {...traitor} />
            </Scaled>
          ))}
        </span>
      ),
    },
    troopToken: {
      label: 'Troop token',
      art: () =>
        troop ? (
          <Scaled size={disc} scale={0.5} round>
            <TroopToken {...troop} />
          </Scaled>
        ) : null,
    },
    token: {
      label: 'Faction token',
      art: () => (
        <Scaled size={disc} scale={1.25} round>
          <Token {...FactionRender.token.parse(faction)} />
        </Scaled>
      ),
    },
    alliance: {
      label: 'Alliance card',
      art: () => (
        <Scaled size={card}>
          <AllianceCard {...FactionRender.alliance.parse(faction)} />
        </Scaled>
      ),
    },
    shield: {
      label: 'Shield',
      art: () => (
        <Scaled size={shield}>
          <ShieldCutout>
            <Shield {...FactionRender.shield.parse(faction)} />
          </ShieldCutout>
        </Scaled>
      ),
    },
  };
}
