import preview from '@sb/preview';
import { NEXUS_HEAD } from '@shared/assets/nexusTemplate';
import { useEffect, useState } from 'react';

import { CustomCard } from './Custom';
import styles from './Homeworld.prototype.module.css';

/* Throwaway print study: three single-face Homeworld arrangements, selected with ?variant=A, B or C. */
const variants = ['A', 'B', 'C'] as const;
type Variant = (typeof variants)[number];
const labels = {
  A: 'Nexus + corner strength',
  B: 'Strength beside each threshold',
  C: 'Strength strip under the head',
};
const high =
  'When you win a battle, you may add 1 force from your reserves to the territory where the battle occurred, if you already have a force there.';
const low = 'Your first shipment each turn costs 1 extra spice. Pay this extra spice to the bank.';
const occupied = 'The occupier collects 2 spice from the bank during Spice Collection.';

function Strength({ value, label }: { value: string; label?: string }) {
  return (
    <div className={styles.strength}>
      <div className={styles.value}>
        <img src="/vector/icon/combat.svg" alt="" />
        <span>{value}</span>
      </div>
      {label && <div className={styles.strengthLabel}>{label}</div>}
    </div>
  );
}

function HomeworldMock({ variant, split = false }: { variant: Variant; split?: boolean }) {
  const highStrength = split ? '3' : '2';
  const lowStrength = split ? '1' : '2';
  return (
    <div className={`${styles.card} ${styles[`variant${variant}`]}`} data-card={variant}>
      <CustomCard
        name="Pelagos"
        subName="Homeworld"
        head={NEXUS_HEAD}
        icon={[NEXUS_HEAD, '/image/planet/04.png']}
        iconOpacity={0}
        format="plain"
        layers={[]}
      />
      <img className={styles.planet} src="/image/planet/04.png" alt="Pelagos" />
      {variant === 'C' && (
        <div className={styles.strip}>
          <Strength value={highStrength} label="High reserves" />
          <span className={styles.stripTitle}>Homeworld strength</span>
          <Strength value={lowStrength} label="Low reserves" />
        </div>
      )}
      <div className={styles.rules}>
        <section className={styles.high}>
          <div className={styles.sectionBody}>
            <h2>High reserves</h2>
            <h3>6 or more forces</h3>
            <p>{high}</p>
          </div>
          {variant === 'B' && <Strength value={highStrength} label="Strength" />}
        </section>
        <section className={styles.low}>
          <div className={styles.sectionBody}>
            <h2>Low reserves</h2>
            <h3>0 to 5 forces</h3>
            <p>{low}</p>
          </div>
          {variant === 'B' && <Strength value={lowStrength} label="Strength" />}
        </section>
        <section className={styles.occupied}>
          <h2>Occupied</h2>
          <h3>For the occupier</h3>
          <p>{occupied}</p>
        </section>
      </div>
      {variant === 'A' && (
        <div className={styles.corner} data-split={split}>
          {split ? (
            <>
              <Strength value={highStrength} label="High strength" />
              <Strength value={lowStrength} label="Low strength" />
            </>
          ) : (
            <Strength value={highStrength} label="Homeworld strength" />
          )}
        </div>
      )}
    </div>
  );
}

function Study() {
  const [variant, setVariant] = useState<Variant | 'all'>(() => {
    const value = new URLSearchParams(window.location.search).get('variant');
    return variants.includes(value as Variant) ? (value as Variant) : 'all';
  });
  const [split, setSplit] = useState(false);
  function select(next: Variant | 'all') {
    setVariant(next);
    const url = new URL(window.location.href);
    url.searchParams.set('variant', next);
    window.history.replaceState(null, '', url);
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !['ArrowLeft', 'ArrowRight'].includes(event.key) ||
        (event.target as HTMLElement).matches('input,textarea,select,[contenteditable]')
      ) {
        return;
      }
      const index = variants.indexOf(variant as Variant);
      select(variants[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3]!);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [variant]);
  return (
    <main className={styles.study}>
      <header className={styles.studyHeader}>
        <h1>Homeworld card studies</h1>
        <p>One face. Any faction. Sample homebrew rules for layout comparison.</p>
      </header>
      <div className={styles.gallery}>
        {(variant === 'all' ? variants : [variant]).map((key) => (
          <figure key={key} className={styles.figure}>
            <figcaption>
              <b>{key}</b> {labels[key]}
            </figcaption>
            <div className={styles.scaled}>
              <HomeworldMock variant={key} split={split} />
            </div>
          </figure>
        ))}
      </div>
      <footer className={styles.studyFooter}>
        Strength is the battle dial bonus and the number of native forces lost to a Lasgun / Shield explosion. Rules and
        values are illustrative.
      </footer>
      {import.meta.env.DEV && (
        <nav className={styles.switcher} aria-label="Prototype variants">
          <button
            onClick={() => select(variants[(variants.indexOf(variant as Variant) + 2) % 3]!)}
            aria-label="Previous layout"
          >
            ←
          </button>
          <select
            aria-label="Layout"
            value={variant}
            onChange={(event) => select(event.target.value as Variant | 'all')}
          >
            <option value="all">Compare all three</option>
            {variants.map((key) => (
              <option key={key} value={key}>
                {key} · {labels[key]}
              </option>
            ))}
          </select>
          <button
            onClick={() => select(variants[(variants.indexOf(variant as Variant) + 1) % 3]!)}
            aria-label="Next layout"
          >
            →
          </button>
          <label>
            <input type="checkbox" checked={split} onChange={(event) => setSplit(event.target.checked)} />
            Different strength per threshold
          </label>
        </nav>
      )}
    </main>
  );
}

const meta = preview.meta({ title: 'Homeworld prototype', parameters: { layout: 'fullscreen' } });
export const Compare = meta.story({ render: () => <Study /> });
