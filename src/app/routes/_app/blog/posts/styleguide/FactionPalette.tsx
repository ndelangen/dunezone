import { Token } from '@game/assets/faction/token/Token';
import { factionTokenFixtures } from '@game/fixtures/factionTokens';

import { fill, hexes, luminance, textOn } from './colour';
import type { Colour } from './colour';
import styles from './FactionPalette.module.css';

const FACTIONS = [
  ['Atreides', 'atreides'],
  ['Harkonnen', 'harkonnen'],
  ['Emperor', 'emperor'],
  ['Fremen', 'fremen'],
  ['Spacing Guild', 'guild'],
  ['Bene Gesserit', 'beneGesserit'],
  ['Ixians', 'ixian'],
  ['Bene Tleilaxu', 'beneTleilaxu'],
  ['CHOAM', 'choam'],
  ['Richese', 'richese'],
  ['Ecaz', 'ecaz'],
  ['Moritani', 'moritani'],
] as const satisfies readonly (readonly [string, keyof typeof factionTokenFixtures])[];

/** The lighter of a faction's two colours, so each swatch can be named by its role rather than its position. */
function roles(colours: readonly Colour[]): string[] {
  const light = colours.map((colour) => Math.max(...hexes(colour).map(luminance)));
  const lighter = light.indexOf(Math.max(...light));
  return colours.map((_, index) => (index === lighter ? 'Light' : 'Shade'));
}

/** Each faction as a swatch card: its token, its two colours as named swatches with their hexes, and the texture they are mixed through. */
export function FactionPalette() {
  return (
    <ul className={styles.grid}>
      {FACTIONS.map(([name, key]) => {
        const token = factionTokenFixtures[key];
        const { background } = token;
        const texture = background.image.match(/(\d+)\.jpg$/)?.[1];
        const role = roles(background.colors);
        return (
          <li key={key} className={styles.card}>
            <div className={styles.head}>
              <div className={styles.token}>
                <Token {...token} />
              </div>
              <span className={styles.name}>{name}</span>
            </div>
            <div className={styles.swatches}>
              {background.colors.map((colour, index) => {
                const parts = hexes(colour);
                return (
                  <div
                    key={index}
                    className={styles.swatch}
                    style={{ background: fill(colour), color: textOn(parts[0]) }}
                  >
                    <span className={styles.role}>{role[index]}</span>
                    {parts.map((hex, at) => (
                      <span key={hex} style={{ color: textOn(hex), textAlign: at === 0 ? 'left' : 'right' }}>
                        {hex.toUpperCase()}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
            <dl className={styles.meta}>
              <dt>Texture</dt>
              <dd>{texture}</dd>
              <dt>Inverted</dt>
              <dd>{background.invert ? 'yes' : 'no'}</dd>
              <dt>Grain</dt>
              <dd>{Math.round(background.influence * 100)}%</dd>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
