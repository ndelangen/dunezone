import type { StoredPiece } from '@shared/play/model';

import dreamrulesTechTokens from '../product.stories.fixture/dreamrules-tech-tokens.json';

/**
 * The Dreamrules tech tokens in the shared table inventory, as setup deals them from the ruleset's tech token bundle, each with its published art and the description its author saved on the asset.
 */
export function dreamrulesTechTokenPieces(): StoredPiece[] {
  return dreamrulesTechTokens.tokens.map((token) => {
    const art = new URL(`/play-fixtures/dreamrules/${token.published.file}`, location.origin).href;
    const id = `dreamrules-tech-${token.slug}`;
    return {
      id,
      label: token.name,
      kind: 'force',
      owner: 'shared',
      inventory: 'shared',
      color: '#d5ba8c',
      accent: '#ead9bb',
      /* The bundle prints every back the same as its front. */
      items: [
        {
          id: `${id}-1`,
          faceUp: true,
          artwork: {
            front: art,
            back: art,
            name: token.name,
            type: token.type,
            ...(token.about ? { description: token.about } : {}),
          },
        },
      ],
      stackKey: `token:${token.assetId}`,
      position: [-25, 0, -25],
      orientation: 0,
      zoneId: null,
      locked: false,
    };
  });
}
