import { useEffect, useState } from 'react';
import type { ComponentProps, CSSProperties } from 'react';

import playFactions from '../../../src/app/routes/_app/play/product.stories.fixture/factions.json';
import cardStyles from '../../../src/game/assets/card/Card.module.css';
import { AllianceCard } from '../../../src/game/assets/faction/alliance/Alliance';
import { TraitorCard } from '../../../src/game/assets/faction/traitor/Traitor';
import { FactionRender } from '../../../src/shared/factions/schema';
import packageData from '../package.json';
import { PrototypeCardTitle } from './card-title';
import './headers.css';

export type HeaderTreatment = 'baseline' | 'A' | 'B' | 'C';
export type HeaderFixture = {
  key: string;
  label: string;
  source: string;
  regression?: boolean;
} & (
  | { kind: 'traitor'; props: ComponentProps<typeof TraitorCard> }
  | { kind: 'alliance'; props: ComponentProps<typeof AllianceCard> }
);

function gf9Faction(key: string) {
  const item = packageData.items.find((entry) => entry.kind === 'faction' && entry.key === key);
  if (!item || !('data' in item)) throw new Error(`Missing GF9 fixture ${key}`);
  return { ...item.data, name: (item.data as { name: string }).name.replace(/^GF9 /, '') };
}

const fullNames: Record<string, string> = {
  'c6c37ae9-932e-460f-826d-5b9553693b5d': 'Captain Iakin Nefud',
  '5a19b7d3-0256-4013-8478-8343a47f8a46': 'Margot Lady Fenring',
  '0c17e2fb-bb4b-5658-a1fe-a31ce1d5a793': 'Premier Ein Calimar',
};

export const headerFixtures: HeaderFixture[] = [
  ...['gf9-harkonnen', 'gf9-bene-gesserit', 'gf9-richese'].map((key): HeaderFixture => {
    const props = FactionRender.traitors
      .parse(gf9Faction(key))
      .find((leader) => Boolean(leader.memberId && fullNames[leader.memberId]));
    if (!props?.memberId) throw new Error(`Missing full-name fixture ${key}`);
    const name = fullNames[props.memberId];
    return {
      key: props.memberId,
      label: name,
      source: `content/gf9/package.json, ${key}, memberId ${props.memberId}`,
      kind: 'traitor',
      props: { ...props, name },
    };
  }),
  ...['gf9-bene-gesserit', 'gf9-spacing-guild'].map((key): HeaderFixture => {
    const props = FactionRender.alliance.parse(gf9Faction(key));
    return {
      key: `${key}-alliance`,
      label: props.title,
      source: `content/gf9/package.json, ${key}`,
      kind: 'alliance',
      props,
    };
  }),
];

// Existing Play fixtures provide independent, unprefixed examples. Read their
// component values directly because this historical fixture uses `hero`.
const fixtureBene = playFactions.find((faction) => faction.data.name === 'Bene Gesserit')!;
const fixtureMargot = FactionRender.traitors
  .parse({ ...fixtureBene.data, factionLeader: fixtureBene.data.hero })
  .find((leader) => leader.name === 'Margot Lady Fenring')!;
const fixtureHarkonnen = playFactions.find((faction) => faction.data.name === 'House Harkonnen')!;
const fixtureHarkonnenAlliance = FactionRender.alliance.parse({
  ...fixtureHarkonnen.data,
  factionLeader: fixtureHarkonnen.data.hero,
});

export const headerRegressionFixtures: HeaderFixture[] = [
  {
    key: `play-${fixtureMargot.memberId}`,
    label: 'Existing Play fixture: Margot Lady Fenring',
    source: 'src/app/routes/_app/play/product.stories.fixture/factions.json, Bene Gesserit',
    regression: true,
    kind: 'traitor',
    props: fixtureMargot,
  },
  {
    key: 'play-house-harkonnen-alliance',
    label: 'Existing Play fixture: House Harkonnen',
    source: 'src/app/routes/_app/play/product.stories.fixture/factions.json, House Harkonnen',
    regression: true,
    kind: 'alliance',
    props: fixtureHarkonnenAlliance,
  },
];

