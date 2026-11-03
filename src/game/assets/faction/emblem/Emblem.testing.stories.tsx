import { testingPreview } from '@sb/preview';
import type { ComponentProps } from 'react';
import { expect, within } from 'storybook/test';

import { Token } from '../token/Token';

const tokenBackground = {
  image: '/image/texture/021.jpg',
  colors: ['#253b3b', '#253b3b'],
  invert: false,
  definition: 0,
  influence: 0,
} satisfies ComponentProps<typeof Token>['background'];

type Emblem = ComponentProps<typeof Token>['emblem'];

const emblems = {
  SiroccoRaptor: {
    name: 'Sirocco raptor',
    emblem: '/vector/emblem/sirocco-raptor.svg',
    detail: 'A watchful House with a swept wing and diamond tail.',
  },
  DuneJackal: {
    name: 'Dune jackal',
    emblem: '/vector/emblem/dune-jackal.svg',
    detail: 'A desert dynasty marked by a lean jackal profile.',
  },
  CrownedIbex: {
    name: 'Crowned ibex',
    emblem: '/vector/emblem/crowned-ibex.svg',
    detail: 'Cliff-world nobility beneath a crown of horns.',
  },
  ObsidianMantis: {
    name: 'Obsidian mantis',
    emblem: '/vector/emblem/obsidian-mantis.svg',
    detail: 'A disciplined order of silent hunters.',
  },
  CoilViper: {
    name: 'Coil viper',
    emblem: '/vector/emblem/coil-viper.svg',
    detail: 'A courtly serpent for patient conspirators.',
  },
  CinderPhoenix: {
    name: 'Cinder phoenix',
    emblem: '/vector/emblem/cinder-phoenix.svg',
    detail: 'A House built around fire and renewal.',
  },
  WormCrown: {
    name: 'Worm crown',
    emblem: '/vector/emblem/worm-crown.svg',
    detail: "A desert brotherhood beneath the worm's crown.",
  },
  SietchWell: {
    name: 'Sietch well',
    emblem: '/vector/emblem/sietch-well.svg',
    detail: 'A water-keeping community and its sheltered well.',
  },
  ThornBloom: {
    name: 'Thorn bloom',
    emblem: '/vector/emblem/thorn-bloom.svg',
    detail: 'An aristocratic desert flower with a thorned stem.',
  },
  TwinMoons: {
    name: 'Twin moons',
    emblem: '/vector/emblem/twin-moons.svg',
    detail: "A navigator's moons above the dunes.",
  },
  PilgrimLantern: {
    name: 'Pilgrim lantern',
    emblem: '/vector/emblem/pilgrim-lantern.svg',
    detail: 'A pilgrim order carrying a guarded flame.',
  },
  CrescentBlade: {
    name: 'Crescent blade',
    emblem: '/vector/emblem/crescent-blade.svg',
    detail: 'A dueling House with an interlocking blade crest.',
  },
  FoldspaceKnot: {
    name: 'Foldspace knot',
    emblem: '/vector/emblem/foldspace-knot.svg',
    detail: 'A navigator collective bound by a threefold knot.',
  },
  PrismEngine: {
    name: 'Prism engine',
    emblem: '/vector/emblem/prism-engine.svg',
    detail: 'A technological House with a faceted machine seal.',
  },
  OracleEye: {
    name: 'Oracle eye',
    emblem: '/vector/emblem/oracle-eye.svg',
    detail: 'A veiled order with a watchful diamond eye.',
  },
  MerchantSeal: {
    name: 'Merchant seal',
    emblem: '/vector/emblem/merchant-seal.svg',
    detail: 'A trading House balanced around a central standard.',
  },
  StormCompass: {
    name: 'Storm compass',
    emblem: '/vector/emblem/storm-compass.svg',
    detail: 'Storm guides following a fourfold wind mark.',
  },
  SaltScarab: {
    name: 'Salt scarab',
    emblem: '/vector/emblem/salt-scarab.svg',
    detail: 'A desert lineage bearing a crescent-horned scarab.',
  },
} as const satisfies Record<string, { name: string; emblem: Emblem; detail: string }>;

const meta = testingPreview.meta({
  title: 'Emblem',
  component: Token,
  args: { background: tokenBackground },
  globals: { viewport: { value: 'disc' } },
});

function Emblem({ emblem, size }: { emblem: Emblem; size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} fill="currentColor" aria-hidden="true">
      <use href={`${emblem}#root`} width="100" height="100" />
    </svg>
  );
}

/**
 * Every emblem on a token and at 32 and 48 pixels.
 * A `<use>` whose target is missing draws nothing and reports nothing, so the play fetches each file and looks for the `root` it points at.
 */
export const NewEmblems = meta.story({
  play: async ({ canvasElement }) => {
    const entries = Object.values(emblems);
    await expect(within(canvasElement).getAllByRole('article')).toHaveLength(entries.length);
    const broken = await Promise.all(
      entries.map(async ({ emblem }) => {
        const response = await fetch(emblem);
        const source = await response.text();
        return response.ok && source.includes('id="root"')
          ? null
          : `${emblem} ${response.status} ${source.slice(0, 80)}`;
      })
    );
    await expect(broken.filter(Boolean)).toEqual([]);
  },
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => (
    <main style={{ background: '#eee5d2', color: '#292c31', padding: 32, minHeight: '100vh' }}>
      <header style={{ maxWidth: 1360, margin: '0 auto 28px' }}>
        <p style={{ margin: '0 0 8px', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Houses of your own
        </p>
        <h1 style={{ fontFamily: 'Caladea, serif', fontSize: 38, margin: '0 0 12px' }}>Eighteen faction emblems</h1>
        <p style={{ margin: 0, maxWidth: 720 }}>
          Original marks for custom Houses, desert communities, and secretive orders. Each emblem inherits its colour.
          The disc below uses the existing faction token renderer.
        </p>
      </header>
      <div
        style={{
          maxWidth: 1360,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 270px), 1fr))',
          gap: 20,
        }}
      >
        {Object.values(emblems).map(({ name, emblem, detail }) => (
          <article
            key={emblem}
            aria-label={name}
            style={{ background: '#faf5e9', borderRadius: 12, overflow: 'hidden' }}
          >
            <div
              style={{ background: '#101d2d', color: '#eee7d7', height: 220, display: 'grid', placeItems: 'center' }}
            >
              <Emblem emblem={emblem} size={164} />
            </div>
            <div style={{ padding: 20 }}>
              <h2 style={{ fontFamily: 'Caladea, serif', margin: '0 0 8px', fontSize: 24 }}>{name}</h2>
              <p style={{ margin: '0 0 18px', minHeight: 44, fontSize: 14 }}>{detail}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div
                  aria-label={`${name} faction token`}
                  style={{ width: 64, height: 64, flexShrink: 0, overflow: 'hidden', borderRadius: '50%' }}
                >
                  <Token background={tokenBackground} emblem={emblem} />
                </div>
                <div aria-label={`${name} at 32 pixels`}>
                  <Emblem emblem={emblem} size={32} />
                </div>
                <div aria-label={`${name} at 48 pixels`}>
                  <Emblem emblem={emblem} size={48} />
                </div>
              </div>
              <a
                href={emblem}
                download
                style={{ display: 'inline-block', color: '#344e54', marginTop: 18, fontSize: 13 }}
              >
                Download SVG
              </a>
            </div>
          </article>
        ))}
      </div>
    </main>
  ),
});
