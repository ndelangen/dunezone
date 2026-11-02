import { TREACHERY_BACKGROUNDS } from '@shared/assets/treacheryStyles';
import { treacheryToCustomCard } from '@shared/assets/treacheryToCustomCard';
import { CanvasScale } from '@ui/layout/CanvasScale';
import type { ComponentProps, ReactNode } from 'react';

import { CardBack } from '@game/assets/card/Back';
import { CustomCard } from '@game/assets/card/Custom';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Shield } from '@game/assets/faction/shield/Shield';
import { backgroundPresets } from '@game/data/backgrounds';
import { card, shield } from '@game/data/sizes';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

import { textOn } from './colour';
import styles from './pieces.module.css';

type Size = { width: number; height: number };

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

/** Thufir Hawat as House Atreides draws him on dune.zone. */
const THUFIR: ComponentProps<typeof LeaderToken> = {
  background: {
    image: '/image/texture/082.jpg',
    colors: ['#393d05', '#5c5d10'],
    invert: true,
    definition: 0.5,
    influence: 1,
  },
  image: '/image/leader/official/thufir.png',
  logo: '/vector/logo/atreides.svg',
  name: 'Thufir Hawat',
  strength: '5',
};

const TREACHERY_BACK: ComponentProps<typeof CardBack> = {
  name: 'Treachery',
  background: {
    image: '/image/texture/082.jpg',
    colors: ['#44290a', '#6c4e2c'],
    invert: true,
    definition: 0.75,
    influence: 0.9728,
  },
  image: '/vector/icon/treachery.svg',
  imageOffset: [0, 10],
  imageScale: 0.95,
};

type Point = readonly [number, number];

type Callout = {
  part: string;
  /** The face the part is set in, when it is text. */
  face?: string;
  spec: string;
  /** Where the leader line starts, in the piece's own units. */
  at: Point;
  /** Where the numbered marker sits, in the piece's units; outside the piece means in the gutter beside it. */
  pin: Point;
};

type Annotated = {
  title: string;
  natural: Size;
  /** The margin beside the piece that the markers sit in, in the piece's units. */
  gutter: number;
  round?: boolean;
  callouts: readonly Callout[];
  piece: ReactNode;
};

/*
 * The anchors are read off the renderers' stylesheets: the title box at 95,73 by 560 by 86, the type line at 93,176, the symbol 125 wide at 101 from the right edge, the window at 70,249 by 762 by 440,
 * the rules text 734 wide from 89,704; the back's name on the line 250 above the bottom edge and its emblem 220 wide from 345 down; the token's strength ending at 276,186, its emblem at 129,220 and its name on an arc of radius 140.
 */
