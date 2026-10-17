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

const troops = {
  SwordBearer: {
    name: 'Sword bearer',
    image: '/vector/troop/sword-bearer.svg',
    detail: 'Armoured soldier with a sword over one shoulder and a blade at the hip.',
  },
  DesertPathfinder: {
    name: 'Desert pathfinder',
    image: '/vector/troop/desert-pathfinder.svg',
    detail: 'Hook staff, wrapped hood, low stalking stance.',
  },
  HouseBulwark: {
    name: 'House bulwark',
    image: '/vector/troop/house-bulwark.svg',
    detail: 'Faceted shield, baton, planted armored stance.',
  },
  CourtDuelist: {
    name: 'Court duelist',
    image: '/vector/troop/court-duelist.svg',
    detail: 'Broad blade, parrying dagger, sturdy fencing stance.',
  },
  SalvageWarden: {
    name: 'Salvage warden',
    image: '/vector/troop/salvage-warden.svg',
    detail: 'Shouldered salvage fork, back tank, equipment case.',
  },
  VeiledAdept: {
    name: 'Veiled adept',
    image: '/vector/troop/veiled-adept.svg',
    detail: 'Swept robes, open hand, hooked ritual blade.',
  },
  SiegeGunner: {
    name: 'Siege gunner',
    image: '/vector/troop/siege-gunner.svg',
    detail: 'Kneeling gunner, heavy cannon, looped supply hose.',
  },
  BannerMarshal: {
    name: 'Banner marshal',
    image: '/vector/troop/banner-marshal.svg',
    detail: 'Swallowtail standard, short sword, marching stance.',
  },
  WaterKeeper: {
    name: 'Water keeper',
    image: '/vector/troop/water-keeper.svg',
    detail: 'Water reservoir, looped hose, crescent staff.',
  },
  SuspensorLancer: {
    name: 'Suspensor lancer',
    image: '/vector/troop/suspensor-lancer.svg',
    detail: 'Curved suspensor harness, raised lance, hovering stance.',
  },
  MaskedSaboteur: {
    name: 'Masked saboteur',
    image: '/vector/troop/masked-saboteur.svg',
    detail: 'Demolition charge, raised detonator, deep crouch.',
  },
  CrescentExecutioner: {
    name: 'Crescent executioner',
    image: '/vector/troop/crescent-executioner.svg',
    detail: 'Heavy crescent polearm, closed hood, split tabard.',
  },
  GeneForgedBrute: {
    name: 'Gene-forged brute',
    image: '/vector/troop/gene-forged-brute.svg',
    detail: 'Oversized breaching gauntlet, hooked knife, charging stance.',
  },
  RaptorKeeper: {
    name: 'Raptor keeper',
    image: '/vector/troop/raptor-keeper.svg',
    detail: 'Spread-wing raptor, falconry gauntlet, curved knife.',
  },
  WireHunter: {
    name: 'Wire hunter',
    image: '/vector/troop/wire-hunter.svg',
    detail: 'Raised capture loop, low pistol, wide sidestep.',
  },
  VoidWalker: {
    name: 'Void walker',
    image: '/vector/troop/void-walker.svg',
    detail: 'Spherical helmet, inspection lamp, hose-fed cutter.',
  },
  SpiceDriller: {
    name: 'Spice driller',
    image: '/vector/troop/spice-driller.svg',
    detail: 'Heavy auger, equipment pack, braced working stance.',
  },
  BladeDancer: {
    name: 'Blade dancer',
    image: '/vector/troop/blade-dancer.svg',
    detail: 'Twin crescent knives, raised knee, turning stance.',
  },
  DrumHerald: {
    name: 'Drum herald',
    image: '/vector/troop/drum-herald.svg',
    detail: 'Broad barrel drum, raised mallet, marching stance.',
  },
  ShieldRammer: {
    name: 'Shield rammer',
    image: '/vector/troop/shield-rammer.svg',
    detail: 'Broad shield, shock mace, low braced stance.',
  },
  HookClimber: {
    name: 'Hook climber',
    image: '/vector/troop/hook-climber.svg',
    detail: 'Heavy climbing picks, rope loop, compact scrambling pose.',
  },
  ResonanceAdept: {
    name: 'Resonance adept',
    image: '/vector/troop/resonance-adept.svg',
    detail: 'Plain hood, tuning-fork weapon, ceremonial robes.',
  },
  NeedleSniper: {
    name: 'Needle sniper',
    image: '/vector/troop/needle-sniper.svg',
    detail: 'Long needle rifle, swept cloak, kneeling aim.',
  },
  FurnaceBearer: {
    name: 'Furnace bearer',
    image: '/vector/troop/furnace-bearer.svg',
    detail: 'Furnace pack, heat projector, heavy protective suit.',
  },
  MantisGuard: {
    name: 'Mantis guard',
    image: '/vector/troop/mantis-guard.svg',
    detail: 'Paired hooked blades, pointed pauldrons, guarded stance.',
  },
} as const satisfies Record<
  string,
  { name: string; image: ComponentProps<typeof TroopToken>['image']; detail: string }
>;

const additions = [
  troops.DesertPathfinder,
  troops.HouseBulwark,
  troops.CourtDuelist,
  troops.SalvageWarden,
  troops.VeiledAdept,
  troops.SiegeGunner,
];

const secondWave = [
  troops.BannerMarshal,
  troops.WaterKeeper,
  troops.SuspensorLancer,
  troops.MaskedSaboteur,
  troops.CrescentExecutioner,
  troops.GeneForgedBrute,
];

const thirdWave = [
  troops.RaptorKeeper,
  troops.WireHunter,
  troops.VoidWalker,
  troops.SpiceDriller,
  troops.BladeDancer,
  troops.DrumHerald,
];

const fourthWave = [
  troops.ShieldRammer,
  troops.HookClimber,
  troops.ResonanceAdept,
  troops.NeedleSniper,
  troops.FurnaceBearer,
  troops.MantisGuard,
];

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

function renderGallery(
  troops: readonly { name: string; image: ComponentProps<typeof TroopToken>['image']; detail: string }[],
  heading: string,
  description: string
) {
  return (
    <div style={{ padding: 28, background: '#eee3cd', color: '#302a23', minHeight: '100vh' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Caladea, serif', fontSize: 32, margin: '0 0 8px' }}>{heading}</h1>
        <p style={{ margin: '0 0 24px' }}>{description}</p>
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 18 }}
        >
          {troops.map(({ name, image, detail }) => (
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
  );
}

export const NewSilhouettes = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () =>
    renderGallery(
      [troops.SwordBearer, ...fourthWave, ...thirdWave, ...secondWave, ...additions],
      'Troops for new factions',
      'Twenty-five silhouettes, newest first. Below each: regular, striped, and elite tokens at 64 px.'
    ),
});

export const AtTokenSize = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ padding: 28, background: '#eee3cd', color: '#302a23', minHeight: '100vh' }}>
      <h1 style={{ fontFamily: 'Caladea, serif' }}>Small-size comparison</h1>
      <p>Existing Atreides and Fremen troops beside all twenty-five additions. Columns are 32, 48, and 72 px.</p>
      {(
        [
          { name: 'Atreides, existing', image: '/vector/troop/atreides.svg' },
          { name: 'Fremen, existing', image: '/vector/troop/fremen.svg' },
          troops.SwordBearer,
          ...fourthWave,
          ...thirdWave,
          ...secondWave,
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