export const headerTreatments: { id: HeaderTreatment; title: string; description: string }[] = [
  { id: 'baseline', title: 'Current renderer', description: 'Full names in the existing fixed-size header.' },
  {
    id: 'A',
    title: 'A. Fit one line',
    description: 'Keep the familiar header. Measure the loaded font and fit the full name before the icon.',
  },
  {
    id: 'B',
    title: 'B. Use two lines',
    description: 'Give longer names two balanced lines. Keep the owner in the subtitle.',
  },
  {
    id: 'C',
    title: 'C. Separate name and owner',
    description: 'Put the full name above the icon, with card type and faction on their own lines.',
  },
];

type HeaderMeasurement = {
  lines: string[];
  fontSize: number;
  subtitleSize: number;
  naturalWidth: number;
  availableWidth: number;
};

function useHeaderMeasurement(name: string, subtitle: string, treatment: HeaderTreatment) {
  const [measurement, setMeasurement] = useState<HeaderMeasurement | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (treatment === 'A') {
        await document.fonts.load('bold 40px "C_Trebuchet"', subtitle);
        await document.fonts.ready;
        if (cancelled) return;
        const context = document.createElement('canvas').getContext('2d');
        if (!context) return;
        context.font = 'bold 40px "C_Trebuchet"';
        setMeasurement({
          lines: [name],
          fontSize: 60,
          subtitleSize: Math.min(40, (555 / Math.max(1, context.measureText(subtitle).width)) * 40),
          naturalWidth: 0,
          availableWidth: 560,
        });
        return;
      }
      await Promise.all([
        document.fonts.load('60px "C_Copperplate_Gothic"', name),
        document.fonts.load('bold 40px "C_Trebuchet"', subtitle),
      ]);
      await document.fonts.ready;
      if (cancelled) return;
      const context = document.createElement('canvas').getContext('2d');
      if (!context) return;
      context.font = '60px "C_Copperplate_Gothic"';
      const measure = (text: string) => {
        const metrics = context.measureText(text);
        return Math.max(metrics.width, metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight);
      };
      const naturalWidth = measure(name);
      const availableWidth = treatment === 'C' ? 710 : 560;
      let lines = [name];
      if (treatment === 'B') {
        const words = name.split(/\s+/);
        if (words.length > 1 && naturalWidth > availableWidth) {
          const candidates = words
            .slice(1)
            .map((_, index) => [words.slice(0, index + 1).join(' '), words.slice(index + 1).join(' ')]);
          lines = candidates.reduce(
            (best, candidate) =>
              Math.max(...candidate.map(measure)) < Math.max(...best.map(measure)) ? candidate : best,
            candidates[0]
          );
        }
      }
      const maximum = treatment === 'B' && lines.length > 1 ? 47 : treatment === 'C' ? 52 : 60;
      const fontSize = Math.min(maximum, ((availableWidth - 5) / Math.max(...lines.map(measure))) * 60);
      context.font = 'bold 40px "C_Trebuchet"';
      const subtitleSize = Math.min(
        treatment === 'C' ? 37 : 40,
        (555 / Math.max(1, context.measureText(subtitle).width)) * 40
      );
      setMeasurement({ lines, fontSize, subtitleSize, naturalWidth, availableWidth });
    })();
    return () => {
      cancelled = true;
    };
  }, [name, subtitle, treatment]);
  return measurement;
}

