import preview from '@sb/preview';
import type { ComponentProps } from 'react';

import { Token } from '../token/Token';

type Logo = ComponentProps<typeof Token>['logo'];

const emblems = {
  SiroccoRaptor: {
    name: 'Sirocco raptor',
    logo: '/vector/logo/sirocco-raptor.svg',
    detail: 'A watchful House with a swept wing and diamond tail.',
  },
  DuneJackal: {
    name: 'Dune jackal',
    logo: '/vector/logo/dune-jackal.svg',
    detail: 'A desert dynasty marked by a lean jackal profile.',
  },
  CrownedIbex: {
    name: 'Crowned ibex',
    logo: '/vector/logo/crowned-ibex.svg',
    detail: 'Cliff-world nobility beneath a crown of horns.',
  },
  ObsidianMantis: {
    name: 'Obsidian mantis',
    logo: '/vector/logo/obsidian-mantis.svg',
    detail: 'A disciplined order of silent hunters.',
  },
  CoilViper: {
    name: 'Coil viper',
    logo: '/vector/logo/coil-viper.svg',
    detail: 'A courtly serpent for patient conspirators.',
  },
  CinderPhoenix: {
    name: 'Cinder phoenix',
    logo: '/vector/logo/cinder-phoenix.svg',
    detail: 'A House built around fire and renewal.',
  },
  WormCrown: {
    name: 'Worm crown',
    logo: '/vector/logo/worm-crown.svg',
    detail: "A desert brotherhood beneath the worm's crown.",
  },
  SietchWell: {
    name: 'Sietch well',
    logo: '/vector/logo/sietch-well.svg',
    detail: 'A water-keeping community and its sheltered well.',
  },
  ThornBloom: {
    name: 'Thorn bloom',
    logo: '/vector/logo/thorn-bloom.svg',
    detail: 'An aristocratic desert flower with a thorned stem.',
  },
  TwinMoons: {
    name: 'Twin moons',
    logo: '/vector/logo/twin-moons.svg',
    detail: "A navigator's moons above the dunes.",
  },
  PilgrimLantern: {
    name: 'Pilgrim lantern',
    logo: '/vector/logo/pilgrim-lantern.svg',
    detail: 'A pilgrim order carrying a guarded flame.',
  },
  CrescentBlade: {
    name: 'Crescent blade',
    logo: '/vector/logo/crescent-blade.svg',
    detail: 'A dueling House with an interlocking blade crest.',
  },
  FoldspaceKnot: {
    name: 'Foldspace knot',
    logo: '/vector/logo/foldspace-knot.svg',
    detail: 'A navigator collective bound by a threefold knot.',
  },
  PrismEngine: {
    name: 'Prism engine',
    logo: '/vector/logo/prism-engine.svg',
    detail: 'A technological House with a faceted machine seal.',
  },
  OracleEye: {
    name: 'Oracle eye',
    logo: '/vector/logo/oracle-eye.svg',
    detail: 'A veiled order with a watchful diamond eye.',
  },
  MerchantSeal: {
    name: 'Merchant seal',
    logo: '/vector/logo/merchant-seal.svg',
    detail: 'A trading House balanced around a central standard.',
  },
  StormCompass: {
    name: 'Storm compass',
    logo: '/vector/logo/storm-compass.svg',
    detail: 'Storm guides following a fourfold wind mark.',
  },
  SaltScarab: {
    name: 'Salt scarab',
    logo: '/vector/logo/salt-scarab.svg',
    detail: 'A desert lineage bearing a crescent-horned scarab.',
  },
} as const satisfies Record<string, { name: string; logo: Logo; detail: string }>;

const tokenBackground = {
  image: '/image/texture/021.jpg',
  colors: ['#253b3b', '#253b3b'],
  invert: false,
  definition: 0,
  influence: 0,
} satisfies ComponentProps<typeof Token>['background'];

const meta = preview.meta({
  component: Token,
  args: { background: tokenBackground },
  globals: { viewport: { value: 'disc' } },
});

function Emblem({ logo, size }: { logo: Logo; size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} fill="currentColor" aria-hidden="true">
      <use href={`${logo}#root`} width="100" height="100" />
    </svg>
  );
}

export const NewEmblems = meta.story({
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
        {Object.values(emblems).map(({ name, logo, detail }) => (
          <article key={logo} aria-label={name} style={{ background: '#faf5e9', borderRadius: 12, overflow: 'hidden' }}>
            <div
              style={{ background: '#101d2d', color: '#eee7d7', height: 220, display: 'grid', placeItems: 'center' }}
            >
              <Emblem logo={logo} size={164} />
            </div>
            <div style={{ padding: 20 }}>
              <h2 style={{ fontFamily: 'Caladea, serif', margin: '0 0 8px', fontSize: 24 }}>{name}</h2>
              <p style={{ margin: '0 0 18px', minHeight: 44, fontSize: 14 }}>{detail}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div
                  aria-label={`${name} faction token`}
                  style={{ width: 64, height: 64, flexShrink: 0, overflow: 'hidden', borderRadius: '50%' }}
                >
                  <Token background={tokenBackground} logo={logo} />
                </div>
                <div aria-label={`${name} at 32 pixels`}>
                  <Emblem logo={logo} size={32} />
                </div>
                <div aria-label={`${name} at 48 pixels`}>
                  <Emblem logo={logo} size={48} />
                </div>
              </div>
              <a
                href={logo}
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
