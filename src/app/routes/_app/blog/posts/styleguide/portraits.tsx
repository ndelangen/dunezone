import { resolveAsset } from '@shared/media/resolveAsset';

import { PORTRAIT_RULES, RELEASE_STYLES } from './artStyle';
import styles from './portraits.module.css';

const portrait = (file: string) => `/image/leader/official/${file}`;

/*
 * Where each of `PORTRAIT_RULES` is pointed out on Paul Atreides, as a fraction of the square portrait, in the order the rules are written:
 * the crop at the lower edge of the circle, the pose at the eyes, the line along the jaw, the light where it comes from, the skin on the lit cheek and the clothing at the collar.
 */
const RULE_MARKS: readonly (readonly [number, number])[] = [
  [50, 95],
  [55, 36],
  [29, 55],
  [14, 14],
  [63, 49],
  [50, 73],
];

/*
 * The token's mask, as a fraction of the portrait it is cut from: a circle of radius 115 centred 131 from the top of a 230 unit square placed 16.6 down the token.
 */
const CIRCLE = { cx: 50, cy: 49.7, r: 50 };

/** One portrait with the token's circle and the midline drawn over it, numbered where each shared rule shows, beside the rules themselves. */
export function PortraitSpec() {
  return (
    <div className={styles.specFrame}>
      <div className={styles.spec}>
        <div className={styles.frame}>
          <img src={resolveAsset(portrait('paul.jpg'), 'large')} alt="Paul Atreides" loading="lazy" />
          <svg className={styles.guides} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <path
              d={`M0 0H100V100H0Z M${CIRCLE.cx - CIRCLE.r} ${CIRCLE.cy} a${CIRCLE.r} ${CIRCLE.r} 0 1 0 ${2 * CIRCLE.r} 0 a${CIRCLE.r} ${CIRCLE.r} 0 1 0 ${-2 * CIRCLE.r} 0Z`}
              fill="rgb(0 0 0 / 55%)"
              fillRule="evenodd"
            />
            <circle
              {...CIRCLE}
              fill="none"
              stroke="#e3dbb3"
              strokeWidth={1.5}
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={0}
              y1={CIRCLE.cy}
              x2={100}
              y2={CIRCLE.cy}
              stroke="#e3dbb3"
              strokeWidth={1}
              strokeDasharray="1 2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className={styles.guideLabel} style={{ top: `${CIRCLE.cy}%` }}>
            midline
          </span>
          {RULE_MARKS.map(([x, y], index) => (
            <span key={index} className={styles.marker} style={{ left: `${x}%`, top: `${y}%` }} aria-hidden>
              {index + 1}
            </span>
          ))}
        </div>
        <ol className={styles.rules} aria-label="What every portrait shares">
          {PORTRAIT_RULES.map(({ label, value }) => (
            <li key={label}>
              <span className={styles.ruleLabel}>{label}</span>
              <span className={styles.ruleValue}>{value}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* Four leaders from each release, in the order the releases are written in `RELEASE_STYLES`. */
const RELEASE_LEADERS: readonly (readonly (readonly [string, string])[])[] = [
  [
    ['paul.jpg', 'Paul Atreides'],
    ['baron.jpg', 'Baron Harkonnen'],
    ['stilgar.png', 'Stilgar'],
    ['mohiam.jpg', 'Mother Mohiam'],
  ],
  [
    ['rhombor.jpg', 'Rhombur Vernius'],
    ['ctair.png', "C'Tair Pilru"],
    ['masters.jpg', 'A Tleilaxu Master'],
    ['zoal.png', 'Zoal'],
  ],
  [
    ['lady-yalma.png', 'Lady Yalma'],
    ['frankos-aru.png', 'Frankos Aru'],
    ['lady-helena.png', 'Lady Helena'],
    ['ein-calimar.png', 'Ein Calimar'],
  ],
  [
    ['ilesa-ecaz.png', 'Ilesa Ecaz'],
    ['whitemore-bludd.png', 'Whitmore Bludd'],
    ['grieu-kronos.png', 'Grieu Kronos'],
    ['trin-kronos.png', 'Trin Kronos'],
  ],
];

/** One spec card per release: its year, name and artists, four of its leaders, and what its drawing changed. */
export function ReleaseStyles() {
  return (
    <div className={styles.releasesFrame}>
      <ol className={styles.releases}>
        {RELEASE_STYLES.map((release, index) => (
          <li key={release.year} className={styles.release}>
            <header className={styles.releaseHead}>
              <span className={styles.year}>{release.year}</span>
              <span className={styles.releaseTitle}>
                <span className={styles.releaseName}>{release.name}</span>
                <span className={styles.artists}>{release.artists}</span>
              </span>
            </header>
            <ul className={styles.leaders}>
              {RELEASE_LEADERS[index]?.map(([file, name]) => (
                <li key={file}>
                  <img src={resolveAsset(portrait(file), 'small')} alt={name} loading="lazy" />
                </li>
              ))}
            </ul>
            <dl className={styles.rows}>
              {release.rows.map(({ label, value }) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </div>
  );
}
