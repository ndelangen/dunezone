import type { RulebookRenderPageByLayoutV1 } from '@shared/rulebooks/renderDocument';

import { factionTokenFixtures } from '../fixtures/factionTokens';

type CoverFooter = NonNullable<RulebookRenderPageByLayoutV1<'cover'>['controlValues']['cover']['footer']>;

export function createCoverFooter(options: Partial<CoverFooter> = {}): CoverFooter {
  return {
    enabled: true,
    title: 'CHOAM &\nRICHESE',
    label: 'HOUSE EXPANSION',
    leftFaction: {
      status: 'ready',
      factionId: 'choam',
      name: 'CHOAM',
      color: '#e6bc65',
      emblemUrl: '/vector/logo/choam.svg',
      token: factionTokenFixtures.choam,
    },
    rightFaction: {
      status: 'ready',
      factionId: 'richese',
      name: 'Richese',
      color: '#7ec3de',
      emblemUrl: '/vector/logo/richese.svg',
      token: factionTokenFixtures.richese,
    },
    ...options,
  };
}

export function createImageCoverPage(
  options: Partial<RulebookRenderPageByLayoutV1<'cover'>['controlValues']['cover']> = {}
): RulebookRenderPageByLayoutV1<'cover'> {
  return {
    id: 'CVER',
    anchor: 'cover',
    title: 'Dreamrules',
    layoutId: 'cover',
    showHeading: true,
    controlValues: {
      cover: {
        artwork: { status: 'unselected' },
        backgroundImageUrl: '/page/cover-a.svg',
        showDuneLogo: true,
        showSubtitle: true,
        subtitle: 'A guide to Arrakis',
        supportingText: '',
        ...options,
      },
    },
    regions: [],
  };
}
