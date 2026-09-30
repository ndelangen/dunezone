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

export const AtSmallSizes = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => (
    <main style={{ padding: 28, background: '#eee5d2', color: '#292c31', minHeight: '100vh' }}>
      <h1 style={{ fontFamily: 'Caladea, serif', marginTop: 0 }}>Emblems at small sizes</h1>
      <p>Each mark at 24, 32, 48, and 72 pixels, in dark ink and reversed on navy.</p>
      {Object.values(emblems).map(({ name, logo }) => (
        <section
          key={logo}
          aria-label={name}
          style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 16 }}
        >
          <h2 style={{ fontSize: 14, width: 150 }}>{name}</h2>
          {['light', 'dark'].map((tone) => (
            <div
              key={tone}
              style={{
                display: 'flex',
                gap: 18,
                alignItems: 'center',
                padding: 16,
                background: tone === 'dark' ? '#101d2d' : '#faf5e9',
                color: tone === 'dark' ? '#eee7d7' : '#292c31',
              }}
            >
              {[24, 32, 48, 72].map((size) => (
                <Emblem key={size} logo={logo} size={size} />
              ))}
            </div>
          ))}
        </section>
      ))}
    </main>
  ),
});

export const SiroccoRaptor = meta.story({ args: { logo: emblems.SiroccoRaptor.logo } });
export const DuneJackal = meta.story({ args: { logo: emblems.DuneJackal.logo } });
export const CrownedIbex = meta.story({ args: { logo: emblems.CrownedIbex.logo } });
export const ObsidianMantis = meta.story({ args: { logo: emblems.ObsidianMantis.logo } });
export const CoilViper = meta.story({ args: { logo: emblems.CoilViper.logo } });
export const CinderPhoenix = meta.story({ args: { logo: emblems.CinderPhoenix.logo } });
export const WormCrown = meta.story({ args: { logo: emblems.WormCrown.logo } });
export const SietchWell = meta.story({ args: { logo: emblems.SietchWell.logo } });
export const ThornBloom = meta.story({ args: { logo: emblems.ThornBloom.logo } });
export const TwinMoons = meta.story({ args: { logo: emblems.TwinMoons.logo } });
export const PilgrimLantern = meta.story({ args: { logo: emblems.PilgrimLantern.logo } });
export const CrescentBlade = meta.story({ args: { logo: emblems.CrescentBlade.logo } });
export const FoldspaceKnot = meta.story({ args: { logo: emblems.FoldspaceKnot.logo } });
export const PrismEngine = meta.story({ args: { logo: emblems.PrismEngine.logo } });
export const OracleEye = meta.story({ args: { logo: emblems.OracleEye.logo } });
export const MerchantSeal = meta.story({ args: { logo: emblems.MerchantSeal.logo } });
export const StormCompass = meta.story({ args: { logo: emblems.StormCompass.logo } });
export const SaltScarab = meta.story({ args: { logo: emblems.SaltScarab.logo } });
