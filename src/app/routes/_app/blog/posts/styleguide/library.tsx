import { Tooltip } from '@mantine/core';
import { TREACHERY_BACKGROUNDS } from '@shared/assets/treacheryStyles';
import { resolveAsset } from '@shared/media/resolveAsset';
import type { CSSProperties } from 'react';

import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';
import { backgroundPresets } from '@game/data/backgrounds';
import type { BackgroundData } from '@game/data/backgrounds';

import styles from './library.module.css';

const portrait = (file: string) => `/image/leader/official/${file}`;

/* The textures behind each faction, and the two every card uses, each with the colouring the site lays over it. */
const TEXTURES: readonly (readonly [string, string, BackgroundData])[] = [
  ['082', 'Every title band and card back', TREACHERY_BACKGROUNDS.weapon],
  ['076', 'The striped type symbols', TREACHERY_BACKGROUNDS.stripedWeapon],
  ['015', 'Atreides', backgroundPresets.atreides],
  ['059', 'Harkonnen', backgroundPresets.harkonnen],
  ['030', 'Emperor', backgroundPresets.emperor],
  ['054', 'Fremen', backgroundPresets.fremen],
  ['007', 'Spacing Guild', backgroundPresets.guild],
  ['020', 'Bene Gesserit', backgroundPresets.beneGesserit],
  ['004', 'Ixians', backgroundPresets.ixian],
  ['031', 'Bene Tleilaxu', backgroundPresets.beneTleilaxu],
  ['075', 'CHOAM', backgroundPresets.choam],
  ['029', 'Richese', backgroundPresets.richese],
  ['044', 'Ecaz', backgroundPresets.ecaz],
  ['057', 'Moritani', backgroundPresets.moritani],
];

/** Each texture split down the middle: the greyscale photograph as stored on the left, and on the right the same photograph with its colours laid over it by the site's own mixer. */
export function TextureLibrary() {
  return (
    <ul className={styles.textures}>
      {TEXTURES.map(([number, use, background]) => (
        <li key={number} className={styles.texture}>
          <div className={styles.split}>
            <img src={resolveAsset(`/image/texture/${number}.jpg`, 'small')} alt="" loading="lazy" />
            <BackgroundRenderer className={styles.tinted} background={background} />
          </div>
          <span className={styles.label}>
            <span className={styles.number}>{number}</span>
            {use}
          </span>
        </li>
      ))}
    </ul>
  );
}

type Part = { key: string; label: string; size: readonly [number, number]; tier?: 'small' | 'large' };

const CARD_PARTS: readonly Part[] = [
  { key: '/image/background/card.jpg', label: 'Parchment', size: [753, 1050] },
  { key: '/image/card/base-full.png', label: 'Card frame', size: [900, 1263] },
  { key: '/image/card/base-decal.png', label: 'Frame with window', size: [900, 1263] },
  { key: '/image/card/front-decal-bg.jpg', label: 'Picture panel', size: [900, 1263] },
  { key: '/image/card/back-underlay.png', label: 'Back medallion', size: [1464, 2036] },
  { key: '/image/card/back-overlay.png', label: 'Back border', size: [1464, 2036] },
];

const SHIELD_PART: Part = {
  key: '/image/shield/shield-base.png',
  label: 'Shield frame',
  size: [3216, 1611],
  tier: 'large',
};

/** The bitmap parts of the cards and the shield as a parts sheet on a gridded cutting mat, each with its pixel size. */
export function FrameParts() {
  return (
    <div className={styles.mat}>
      <ul className={styles.parts}>
        {CARD_PARTS.map((part) => (
          <li key={part.key} className={styles.part}>
            <img
              src={resolveAsset(part.key, part.tier ?? 'small')}
              alt={part.label}
              loading="lazy"
              style={{ aspectRatio: `${part.size[0]} / ${part.size[1]}` }}
            />
            <PartLabel part={part} />
          </li>
        ))}
      </ul>
      <div className={`${styles.part} ${styles.shieldPart}`}>
        <img
          src={resolveAsset(SHIELD_PART.key, 'large')}
          alt={SHIELD_PART.label}
          loading="lazy"
          style={{ aspectRatio: `${SHIELD_PART.size[0]} / ${SHIELD_PART.size[1]}` }}
        />
        <PartLabel part={SHIELD_PART} />
      </div>
    </div>
  );
}

