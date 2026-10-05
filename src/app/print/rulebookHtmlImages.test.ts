import { parseHTML } from 'linkedom';
import { describe, expect, test } from 'vitest';

import { factionMemberPublicationId } from '../../shared/asset-publishing/componentPublication';
import { publishedHref } from '../../shared/asset-publishing/publicationTargets';
import { assetPublishingFaction } from '../../shared/factions/fixtures/assetPublishingFaction';
import type { RulebookContentsDraftV1 } from '../../shared/rulebooks/contents';
import { rulebookContentsV1Schema } from '../../shared/rulebooks/contents';
import { rulebookCoverPresetCatalogue } from '../../shared/rulebooks/coverPresets';
import { createRulebookStarterContents } from '../../shared/rulebooks/fixtures';
import { projectRulebookRenderDocument } from '../../shared/rulebooks/projectRenderDocument';
import { rulebookRenderDocumentV1Schema } from '../../shared/rulebooks/renderDocument';
import { createRulebookRenderDocumentFixture } from '../../shared/rulebooks/renderDocument.fixture';
import { rulebookHtmlImages } from './rulebookHtmlImages';
import { renderRulebookHtmlDocument, rulebookRendererCss } from './rulebookHtmlRuntime';

const factionId = 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p';
const memberId = '10000000-1000-4000-8000-100000000001';
const memberHref = publishedHref('faction-leader', factionMemberPublicationId(factionId, memberId));

describe('downloaded Rulebook images', () => {
  test('page title icons load in downloaded HTML without changing headings that have no icon', () => {
    const contents = createRulebookStarterContents();
    contents.pagesById.RULE!.headingIcon = '/vector/icon/storrm_standalone.svg';
    const saved = rulebookContentsV1Schema.parse(JSON.parse(JSON.stringify(contents)));
    const document = projectRulebookRenderDocument(saved, {}, { size: 'square', design: 'illustrated' });
    const before = structuredClone(document);
    const html = renderRulebookHtmlDocument({
      document,
      canonicalHref: 'https://dune.zone/rulesets/dreamrules/rulebooks/test',
      title: 'Phase headings',
      label: 'Phase headings',
      style: rulebookRendererCss,
    });
    const parsed = parseHTML(html).document;
    const icons = [...parsed.querySelectorAll('h1 img')];
    expect(icons).toHaveLength(1);
    expect(icons[0].getAttribute('src')).toBe('https://dune.zone/vector/icon/storrm_standalone.svg');
    const exported = rulebookRenderDocumentV1Schema.parse(rulebookHtmlImages(document, 'https://dune.zone'));
    expect(exported.pagesById.RULE!.headingIcon).toBe('https://dune.zone/vector/icon/storrm_standalone.svg');
    expect(document).toEqual(before);
  });

  test('list icons survive the saved contract and load in downloaded HTML without changing plain items', () => {
    const contents: RulebookContentsDraftV1 = createRulebookStarterContents();
    const list = contents.pagesById.RULE!.blocksById.L5ST!;
    if (list.kind !== 'list') {
      throw new Error('Expected the starter list');
    }
    list.itemOrder = ['STOR', 'PLAIN'];
    list.itemsById = {
      STOR: { id: 'STOR', name: 'Storm', icon: '/vector/icon/storrm_standalone.svg', text: '' },
      PLAIN: { id: 'PLAIN', name: 'Next step', text: 'Keep this step readable without an icon.' },
    };
    const saved = rulebookContentsV1Schema.parse(JSON.parse(JSON.stringify(contents)));
    const document = projectRulebookRenderDocument(saved, {}, { size: 'square', design: 'illustrated' });
    const before = structuredClone(document);
    const html = renderRulebookHtmlDocument({
      document,
      canonicalHref: 'https://dune.zone/rulesets/dreamrules/rulebooks/test',
      title: 'Phase icons',
      label: 'Phase icons',
      style: rulebookRendererCss,
    });
    const parsed = parseHTML(html).document;
    const items = [...parsed.querySelectorAll('[data-rulebook-block-id="L5ST"] li')];
    expect(items.map((item) => item.getAttribute('data-rulebook-item-id'))).toEqual(['STOR', 'PLAIN']);
    expect(items[0].querySelector('img')?.getAttribute('src')).toBe(
      'https://dune.zone/vector/icon/storrm_standalone.svg'
    );
    expect(items[1].querySelector('img')).toBeNull();
    expect(items[1].textContent).toContain('Keep this step readable');
    expect(document).toEqual(before);
  });

  test('a preset and both footer emblems resolve from downloaded HTML without exposing inactive URL fields', () => {
    const preset = rulebookCoverPresetCatalogue[0];
    const contents = rulebookContentsV1Schema.parse({
      schemaVersion: 1,
      pageOrder: ['CVER'],
      pagesById: {
        CVER: {
          id: 'CVER',
          anchor: 'cover',
          title: '',
          layoutId: 'cover',
          showHeading: false,
          controlValues: {
            cover: {
              subtitle: '',
              supportingText: '',
              backgroundSource: { kind: 'preset', presetId: preset.id },
              backgroundImageUrl: 'https://example.com/private.png?signature=inactive-cover-secret',
              footer: {
                enabled: true,
                title: 'Two Houses',
                label: 'Expansion rules',
                leftFactionId: 'left',
                rightFactionId: 'right',
              },
            },
          },
          blocksById: {},
          blockOrderByRegion: {},
        },
      },
    });
    const document = projectRulebookRenderDocument(
      contents,
      {},
      { size: 'a4', design: 'illustrated' },
      {
        left: {
          factionId: 'left',
          name: 'CHOAM',
          color: '#123456',
          token: { logo: '/vector/logo/choam.svg', background: assetPublishingFaction.background },
        },
        right: {
          factionId: 'right',
          name: 'Richese',
          color: '#654321',
          token: { logo: '/vector/logo/richese.svg', background: assetPublishingFaction.background },
        },
      }
    );
    const before = structuredClone(document);
    const html = renderRulebookHtmlDocument({
      document,
      canonicalHref: 'https://dune.zone/published/rulebooks/book/rulebook.html',
      title: 'Two Houses',
      label: 'Two Houses',
      style: rulebookRendererCss,
    });
    expect(html).toContain(`src="https://dune.zone${preset.imageUrl}"`);
    const parsed = parseHTML(html).document;
    const uses = [...parsed.querySelectorAll('use')];
    expect(uses).toHaveLength(8);
    for (const use of uses) {
      const href = use.getAttribute('xlink:href')!;
      expect(href.startsWith('#')).toBe(true);
      expect(parsed.getElementById(href.slice(1))).not.toBeNull();
    }
    expect(parsed.querySelectorAll('symbol')).toHaveLength(2);
    expect([...parsed.querySelectorAll('svg image')].map((image) => image.getAttribute('xlink:href'))).toEqual([
      'https://dune.zone/image/texture/021-large.jpg',
      'https://dune.zone/image/texture/021-large.jpg',
    ]);
    expect(html).toContain('Two Houses');
    expect(html).toContain('Expansion rules');
    expect(html).not.toContain('inactive-cover-secret');
    expect(html).not.toContain('src="/');
    expect(document).toEqual(before);
  });

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
                    tokenImageUrl: publishedHref('faction-token', factionId, 'token-one'),
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
    expect(serialized).toContain(`https://dune.zone${publishedHref('faction-token', factionId, 'token-one')}`);
    expect(serialized).not.toContain('"imageUrl":"/');
    expect(result.pagesById.guide.anchor).toBe('guide');
    expect(JSON.stringify(document)).not.toContain('https://');
  });
});