const ANATOMY: readonly Annotated[] = [
  {
    title: 'Treachery card',
    natural: card,
    gutter: 110,
    piece: <CustomCard {...treachery('lasgun')} />,
    callouts: [
      {
        part: 'Name',
        face: 'Copperplate Gothic',
        spec: '60 units high on a 900 wide card, white at 94%, one line that shrinks to fit 560 units',
        at: [125, 116],
        pin: [-55, 116],
      },
      {
        part: 'Type line',
        face: 'Trebuchet Bold',
        spec: '40 units, ink #0B0503, title case with a spaced hyphen',
        at: [125, 209],
        pin: [-55, 209],
      },
      {
        part: 'Rules text',
        face: 'Candara',
        spec: '40 units on a 734 wide column, ink #0B0503 at 94%, left aligned',
        at: [115, 760],
        pin: [-55, 760],
      },
      {
        part: 'Title band',
        spec: 'The top 200 units, the category colours over texture 082 with a soft-light shade on top',
        at: [860, 40],
        pin: [955, 40],
      },
      {
        part: 'Type symbol',
        spec: '125 unit disc, 101 from the right edge, the striped gradient inside a black ring, the icon blended over it',
        at: [800, 156],
        pin: [955, 156],
      },
      {
        part: 'Picture window',
        spec: '762 by 440 units from 70,249, cut out of the frame over the gold panel',
        at: [825, 470],
        pin: [955, 470],
      },
      {
        part: 'Frame',
        spec: 'One bitmap, parchment inside a gold rule with the black circle in the corner',
        at: [860, 1215],
        pin: [955, 1215],
      },
    ],
  },
  {
    title: 'Card back',
    natural: card,
    gutter: 110,
    piece: <CardBack {...TREACHERY_BACK} />,
    callouts: [
      {
        part: 'Border',
        spec: 'Gold rule and corner ornaments, one bitmap over the deck colour on texture 082',
        at: [860, 120],
        pin: [955, 120],
      },
      {
        part: 'Medallion',
        spec: 'A 220 unit gold disc, 345 from the top, the deck icon blended soft-light into it',
        at: [565, 455],
        pin: [955, 455],
      },
      {
        part: 'Deck name',
        face: 'Busorama',
        spec: '90 units in capitals on the line 250 above the bottom edge, gold gradient over a black shadow, shrinking to 680 wide',
        at: [655, 1013],
        pin: [955, 1013],
      },
    ],
  },
  {
    title: 'Leader token',
    natural: { width: 300, height: 300 },
    gutter: 40,
    round: true,
    piece: <LeaderToken {...THUFIR} />,
    callouts: [
      {
        part: 'Portrait',
        spec: 'A 230 unit square cut to a circle of radius 115, centred 131 from the top, with a 6.6 unit cream ring',
        at: [45, 100],
        pin: [-20, 100],
      },
      {
        part: 'Emblem',
        spec: 'The faction logo in cream, 41 units, sitting on the lower edge of the ring',
        at: [133, 240],
        pin: [-20, 240],
      },
      {
        part: 'Strength',
        face: 'Advokat Modern',
        spec: '126 units in cream, right aligned 24 from the edge, cut into the ring and the portrait',
        at: [262, 150],
        pin: [320, 150],
      },
      {
        part: 'Name',
        face: 'Copperplate Gothic',
        spec: '29 units in cream on an arc of radius 140, centred under the portrait',
        at: [212, 262],
        pin: [320, 262],
      },
    ],
  },
];

/** A piece at its own proportions with numbered markers in a gutter either side and leader lines to the parts they name. */
function AnnotatedPiece({ natural, gutter, round, callouts, piece }: Annotated) {
  const width = natural.width + 2 * gutter;
  const x = (value: number) => `${((value + gutter) / width) * 100}%`;
  const y = (value: number) => `${(value / natural.height) * 100}%`;
  return (
    <div className={styles.stage} style={{ aspectRatio: `${width} / ${natural.height}` }}>
      <div className={styles.canvas} style={{ left: x(0), width: `${(natural.width / width) * 100}%` }}>
        <CanvasScale
          canvasWidth={natural.width}
          canvasHeight={natural.height}
          frameClassName={styles.frame}
          frameStyle={round ? { borderRadius: '50%' } : undefined}
        >
          {piece}
        </CanvasScale>
      </div>
      <svg className={styles.lines} viewBox={`0 0 ${width} ${natural.height}`} aria-hidden>
        {callouts.map(({ part, at, pin }) => (
          <g key={part}>
            <line
              x1={at[0] + gutter}
              y1={at[1]}
              x2={pin[0] + gutter}
              y2={pin[1]}
              stroke="currentColor"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={at[0] + gutter} cy={at[1]} r={natural.width / 90} fill="currentColor" />
          </g>
        ))}
      </svg>
      {callouts.map(({ part, pin }, index) => (
        <span key={part} className={styles.marker} style={{ left: x(pin[0]), top: y(pin[1]) }} aria-hidden>
          {index + 1}
        </span>
      ))}
    </div>
  );
}

