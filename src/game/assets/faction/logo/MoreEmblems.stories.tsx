import preview from '@sb/preview';

import { Token } from '../token/Token';
import { emblems, EmblemGallery, SmallEmblems, tokenBackground } from './MoreEmblems.stories.fixture';

const meta = preview.meta({
  title: 'More emblems',
  component: Token,
  args: { background: tokenBackground },
  globals: { viewport: { value: 'disc' } },
});
const gallery = {
  globals: { viewport: { value: undefined } },
  parameters: { layout: 'fullscreen' },
} as const;

export const AllFifty = meta.story({
  ...gallery,
  render: () => <EmblemGallery title="Fifty more faction emblems" items={Object.values(emblems)} />,
});
export const Creatures = meta.story({
  ...gallery,
  render: () => (
    <EmblemGallery title="Creatures" items={Object.values(emblems).filter((e) => e.category === 'Creatures')} />
  ),
});
export const HouseCrests = meta.story({
  ...gallery,
  render: () => (
    <EmblemGallery title="House crests" items={Object.values(emblems).filter((e) => e.category === 'House crests')} />
  ),
});
export const DesertSymbols = meta.story({
  ...gallery,
  render: () => (
    <EmblemGallery
      title="Desert symbols"
      items={Object.values(emblems).filter((e) => e.category === 'Desert symbols')}
    />
  ),
});
export const Technology = meta.story({
  ...gallery,
  render: () => (
    <EmblemGallery title="Technology" items={Object.values(emblems).filter((e) => e.category === 'Technology')} />
  ),
});
export const Orders = meta.story({
  ...gallery,
  render: () => <EmblemGallery title="Orders" items={Object.values(emblems).filter((e) => e.category === 'Orders')} />,
});
export const AtSmallSizes = meta.story({ ...gallery, render: () => <SmallEmblems /> });
export const GlassOwl = meta.story({ args: { logo: emblems.GlassOwl.logo } });
export const SpiceFox = meta.story({ args: { logo: emblems.SpiceFox.logo } });
export const IronTortoise = meta.story({ args: { logo: emblems.IronTortoise.logo } });
export const DuneCrab = meta.story({ args: { logo: emblems.DuneCrab.logo } });
export const MoonMoth = meta.story({ args: { logo: emblems.MoonMoth.logo } });
export const HornedBat = meta.story({ args: { logo: emblems.HornedBat.logo } });
export const SabreCat = meta.story({ args: { logo: emblems.SabreCat.logo } });
export const SandRay = meta.story({ args: { logo: emblems.SandRay.logo } });
export const SunCobra = meta.story({ args: { logo: emblems.SunCobra.logo } });
export const ThornFrog = meta.story({ args: { logo: emblems.ThornFrog.logo } });
export const DesertHare = meta.story({ args: { logo: emblems.DesertHare.logo } });
export const SailFin = meta.story({ args: { logo: emblems.SailFin.logo } });
export const StoneBison = meta.story({ args: { logo: emblems.StoneBison.logo } });
export const ReedCrane = meta.story({ args: { logo: emblems.ReedCrane.logo } });
export const HoodedRaven = meta.story({ args: { logo: emblems.HoodedRaven.logo } });
export const AntlerTower = meta.story({ args: { logo: emblems.AntlerTower.logo } });
export const BrokenSpear = meta.story({ args: { logo: emblems.BrokenSpear.logo } });
export const FalconGauntlet = meta.story({ args: { logo: emblems.FalconGauntlet.logo } });
export const TripleAxe = meta.story({ args: { logo: emblems.TripleAxe.logo } });
export const ClosedHelm = meta.story({ args: { logo: emblems.ClosedHelm.logo } });
export const SunBastion = meta.story({ args: { logo: emblems.SunBastion.logo } });
export const BladeBridge = meta.story({ args: { logo: emblems.BladeBridge.logo } });
export const CrownAnvil = meta.story({ args: { logo: emblems.CrownAnvil.logo } });
export const SentinelKey = meta.story({ args: { logo: emblems.SentinelKey.logo } });
export const MountainThrone = meta.story({ args: { logo: emblems.MountainThrone.logo } });
export const DewCistern = meta.story({ args: { logo: emblems.DewCistern.logo } });
export const ThornCactus = meta.story({ args: { logo: emblems.ThornCactus.logo } });
export const SpiceChalice = meta.story({ args: { logo: emblems.SpiceChalice.logo } });
export const SaltCrystal = meta.story({ args: { logo: emblems.SaltCrystal.logo } });
export const RootReservoir = meta.story({ args: { logo: emblems.RootReservoir.logo } });
export const SunShutter = meta.story({ args: { logo: emblems.SunShutter.logo } });
export const WormHook = meta.story({ args: { logo: emblems.WormHook.logo } });
export const CaravanArch = meta.story({ args: { logo: emblems.CaravanArch.logo } });
export const WaterClasp = meta.story({ args: { logo: emblems.WaterClasp.logo } });
export const SandHourglass = meta.story({ args: { logo: emblems.SandHourglass.logo } });
export const OrbitalSpindle = meta.story({ args: { logo: emblems.OrbitalSpindle.logo } });
export const HeighlinerGate = meta.story({ args: { logo: emblems.HeighlinerGate.logo } });
export const GyroscopeSeal = meta.story({ args: { logo: emblems.GyroscopeSeal.logo } });
export const CogSun = meta.story({ args: { logo: emblems.CogSun.logo } });
export const SignalFork = meta.story({ args: { logo: emblems.SignalFork.logo } });
export const MirrorArray = meta.story({ args: { logo: emblems.MirrorArray.logo } });
export const NullVault = meta.story({ args: { logo: emblems.NullVault.logo } });
export const CarryallWing = meta.story({ args: { logo: emblems.CarryallWing.logo } });
export const SpiceRefinery = meta.story({ args: { logo: emblems.SpiceRefinery.logo } });
export const VeiledMask = meta.story({ args: { logo: emblems.VeiledMask.logo } });
export const MemoryTree = meta.story({ args: { logo: emblems.MemoryTree.logo } });
export const WhisperHand = meta.story({ args: { logo: emblems.WhisperHand.logo } });
export const TwinFlame = meta.story({ args: { logo: emblems.TwinFlame.logo } });
export const EclipseLotus = meta.story({ args: { logo: emblems.EclipseLotus.logo } });
export const OathChain = meta.story({ args: { logo: emblems.OathChain.logo } });
