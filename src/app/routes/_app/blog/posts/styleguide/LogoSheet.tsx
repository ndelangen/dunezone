import { Tooltip } from '@mantine/core';
import { resolveAsset } from '@shared/media/resolveAsset';
import type { CSSProperties } from 'react';

import { backgroundPresets } from '@game/data/backgrounds';

import { fill } from './colour';
import styles from './LogoSheet.module.css';

const CREAM = '#e3dbb3';
const INK = '#0b0503';

const LOGOS = [
  ['Atreides', 'atreides', backgroundPresets.atreides],
  ['Harkonnen', 'harkonnen', backgroundPresets.harkonnen],
  ['Emperor', 'emperor', backgroundPresets.emperor],
  ['Fremen', 'fremen', backgroundPresets.fremen],
  ['Spacing Guild', 'guild', backgroundPresets.guild],
  ['Bene Gesserit', 'bene-gesserit', backgroundPresets.beneGesserit],
  ['Ixians', 'ixian', backgroundPresets.ixian],
  ['Bene Tleilaxu', 'bene-tleilaxu', backgroundPresets.beneTleilaxu],
  ['Richese', 'richese', backgroundPresets.richese],
  ['Ecaz', 'ecaz', backgroundPresets.ecaz],
  ['Moritani', 'moritani', backgroundPresets.moritani],
] as const;

/**
 * An emblem drawn the way the token renderer draws it: the logo's `#root` placed in a 100 unit square at 60 units, so the clear space around it is the token's.
 * `fill` is the one colour the emblem is ever printed in on that ground.
 */
function Emblem({ logo, colour, clear = 60 }: { logo: string; colour: string; clear?: number }) {
  const inset = (100 - clear) / 2;
  return (
    <svg viewBox="0 0 100 100" className={styles.emblem} aria-hidden>
      <use href={`/vector/logo/${logo}.svg#root`} x={inset} y={inset} width={clear} height={clear} fill={colour} />
    </svg>
  );
}

/**
 * A logo usage page: every faction emblem in cream on its own colour, then the same emblem as the token wears it, in cream on the dark table and in ink on parchment.
 */
export function LogoSheet() {
  const parchment = { backgroundImage: `url(${resolveAsset('/image/background/card.jpg', 'small')})` } as CSSProperties;
  return (
    <ul className={styles.sheet}>
      {LOGOS.map(([name, logo, background]) => {
        const ground = fill(background.colors[0]);
        return (
          <li key={logo} className={styles.entry}>
            <div className={styles.primary} style={{ background: ground }}>
              <Emblem logo={logo} colour={CREAM} />
            </div>
            <span className={styles.name}>{name}</span>
            <ul className={styles.variants}>
              <Tooltip label="On the token, inside the ring">
                <li className={styles.token} style={{ background: ground }}>
                  <Emblem logo={logo} colour={CREAM} />
                </li>
              </Tooltip>
              <Tooltip label="In cream on a dark ground">
                <li className={styles.dark}>
                  <Emblem logo={logo} colour={CREAM} />
                </li>
              </Tooltip>
              <Tooltip label="In ink on parchment">
                <li className={styles.paper} style={parchment}>
                  <Emblem logo={logo} colour={INK} />
                </li>
              </Tooltip>
            </ul>
            <span className={styles.file}>{logo}.svg</span>
          </li>
        );
      })}
    </ul>
  );
}