/** Native 900 by 1263 renderer. Parent can place this in its own scalable frame. */
export function HeaderCardRenderer({
  fixture,
  treatment = 'A',
}: {
  fixture: HeaderFixture;
  treatment?: HeaderTreatment;
}) {
  const name = fixture.kind === 'traitor' ? fixture.props.name : fixture.props.title;
  const owner = fixture.kind === 'traitor' ? fixture.props.owner : fixture.props.title;
  const type = fixture.kind === 'traitor' ? 'Traitor' : 'Alliance';
  const subtitle = treatment === 'C' ? owner : fixture.kind === 'traitor' ? `Traitor - ${owner}` : 'Alliance';
  const measurement = useHeaderMeasurement(name, subtitle, treatment);
  const revised = treatment !== 'baseline';
  const style = {
    '--gf9-header-font-size': `${measurement?.fontSize ?? 60}px`,
    '--gf9-header-subtitle-size': `${measurement?.subtitleSize ?? 40}px`,
  } as CSSProperties;
  return (
    <div
      className={`gf9-header-card gf9-header-card--${treatment}`}
      style={style}
      data-measured={Boolean(measurement)}
      data-fixture-id={fixture.key}
      data-name-natural-width={treatment === 'A' ? undefined : measurement?.naturalWidth.toFixed(3)}
      data-name-available-width={measurement?.availableWidth}
    >
      {fixture.kind === 'traitor' ? <TraitorCard {...fixture.props} /> : <AllianceCard {...fixture.props} />}
      {revised && measurement ? (
        <>
          <style>{`.gf9-header-card--${treatment}[data-measured="true"] > div > .${cardStyles.title}, .gf9-header-card--${treatment}[data-measured="true"] > div > .${cardStyles.subtitle} { visibility: hidden; }`}</style>
          {treatment === 'A' ? (
            <PrototypeCardTitle name={name} />
          ) : (
            <div
              className="gf9-header-name"
              data-header-name
              data-header-part="name"
              data-header-font-size={measurement.fontSize}
              data-header-right-limit={treatment === 'C' ? 805 : 655}
            >
              {measurement.lines.map((line, index) => (
                <span key={index} data-header-line>
                  {line}
                </span>
              ))}
            </div>
          )}
          {treatment === 'C' ? <div className="gf9-header-type">{type}</div> : null}
          <div className="gf9-header-subtitle" data-header-owner data-header-part="owner" data-header-right-limit="653">
            <span data-header-owner-text>{subtitle}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Complete card at exactly 63 by 88 mm; header-only crop is optional. */
export function HeaderPrintCard({
  fixture,
  treatment = 'A',
  enlargedHeader = false,
}: {
  fixture: HeaderFixture;
  treatment?: HeaderTreatment;
  enlargedHeader?: boolean;
}) {
  return (
    <div className={enlargedHeader ? 'gf9-header-enlarged-frame' : 'gf9-header-print-frame'}>
      <HeaderCardRenderer fixture={fixture} treatment={treatment} />
    </div>
  );
}

export function HeaderReview({ variant = 'A' }: { variant?: 'A' | 'B' | 'C' }) {
  const description = headerTreatments.find((treatment) => treatment.id === variant)!;
  return (
    <section className="gf9-header-review" data-header-review={variant}>
      <h2>Full names on derived cards</h2>
      <p>{description.description} The cards below retain their existing bodies, portraits and strength values.</p>
      <div className="gf9-header-review-grid">
        {[...headerFixtures, ...headerRegressionFixtures].map((fixture) => (
          <article className="gf9-header-review-example" key={fixture.key} data-header-example={fixture.key}>
            <h3>{fixture.label}</h3>
            <div className="gf9-header-comparison">
              <figure>
                <figcaption>Current renderer with full name</figcaption>
                <HeaderPrintCard fixture={fixture} treatment="baseline" />
              </figure>
              <figure>
                <figcaption>{description.title}</figcaption>
                <HeaderPrintCard fixture={fixture} treatment={variant} />
              </figure>
            </div>
            <details>
              <summary>Enlarged header</summary>
              <HeaderPrintCard fixture={fixture} treatment={variant} enlargedHeader />
            </details>
            <details className="gf9-header-provenance">
              <summary>Source and identity</summary>
              <p>{fixture.source}</p>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
