import preview from '@sb/preview';
import type { ComponentProps } from 'react';

import { TroopToken } from './Troop';

const meta = preview.meta({
  component: TroopToken,
  globals: {
    viewport: {
      value: 'disc',
    },
  },
  argTypes: {
    image: {
      control: {
        type: 'select',
      },
    },
  },
});

export const Default = meta.story({
  args: {
    background: {
      image: '/image/texture/021.jpg',
      colors: ['red', 'blue'],
      invert: true,
      definition: 0,
      influence: 0,
    },
    star: '/vector/troop_modifier/star-left-red.svg',
    hue: undefined,
    striped: false,
    image: '/vector/troop/atreides.svg',
  },
});

const additions = [
  {
    name: 'Desert pathfinder',
    image: '/vector/troop/desert-pathfinder.svg',
    detail: 'Hook staff, wrapped hood, low stalking stance.',
  },
  {
    name: 'House bulwark',
    image: '/vector/troop/house-bulwark.svg',
    detail: 'Faceted shield, baton, planted armored stance.',
  },
  {
    name: 'Court duelist',
    image: '/vector/troop/court-duelist.svg',
    detail: 'Long blade, parrying dagger, extended lunge.',
  },
  {
    name: 'Salvage warden',
    image: '/vector/troop/salvage-warden.svg',
    detail: 'Shouldered salvage fork, back tank, equipment case.',
  },
  {
    name: 'Veiled adept',
    image: '/vector/troop/veiled-adept.svg',
    detail: 'Swept robes, open hand, hooked ritual blade.',
  },
  {
    name: 'Siege gunner',
    image: '/vector/troop/siege-gunner.svg',
    detail: 'Kneeling gunner, heavy cannon, looped supply hose.',
  },
] as const satisfies readonly { name: string; image: ComponentProps<typeof TroopToken>['image']; detail: string }[];

const token = {
  background: {
    image: '/image/texture/021.jpg',
    colors: ['#253b3b', '#253b3b'],
    invert: false,
    definition: 0,
    influence: 0,
  },
  star: undefined,
  hue: undefined,
  striped: false,
} satisfies Omit<ComponentProps<typeof TroopToken>, 'image'>;

export const NewSilhouettes = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ padding: 28, background: '#eee3cd', color: '#302a23', minHeight: '100vh' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Caladea, serif', fontSize: 32, margin: '0 0 8px' }}>Troops for new factions</h1>
        <p style={{ margin: '0 0 24px' }}>Six silhouettes. Below each: regular, striped, and elite tokens at 64 px.</p>
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 18 }}
        >
          {additions.map(({ name, image, detail }) => (
            <section key={image} style={{ background: '#faf4e6', padding: 20, borderRadius: 8 }}>
              <svg
                viewBox="0 0 100 100"
                role="img"
                aria-label={name}
                style={{ width: '100%', height: 220, fill: '#302a23' }}
              >
                <use href={`${image}#root`} width="100" height="100" />
              </svg>
              <h2 style={{ fontFamily: 'Caladea, serif', fontSize: 23, margin: '16px 0 5px' }}>{name}</h2>
              <p style={{ fontSize: 14, minHeight: 40, margin: '0 0 14px' }}>{detail}</p>
              <div style={{ display: 'flex', gap: 14 }}>
                {(['regular', 'striped', 'elite'] as const).map((variant) => (
                  <div
                    key={variant}
                    aria-label={`${name}, ${variant}`}
                    style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden' }}
                  >
                    <TroopToken
                      {...token}
                      image={image}
                      striped={variant === 'striped'}
                      star={variant === 'elite' ? '/vector/troop_modifier/star-left-red.svg' : undefined}
                    />
                  </div>
                ))}
              </div>
              <a
                href={image}
                download
                style={{ display: 'inline-block', marginTop: 16, fontSize: 13, color: '#425753' }}
              >
                Download SVG
              </a>
            </section>
          ))}
        </div>
      </div>
    </div>
  ),
});

export const AtTokenSize = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ padding: 28, background: '#eee3cd', color: '#302a23', minHeight: '100vh' }}>
      <h1 style={{ fontFamily: 'Caladea, serif' }}>Small-size comparison</h1>
      <p>Existing Atreides and Fremen troops beside the six additions. Columns are 32, 48, and 72 px.</p>
      {(
        [
          { name: 'Atreides, existing', image: '/vector/troop/atreides.svg' },
          { name: 'Fremen, existing', image: '/vector/troop/fremen.svg' },
          ...additions,
        ] as const
      ).map(({ name, image }) => (
        <div key={image} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 24, marginBottom: 18 }}>
          <span style={{ width: 160 }}>{name}</span>
          {[32, 48, 72].map((size) => (
            <div key={size} style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden' }}>
              <TroopToken {...token} image={image} />
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
});

export const DesertPathfinder = meta.story({ args: { ...token, image: additions[0].image } });
export const HouseBulwark = meta.story({ args: { ...token, image: additions[1].image } });
export const CourtDuelist = meta.story({ args: { ...token, image: additions[2].image } });
export const SalvageWarden = meta.story({ args: { ...token, image: additions[3].image } });
export const VeiledAdept = meta.story({ args: { ...token, image: additions[4].image } });
export const SiegeGunner = meta.story({ args: { ...token, image: additions[5].image } });
