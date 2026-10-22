import { treacheryToCustomCard } from '@shared/assets/treacheryToCustomCard';
import { resolveAsset } from '@shared/media/resolveAsset';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { useId } from 'react';
import type { z } from 'zod';

import { CustomCard } from '@game/assets/card/Custom';
import { FrontDecals } from '@game/assets/card/Decals';
import { Decal } from '@game/data/objects';
import { card } from '@game/data/sizes';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

import styles from './DecalSheet.module.css';

type DecalData = z.infer<typeof Decal>;

/* The decal slot: a 439 unit square centred at 450,470 of the card, inside the 762 by 440 picture window at 70,249. */
const SLOT = { size: 439, cx: 450, cy: 470 };
const WINDOW = { x: 70, y: 249, width: 762, height: 440 };
/* The tiles stop this far inside the window, so the light bevel of the panel's frame stays out of them. */
const BEVEL = 10;

const decal = (file: string, treatment: Partial<DecalData> = {}): DecalData =>
  Decal.parse({
    id: `/vector/decal/${file}.svg`,
    muted: false,
    offset: [0, 0],
    outline: false,
    scale: 1,
    ...treatment,
  });

const TREATMENTS: readonly { name: string; spec: string; decal: DecalData }[] = [
  {
    name: 'Plain',
    spec: 'The silhouette as drawn, in black, fitted to the 439 unit slot',
    decal: decal('crysknife'),
  },
  {
    name: 'Outlined',
    spec: 'The same shape dilated by 6 units and filled cream #E3DBB3 behind it, so it lifts off the panel',
    decal: decal('crysknife', { outline: true }),
  },
  {
    name: 'Muted',
    spec: 'A flat #847954 shape drawn through a mask, behind every other decal on the card',
    decal: decal('crysknife', { muted: true }),
  },
  {
    name: 'Multicolour',
    spec: 'A second colour, tan #DED4A3, drawn into the file as part of the picture, so the renderer adds no outline',
    decal: decal('weirding-way-multicolor', { scale: 1.7922 }),
  },
];

/**
 * One decal drawn by the card renderer's own `FrontDecals`, in the card's whole picture window, over the gold panel the card shows behind it.
 * The inner svg is card-sized, so the muted decal's mask region (a share of the viewport) covers the whole slot.
 */
function Treatment({ decal: data }: { decal: DecalData }) {
  const prefix = useId();
  return (
    <svg
      className={styles.tile}
      viewBox={`${WINDOW.x + BEVEL} ${WINDOW.y + BEVEL} ${WINDOW.width - 2 * BEVEL} ${WINDOW.height - 2 * BEVEL}`}
      aria-hidden
    >
      <image href={resolveAsset('/image/card/front-decal-bg.jpg', 'large')} width={card.width} height={card.height} />
      <svg width={card.width} height={card.height} overflow="hidden">
        <FrontDecals prefix={`${prefix}_`} decals={[data]} />
      </svg>
    </svg>
  );
}

/* 24 silhouettes of the printed treachery cards, by file name; the count fills every row of the grid. */
const LIBRARY = [
  'baliset',
  'chaumas',
  'cheap-hero',
  'cheap-heroine',
  'crysknife',
  'ellaca',
  'flagella',
  'gom-jabbar',
  'hunter-seeker',
  'injection',
  'lasgun',
  'maula-pistol',
  'mercenaries',
  'poison-blade',
  'poison-tooth',
  'shai-hulud',
  'shield',
  'slip-tip',
  'snooper',
  'stunner',
  'supplies',
  'thumper',
  'truth-trance',
  'weather-control',
] as const;

const title = (file: string) => file.replace(/-/g, ' ').replace(/^./, (first) => first.toUpperCase());

/** The four treatments of one decal, then every printed silhouette in ink on parchment. */
export function DecalSheet() {
  const parchment = { backgroundImage: `url(${resolveAsset('/image/background/card.jpg', 'small')})` };
  return (
    <div className={styles.sheet}>
      <ol className={styles.treatments}>
        {TREATMENTS.map(({ name, spec, decal: data }) => (
          <li key={name} className={styles.treatment}>
            <Treatment decal={data} />
            <span className={styles.treatmentName}>{name}</span>
            <span className={styles.treatmentSpec}>{spec}</span>
          </li>
        ))}
      </ol>
      <ul className={styles.library} style={parchment}>
        {LIBRARY.map((file) => (
          <li key={file} className={styles.ink}>
            <svg viewBox="0 0 100 100" aria-hidden>
              <use href={`/vector/decal/${file}.svg#root`} x={6} y={6} width={88} height={88} fill="#0b0503" />
            </svg>
            <span>{title(file)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A treachery card as the faction pages draw it, with the icon settings the fixtures leave out. */
function treachery(key: keyof typeof treacheryCardFixtures) {
  return treacheryToCustomCard({
    ...treacheryCardFixtures[key],
    about: '',
    iconScale: 1,
    iconOffset: [0, 0],
    iconInvert: false,
    iconOpacity: 1,
  });
}

const STACKS = ['lasgun', 'noSnooper'] as const;

const treatmentOf = (data: DecalData) => (data.muted ? 'muted' : data.outline ? 'outlined' : 'plain');

/** Two cards that stack decals, with the picture window and the decal slot drawn over them and each layer read off the card's data. */
export function DecalStack() {
  return (
    <div className={styles.stacksFrame}>
      <div className={styles.stacks}>
        {STACKS.map((key) => {
          const fixture = treacheryCardFixtures[key];
          return (
            <div key={key} className={styles.stack}>
              <div className={styles.cardMount}>
                <CanvasScale canvasWidth={card.width} canvasHeight={card.height} frameClassName={styles.frame}>
                  <CustomCard {...treachery(key)} />
                </CanvasScale>
                <svg className={styles.guides} viewBox={`0 0 ${card.width} ${card.height}`} aria-hidden>
                  <rect
                    {...WINDOW}
                    fill="none"
                    stroke="#e3dbb3"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    vectorEffect="non-scaling-stroke"
                  />
                  <rect
                    x={SLOT.cx - SLOT.size / 2}
                    y={SLOT.cy - SLOT.size / 2}
                    width={SLOT.size}
                    height={SLOT.size}
                    fill="none"
                    stroke="#ff4d2e"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>
              <div className={styles.layers}>
                <span className={styles.cardName}>{fixture.name}</span>
                <ol className={styles.layerList}>
                  {fixture.decals.map((data, index) => (
                    <li key={`${data.id}-${index}`}>
                      <span className={styles.layerFile}>{data.id.slice(data.id.lastIndexOf('/') + 1)}</span>
                      <span className={styles.layerSpec}>
                        {treatmentOf(data)}, scale {data.scale}, offset {data.offset[0]},{data.offset[1]}
                      </span>
                    </li>
                  ))}
                </ol>
                <span className={styles.legendNote}>
                  <span className={styles.windowKey} /> picture window 762 by 440 at 70,249
                  <br />
                  <span className={styles.slotKey} /> decal slot 439 square at 450,470
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