/** The three text-bearing pieces, each with its parts numbered and specified: the face, the size in the renderer's units, the colour and the alignment. */
export function CardAnatomy() {
  return (
    <div className={styles.anatomy}>
      {ANATOMY.map((entry) => (
        <section key={entry.title} className={styles.entry}>
          <AnnotatedPiece {...entry} />
          <ol className={styles.legend} aria-label={entry.title}>
            {entry.callouts.map(({ part, face, spec }) => (
              <li key={part}>
                <span className={styles.part}>{part}</span>
                {face ? <span className={styles.face}>{face}</span> : null}
                <span className={styles.spec}>{spec}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

const GOLD = ['#FAF8EB', '#CFAF45'] as const;

/** The Atreides shield, and the gold gradient its name and the card backs' words are filled with, set large in both faces. */
export function GoldLettering() {
  return (
    <div className={styles.gold}>
      <div className={styles.shieldMount}>
        <CanvasScale canvasWidth={shield.width} canvasHeight={shield.height} frameClassName={styles.frame}>
          <Shield
            background={backgroundPresets.atreides}
            leader={{ name: 'Paul Atreides', image: '/image/leader/official/paul.jpg' }}
            logo="/vector/logo/atreides.svg"
            name="Atreides"
          />
        </CanvasScale>
      </div>
      <div className={styles.goldPanel}>
        <div className={styles.ramp} style={{ background: `linear-gradient(to bottom, ${GOLD[0]}, ${GOLD[1]})` }}>
          <span>{GOLD[0]}</span>
          <span>{GOLD[1]}</span>
        </div>
        <div className={styles.goldSamples}>
          <p className={styles.goldWord} style={{ fontFamily: '"C_Desdemona"' }}>
            Atreides
          </p>
          <p className={styles.goldWord} style={{ fontFamily: '"C_Busorama"' }}>
            Treachery
          </p>
        </div>
        <p className={styles.goldNote}>
          Top to bottom, pale to gold, over a black drop shadow, with a four unit shade along the lower edge of every
          letter. Desdemona on the shield at 65 units of 1608; Busorama on the card back at 90 of 900.
        </p>
      </div>
    </div>
  );
}

const CATEGORIES = [
  ['Weapon', 'lasgun', TREACHERY_BACKGROUNDS.weapon, TREACHERY_BACKGROUNDS.stripedWeapon],
  ['Defence', 'shield', TREACHERY_BACKGROUNDS.defense, TREACHERY_BACKGROUNDS.stripedDefense],
  ['Special', 'karama', TREACHERY_BACKGROUNDS.special, TREACHERY_BACKGROUNDS.stripedSpecial],
  ['Worthless', 'baliset', TREACHERY_BACKGROUNDS.worthless, TREACHERY_BACKGROUNDS.stripedWorthless],
] as const;

const INKS = [
  ['Rules ink', '#0B0503', '#0B0503'],
  ['Title', '#FFFFFF at 94%', 'rgb(255 255 255 / 94%)'],
  ['Cream', '#E3DBB3', '#E3DBB3'],
  ['Gold', `${GOLD[0]} to ${GOLD[1]}`, `linear-gradient(to bottom, ${GOLD[0]}, ${GOLD[1]})`],
] as const;

/** One card per treachery category as a colour strip: the two band colours and the stripes of its symbol, then the inks every card shares. */
export function CardColours() {
  return (
    <div className={styles.strips}>
      {CATEGORIES.map(([label, key, head, striped]) => {
        const stripes = striped.colors[0].stops.map(([hex]) => hex);
        return (
          <div key={key} className={styles.strip}>
            <div className={styles.thumb}>
              <CanvasScale canvasWidth={card.width} canvasHeight={card.height} frameClassName={styles.frame}>
                <CustomCard {...treachery(key)} />
              </CanvasScale>
            </div>
            <span className={styles.stripLabel}>{label}</span>
            <div className={styles.band}>
              <span className={styles.bandName} style={{ color: textOn(head.colors[0]) }}>
                Title band
              </span>
              {head.colors.map((hex) => (
                <span key={hex} className={styles.swatch} style={{ background: hex, color: textOn(hex) }}>
                  {hex}
                </span>
              ))}
            </div>
            <div
              className={`${styles.band} ${styles.stripes}`}
              style={{ background: `linear-gradient(to right, ${stripes.join(', ')})` }}
            >
              <span className={styles.bandName} style={{ color: textOn(stripes[0]) }}>
                Symbol stripes
              </span>
              {stripes.map((hex) => (
                <span key={hex} style={{ color: textOn(hex) }}>
                  {hex}
                </span>
              ))}
            </div>
          </div>
        );
      })}
      <div className={`${styles.strip} ${styles.inks}`}>
        <span className={styles.stripLabel}>Every card</span>
        <div className={styles.band}>
          {INKS.map(([name, value, fill]) => (
            <span key={name} className={styles.swatch} style={{ background: fill, color: textOn(value) }}>
              <b>{name}</b>
              {value}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
