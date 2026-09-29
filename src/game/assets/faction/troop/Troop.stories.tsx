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
    detail: 'Broad blade, parrying dagger, sturdy fencing stance.',
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

const secondWave = [
  {
    name: 'Banner marshal',
    image: '/vector/troop/banner-marshal.svg',
    detail: 'Swallowtail standard, short sword, marching stance.',
  },
  {
    name: 'Water keeper',
    image: '/vector/troop/water-keeper.svg',
    detail: 'Water reservoir, looped hose, crescent staff.',
  },
  {
    name: 'Suspensor lancer',
    image: '/vector/troop/suspensor-lancer.svg',
    detail: 'Curved suspensor harness, raised lance, hovering stance.',
  },
  {
    name: 'Masked saboteur',
    image: '/vector/troop/masked-saboteur.svg',
    detail: 'Demolition charge, raised detonator, deep crouch.',
  },
  {
    name: 'Crescent executioner',
    image: '/vector/troop/crescent-executioner.svg',
    detail: 'Heavy crescent polearm, closed hood, split tabard.',
  },
  {
    name: 'Gene-forged brute',
    image: '/vector/troop/gene-forged-brute.svg',
    detail: 'Oversized breaching gauntlet, hooked knife, charging stance.',
  },
] as const satisfies readonly { name: string; image: ComponentProps<typeof TroopToken>['image']; detail: string }[];

const thirdWave = [
  {
    name: 'Raptor keeper',
    image: '/vector/troop/raptor-keeper.svg',
    detail: 'Spread-wing raptor, falconry gauntlet, curved knife.',
  },
  {
    name: 'Wire hunter',
    image: '/vector/troop/wire-hunter.svg',
    detail: 'Raised capture loop, low pistol, wide sidestep.',
  },
  {
    name: 'Void walker',
    image: '/vector/troop/void-walker.svg',
    detail: 'Spherical helmet, inspection lamp, hose-fed cutter.',
  },
  {
    name: 'Spice driller',
    image: '/vector/troop/spice-driller.svg',
    detail: 'Heavy auger, equipment pack, braced working stance.',
  },
  {
    name: 'Blade dancer',
    image: '/vector/troop/blade-dancer.svg',
    detail: 'Twin crescent knives, raised knee, turning stance.',
  },
  {
    name: 'Drum herald',
    image: '/vector/troop/drum-herald.svg',
    detail: 'Broad barrel drum, raised mallet, marching stance.',
  },
] as const satisfies readonly { name: string; image: ComponentProps<typeof TroopToken>['image']; detail: string }[];

const fourthWave = [
  {
    name: 'Shield rammer',
    image: '/vector/troop/shield-rammer.svg',
    detail: 'Broad shield, shock mace, low braced stance.',
  },
  {
    name: 'Hook climber',
    image: '/vector/troop/hook-climber.svg',
    detail: 'Heavy climbing picks, rope loop, compact scrambling pose.',
  },
  {
    name: 'Resonance adept',
    image: '/vector/troop/resonance-adept.svg',
    detail: 'Plain hood, tuning-fork weapon, ceremonial robes.',
  },
  {
    name: 'Needle sniper',
    image: '/vector/troop/needle-sniper.svg',
    detail: 'Long needle rifle, swept cloak, kneeling aim.',
  },
  {
    name: 'Furnace bearer',
    image: '/vector/troop/furnace-bearer.svg',
    detail: 'Furnace pack, heat projector, heavy protective suit.',
  },
  {
    name: 'Mantis guard',
    image: '/vector/troop/mantis-guard.svg',
    detail: 'Paired hooked blades, pointed pauldrons, guarded stance.',
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
      [...fourthWave, ...thirdWave, ...secondWave, ...additions],
      'Troops for new factions',
      'Twenty-four silhouettes, newest first. Below each: regular, striped, and elite tokens at 64 px.'
    ),
});

export const SecondWave = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () =>
    renderGallery(
      secondWave,
      'Six more ways to build an army',
      'The second set. Below each: regular, striped, and elite tokens at 64 px.'
    ),
});

export const ThirdWave = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () =>
    renderGallery(
      thirdWave,
      'Specialists of the Imperium',
      'The third set. Below each: regular, striped, and elite tokens at 64 px.'
    ),
});

export const FourthWave = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () =>
    renderGallery(
      fourthWave,
      'Armour and strange weapons',
      'The fourth set. Below each: regular, striped, and elite tokens at 64 px.'
    ),
});

export const RevisedSilhouettes = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () =>
    renderGallery(
      [fourthWave[2], fourthWave[0], fourthWave[1]],
      'Three revised silhouettes',
      'A plain hood for the adept, plus new rammer and climber designs. Tokens below are 64 px.'
    ),
});

export const AtTokenSize = meta.story({
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ padding: 28, background: '#eee3cd', color: '#302a23', minHeight: '100vh' }}>
      <h1 style={{ fontFamily: 'Caladea, serif' }}>Small-size comparison</h1>
      <p>Existing Atreides and Fremen troops beside all twenty-four additions. Columns are 32, 48, and 72 px.</p>
      {(
        [
          { name: 'Atreides, existing', image: '/vector/troop/atreides.svg' },
          { name: 'Fremen, existing', image: '/vector/troop/fremen.svg' },
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

export const DesertPathfinder = meta.story({ args: { ...token, image: additions[0].image } });
export const HouseBulwark = meta.story({ args: { ...token, image: additions[1].image } });
export const CourtDuelist = meta.story({ args: { ...token, image: additions[2].image } });
export const SalvageWarden = meta.story({ args: { ...token, image: additions[3].image } });
export const VeiledAdept = meta.story({ args: { ...token, image: additions[4].image } });
export const SiegeGunner = meta.story({ args: { ...token, image: additions[5].image } });
export const BannerMarshal = meta.story({ args: { ...token, image: secondWave[0].image } });
export const WaterKeeper = meta.story({ args: { ...token, image: secondWave[1].image } });
export const SuspensorLancer = meta.story({ args: { ...token, image: secondWave[2].image } });
export const MaskedSaboteur = meta.story({ args: { ...token, image: secondWave[3].image } });
export const CrescentExecutioner = meta.story({ args: { ...token, image: secondWave[4].image } });
export const GeneForgedBrute = meta.story({ args: { ...token, image: secondWave[5].image } });
export const RaptorKeeper = meta.story({ args: { ...token, image: thirdWave[0].image } });
export const WireHunter = meta.story({ args: { ...token, image: thirdWave[1].image } });
export const VoidWalker = meta.story({ args: { ...token, image: thirdWave[2].image } });
export const SpiceDriller = meta.story({ args: { ...token, image: thirdWave[3].image } });
export const BladeDancer = meta.story({ args: { ...token, image: thirdWave[4].image } });
export const DrumHerald = meta.story({ args: { ...token, image: thirdWave[5].image } });

export const ShieldRammer = meta.story({ args: { ...token, image: fourthWave[0].image } });
export const HookClimber = meta.story({ args: { ...token, image: fourthWave[1].image } });
export const ResonanceAdept = meta.story({ args: { ...token, image: fourthWave[2].image } });
export const NeedleSniper = meta.story({ args: { ...token, image: fourthWave[3].image } });
export const FurnaceBearer = meta.story({ args: { ...token, image: fourthWave[4].image } });
export const MantisGuard = meta.story({ args: { ...token, image: fourthWave[5].image } });