function PartLabel({ part }: { part: Part }) {
  return (
    <span className={styles.partLabel}>
      <span className={styles.partName}>{part.label}</span>
      <span className={styles.partFile}>{part.key.slice(part.key.lastIndexOf('/') + 1)}</span>
      <span className={styles.partSize}>
        {part.size[0]} x {part.size[1]} px
      </span>
    </span>
  );
}

/* Every official leader portrait on dune.zone, faction by faction in release order, with the faction's lighter colour as a ring. */
const WALL = [
  ['Atreides', '#4B4C0D', ['paul.jpg', 'dryeuh.png', 'duncan.png', 'gurney.png', 'thufir.png', 'jessica.png']],
  ['Harkonnen', '#191311', ['baron.jpg', 'beast.png', 'feyd.png', 'nafud.png', 'piter.png', 'uman.png']],
  [
    'Bene Gesserit',
    '#3A4491',
    ['alia.png', 'irulan.png', 'lady-fenring.png', 'mohiam.jpg', 'ramallo.png', 'wanna.png'],
  ],
  ['Emperor', '#A40008', ['aramsham.png', 'bashar.png', 'burseg.png', 'caid.png', 'hasimir.png', 'shadam.jpg']],
  ['Fremen', '#F6A834', ['chani.png', 'jamis.png', 'liet.jpg', 'mapes.png', 'otheym.png', 'stilgar.png']],
  [
    'Spacing Guild',
    '#D83C13',
    ['bewt.png', 'edric.jpg', 'esmar.png', 'guildrep.png', 'soo-soo-sook.png', 'staban.png'],
  ],
  ['Ixians', '#D4BE6B', ['cammar.png', 'ctair.png', 'dominic.png', 'kailea.png', 'rhombor.jpg', 'tessia.png']],
  ['Bene Tleilaxu', '#6E008F', ['blin.png', 'hidar.png', 'masters.jpg', 'wykk.png', 'zaaf.png', 'zoal.png']],
  [
    'CHOAM',
    '#EB0220',
    ['auditor.png', 'duke-verdun.png', 'frankos-aru.png', 'lady-yalma.png', 'rajiv-londine.png', 'viscount-tull.png'],
  ],
  [
    'Richese',
    '#B5B0A5',
    ['ein-calimar.png', 'flinto-kinnis.png', 'haloa-rund.png', 'lady-helena.png', 'talis-balt.png'],
  ],
  ['Ecaz', '#7F3D81', ['bindikk-narvi.png', 'ilesa-ecaz.png', 'sanya-ecaz.png', 'whitemore-bludd.png']],
  [
    'Moritani',
    '#0B4D64',
    ['grieu-kronos.png', 'hiih-resser.png', 'lupino-ord.png', 'trin-kronos.png', 'vando-terboli.png'],
  ],
] as const satisfies readonly (readonly [string, string, readonly string[]])[];

/**
 * Every portrait at once as a closing picture, each ringed in its faction's colour, with the factions named above.
 * It is a picture, not a list: nothing in it is reading text, so it can close the post the way the post tests ask.
 */
export function PortraitWall() {
  return (
    <div className={styles.wallFigure}>
      <div className={styles.key}>
        {WALL.map(([faction, ring, files]) => (
          <span key={faction} style={{ '--ring': ring } as CSSProperties}>
            {faction} <span className={styles.count}>{files.length}</span>
          </span>
        ))}
      </div>
      <div className={styles.wall}>
        {WALL.flatMap(([faction, ring, files]) =>
          files.map((file) => (
            <Tooltip key={file} label={faction}>
              <span style={{ '--ring': ring } as CSSProperties}>
                <img src={resolveAsset(portrait(file), 'small')} alt="" loading="lazy" />
              </span>
            </Tooltip>
          ))
        )}
      </div>
    </div>
  );
}
