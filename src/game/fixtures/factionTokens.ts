import type { z } from 'zod';

import { backgroundPresets } from '../data/backgrounds';
import type { FactionRender } from '../schema/faction';

export type FactionTokenData = z.infer<typeof FactionRender.token>;

const token = (data: FactionTokenData) => data;

/** Authored token inputs shared by stories and rulebook compositions. */
export const factionTokenFixtures = {
  atreides: token({ background: backgroundPresets.atreides, logo: '/vector/logo/atreides.svg' }),
  beneGesserit: token({
    background: backgroundPresets.beneGesserit,
    logo: '/vector/logo/bene-gesserit.svg',
  }),
  beneTleilaxu: token({
    background: backgroundPresets.beneTleilaxu,
    logo: '/vector/logo/bene-tleilaxu.svg',
  }),
  choam: token({ background: backgroundPresets.choam, logo: '/vector/logo/choam.svg' }),
  ecaz: token({ background: backgroundPresets.ecaz, logo: '/vector/logo/ecaz.svg' }),
  emperor: token({ background: backgroundPresets.emperor, logo: '/vector/logo/emperor.svg' }),
  fremen: token({ background: backgroundPresets.fremen, logo: '/vector/logo/fremen.svg' }),
  ginaz: token({ background: backgroundPresets.ginaz, logo: '/vector/logo/ginaz.svg' }),
  guild: token({ background: backgroundPresets.guild, logo: '/vector/logo/guild.svg' }),
  harkonnen: token({
    background: backgroundPresets.harkonnen,
    logo: '/vector/logo/harkonnen.svg',
  }),
  iduali: token({ background: backgroundPresets.iduali, logo: '/vector/logo/iduali.svg' }),
  ixian: token({ background: backgroundPresets.ixian, logo: '/vector/logo/ixian.svg' }),
  landsraad: token({
    background: backgroundPresets.landsraad,
    logo: '/vector/generic/landsraad.svg',
  }),
  moritani: token({ background: backgroundPresets.moritani, logo: '/vector/logo/moritani.svg' }),
  richese: token({ background: backgroundPresets.richese, logo: '/vector/logo/richese.svg' }),
} satisfies Record<string, FactionTokenData>;
