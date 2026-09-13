import { describe, expect, test } from 'vitest';

import { factionMemberPublicationId } from '../../shared/asset-publishing/componentPublication';
import { publishedHref } from '../../shared/asset-publishing/publicationTargets';
import { rulebookContentsV1Schema } from '../../shared/rulebooks/contents';
import { projectRulebookRenderDocument } from '../../shared/rulebooks/projectRenderDocument';
import { rulebookRenderDocumentV1Schema } from '../../shared/rulebooks/renderDocument';
import { createRulebookRenderDocumentFixture } from '../../shared/rulebooks/renderDocument.fixture';
import { rulebookHtmlImages } from './rulebookHtmlImages';
import { renderRulebookHtmlDocument } from './rulebookHtmlRuntime';

const factionId = 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p';
const memberId = '10000000-1000-4000-8000-100000000001';
const memberHref = publishedHref('faction-leader', factionMemberPublicationId(factionId, memberId));

describe('downloaded Rulebook images', () => {
  test('cover images and the logo load from absolute addresses in downloaded HTML', () => {
    const image = {
      sourceUrl: 'https://example.com/arrakis.png?signature=private-cover-secret',
      url: `https://dune.zone/user-images/${'a'.repeat(64)}.jpg`,
      width: 1450,
      height: 1445,
    };
    const contents = rulebookContentsV1Schema.parse({
      schemaVersion: 1,
      pageOrder: ['CVER'],
      pagesById: {
        CVER: {
          id: 'CVER',
          anchor: 'cover',
          title: 'Dreamrules',
          layoutId: 'cover',
          showHeading: true,
          controlValues: {
            cover: {
              backgroundImage: image,
              backgroundImageUrl: image.sourceUrl,
              showDuneLogo: true,
              showSubtitle: true,
              subtitle: 'A guide to Arrakis',
              supportingText: '',
            },
          },
          blockOrderByRegion: {},
          blocksById: {},
        },
      },
    });
    const originalContents = structuredClone(contents);
    const document = projectRulebookRenderDocument(contents, {}, { size: 'a4', design: 'illustrated' });
    const before = structuredClone(document);
    const html = renderRulebookHtmlDocument({
      document,
      canonicalHref: 'https://dune.zone/published/rulebooks/book/rulebook.html',
      title: 'Dreamrules',
      label: 'Dreamrules',
      style: '',
    });
    expect(html).toContain(`src="${image.url}"`);
    expect(html).toContain('src="https://dune.zone/page/dune_logo.svg"');
    expect(html).not.toContain('src="/');
    expect(html).not.toContain('/page/bottom.svg');
    expect(html).not.toContain('Page 1');
    expect(html).not.toContain('private-cover-secret');
    expect(JSON.stringify(document)).not.toContain('private-cover-secret');
    expect(contents).toEqual(originalContents);
    expect(document).toEqual(before);
  });

  test('exported annotations identify their immutable Edition while the legend stays captured', () => {
    const document = rulebookRenderDocumentV1Schema.parse({
      ...createRulebookRenderDocumentFixture(),
      pageOrder: ['PAGE'],
      pagesById: {
        PAGE: {
          id: 'PAGE',
          title: '',
          anchor: 'page',
          layoutId: 'single-column',
          showHeading: false,
          controlValues: {},
          regions: [
            {
              key: 'content',
              blocks: [
                {
                  id: 'BLC2',
                  kind: 'asset-explainer',
                  source: { status: 'unavailable', reference: { kind: 'asset', assetId: 'missing-card' } },
                  caption: 'Captured caption',
                  numbering: 'automatic',
                  colorMode: 'automatic',
                  items: [
                    {
                      id: 'one',
                      label: 'manual',
                      text: 'Captured explanation',
                      target: { kind: 'named', key: 'name' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
    const edition = { rulebookId: factionId, editionNumber: 7 };
    const copy = rulebookHtmlImages(document, 'https://dune.zone/published/rulebooks/book/rulebook.html', edition);
    const block = copy.pagesById.PAGE!.regions[0]!.blocks[0]!;
    expect(block).toMatchObject({
      illustrationUrl: `https://dune.zone/published/rulebooks/${factionId}/editions/7/pages/PAGE/blocks/BLC2/illustration.svg`,
      caption: 'Captured caption',
      items: [{ text: 'Captured explanation' }],
    });
    expect(JSON.stringify(document)).not.toContain('illustrationUrl');
  });

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
