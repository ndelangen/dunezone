import { describe, expect, test } from 'vitest';

import { factionMemberPublicationId } from '../../shared/asset-publishing/componentPublication';
import { publishedHref } from '../../shared/asset-publishing/publicationTargets';
import { rulebookRenderDocumentV1Schema } from '../../shared/rulebooks/renderDocument';
import { createRulebookRenderDocumentFixture } from '../../shared/rulebooks/renderDocument.fixture';
import { rulebookHtmlImages } from './rulebookHtmlImages';

const factionId = 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p';
const memberId = '10000000-1000-4000-8000-100000000001';
const memberHref = publishedHref('faction-leader', factionMemberPublicationId(factionId, memberId));

describe('downloaded Rulebook images', () => {
  test('all supported image fields use absolute addresses without changing the draft or its anchors', () => {
    const member = {
      status: 'ready',
      reference: { kind: 'faction-member', factionId, memberId },
      name: 'Leader',
      imageUrl: memberHref,
    };
    const cardHref = publishedHref('card-treachery', 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p', 'old-image');
    const card = {
      status: 'ready',
      reference: { kind: 'asset', assetId: 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p' },
      name: 'Lasgun',
      imageUrl: cardHref,
    };
    const document = rulebookRenderDocumentV1Schema.parse({
      ...createRulebookRenderDocumentFixture(),
      pageOrder: ['guide'],
      pagesById: {
        guide: {
          id: 'guide',
          anchor: 'guide',
          title: 'Guide',
          layoutId: 'single-column',
          showHeading: true,
          controlValues: {},
          regions: [
            {
              key: 'content',
              blocks: [
                { id: 'leader', kind: 'referenced-illustration', source: member, caption: '' },
                { id: 'card', kind: 'card-entry', source: card, text: 'Use a weapon.', quantity: 2 },
                {
                  id: 'cards',
                  kind: 'card-group',
                  title: 'Weapons',
                  text: '',
                  variant: 'featured-member',
                  featuredItemId: 'featured-card',
                  items: [{ id: 'featured-card', source: card, text: '' }],
                },
                {
                  id: 'inventory',
                  kind: 'illustrated-inventory',
                  introduction: '',
                  items: [
                    {
                      id: 'board',
                      source: {
                        status: 'ready',
                        reference: { kind: 'board', boardId: 'arrakis' },
                        name: 'Board',
                        imageUrl: '/page/map.svg',
                      },
                      text: '',
                    },
                    {
                      id: 'artwork',
                      source: {
                        status: 'ready',
                        reference: { kind: 'stock', artworkId: '/image/leader/official/jessica.png' },
                        name: 'Portrait',
                        imageUrl: '/image/leader/official/jessica.png',
                      },
                      text: '',
                    },
                  ],
                },
                {
                  id: 'faction',
                  kind: 'faction-introduction',
                  text: '',
                  faction: {
                    status: 'ready',
                    factionId,
                    name: 'Atreides',
                    color: '#334455',
                    emblemUrl: '/vector/logo/atreides.svg',
                    ruler: member,
                    leaders: [member],
                  },
                },
              ],
            },
          ],
        },
      },
    });
    const result = rulebookHtmlImages(document, 'https://dune.zone/published/rulebooks/book/rulebook.html');
    const serialized = JSON.stringify(result);
    expect(serialized).toContain(`https://dune.zone${memberHref}`);
    expect(serialized).toContain(`https://dune.zone${cardHref}`);
    expect(serialized).toContain('https://dune.zone/page/map.svg');
    expect(serialized).toContain('https://dune.zone/image/leader/official/jessica-large.webp');
    expect(serialized).toContain('https://dune.zone/vector/logo/atreides.svg');
    expect(serialized).not.toContain('"imageUrl":"/');
    expect(result.pagesById.guide.anchor).toBe('guide');
    expect(JSON.stringify(document)).not.toContain('https://');
  });
});