test('battle plans freeze leader, card and revealed-knowledge images without changing the saved plan', () => {
  const document = createRulebookRenderDocumentFixture();
  const side = {
    faction: { status: 'unavailable' as const, factionId: 'missing' },
    role: 'Aggressor',
    revealed: true,
    dial: 3,
    spice: 2,
    troops: [],
    leader: {
      status: 'ready' as const,
      reference: { kind: 'faction-member' as const, factionId, memberId },
      name: 'Gurney',
      imageUrl: '/published/gurney.jpg?v=one',
    },
    cards: [
      {
        status: 'ready' as const,
        reference: { kind: 'asset' as const, assetId: 'pistol' },
        name: 'Pistol',
        imageUrl: '/published/pistol.jpg?v=two',
      },
    ],
    knownCard: {
      status: 'ready' as const,
      reference: { kind: 'asset' as const, assetId: 'snooper' },
      name: 'Snooper',
      imageUrl: '/published/snooper.jpg?v=three',
    },
  };
  const block = {
    id: 'BTTL',
    kind: 'battle-step' as const,
    step: '4',
    title: 'Reveal',
    caption: '',
    left: side,
    right: { ...side, role: 'Defender' },
  };
  document.pagesById.RULE!.regions[0]!.blocks.push(block);
  const before = structuredClone(document);
  const exported = rulebookRenderDocumentV1Schema.parse(rulebookHtmlImages(document, 'https://dune.zone'));
  expect(exported.pagesById.RULE!.regions[0]!.blocks.at(-1)).toMatchObject({
    left: {
      leader: { imageUrl: 'https://dune.zone/published/gurney.jpg?v=one' },
      cards: [{ imageUrl: 'https://dune.zone/published/pistol.jpg?v=two' }],
      knownCard: { imageUrl: 'https://dune.zone/published/snooper.jpg?v=three' },
    },
  });
  expect(document).toEqual(before);
});
