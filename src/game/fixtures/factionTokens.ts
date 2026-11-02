import type { FactionRender } from '@shared/factions/schema';
import type { z } from 'zod';

import { backgroundPresets } from '../data/backgrounds';

export type FactionTokenData = z.infer<typeof FactionRender.token>;

const token = (data: FactionTokenData) => data;

/** Authored token inputs shared by stories and rulebook compositions. */
export const factionTokenFixtures = {
  atreides: token({ background: backgroundPresets.atreides, emblem: '/vector/emblem/atreides.svg' }),
  beneGesserit: token({
    background: backgroundPresets.beneGesserit,
    emblem: '/vector/emblem/bene-gesserit.svg',
  }),
  beneTleilaxu: token({
    background: backgroundPresets.beneTleilaxu,
    emblem: '/vector/emblem/bene-tleilaxu.svg',
  }),
  choam: token({ background: backgroundPresets.choam, emblem: '/vector/emblem/choam.svg' }),
  ecaz: token({ background: backgroundPresets.ecaz, emblem: '/vector/emblem/ecaz.svg' }),
  emperor: token({ background: backgroundPresets.emperor, emblem: '/vector/emblem/emperor.svg' }),
  fremen: token({ background: backgroundPresets.fremen, emblem: '/vector/emblem/fremen.svg' }),
  ginaz: token({ background: backgroundPresets.ginaz, emblem: '/vector/emblem/ginaz.svg' }),
  guild: token({ background: backgroundPresets.guild, emblem: '/vector/emblem/guild.svg' }),
  harkonnen: token({
    background: backgroundPresets.harkonnen,
    emblem: '/vector/emblem/harkonnen.svg',
  }),
  iduali: token({ background: backgroundPresets.iduali, emblem: '/vector/emblem/iduali.svg' }),
  ixian: token({ background: backgroundPresets.ixian, emblem: '/vector/emblem/ixian.svg' }),
  landsraad: token({
    background: backgroundPresets.landsraad,
    emblem: '/vector/generic/landsraad.svg',
  }),
  moritani: token({ background: backgroundPresets.moritani, emblem: '/vector/emblem/moritani.svg' }),
  richese: token({ background: backgroundPresets.richese, emblem: '/vector/emblem/richese.svg' }),
} satisfies Record<string, FactionTokenData>;
