import type { RulebookRenderPageByLayoutV1 } from '@shared/rulebooks/renderDocument';

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
