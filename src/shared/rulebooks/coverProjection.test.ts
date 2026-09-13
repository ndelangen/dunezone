import { describe, expect, it } from 'vitest';

import { rulebookDraftEntitySchemas, rulebookContentsV1Schema, rulebookCoverFooterSchema } from './contents';
import { getRulebookCoverPreset } from './coverPresets';
import { projectRulebookDraftRenderPage, projectRulebookRenderDocument } from './projectRenderDocument';
import { collectRulebookReferenceIds } from './references';
import { DEFAULT_RULEBOOK_SETTINGS } from './settings';

const sourceUrl = 'https://example.com/arrakis.png';
const storedImage = {
  sourceUrl,
  url: `https://dune.zone/user-images/${'a'.repeat(64)}.jpg`,
  width: 1450,
  height: 1445,
};

function projectCover(controls: Record<string, unknown>) {
  const draft = rulebookDraftEntitySchemas.page.parse({
    id: 'CVER',
    anchor: 'cover',
    title: 'Dreamrules',
    layoutId: 'cover',
    showHeading: true,
    controlValues: { cover: { subtitle: '', supportingText: '', ...controls } },
    blockOrderByRegion: {},
    blocksById: {},
  });
  const page = projectRulebookDraftRenderPage(draft, {});
  if (page.layoutId !== 'cover') {
    throw new Error('Expected a Cover');
  }
  return page.controlValues.cover;
}

describe('Cover projection', () => {
  it('uses the stored image only while it matches the current source', () => {
    expect(
      projectCover({ backgroundImage: storedImage, backgroundImageUrl: sourceUrl, showDuneLogo: true })
    ).toMatchObject({
      backgroundImage: { url: storedImage.url, width: storedImage.width, height: storedImage.height },
      backgroundImageUrl: storedImage.url,
      showDuneLogo: true,
    });
    expect(
      projectCover({ backgroundImage: storedImage, backgroundImageUrl: 'https://example.com/replacement.png' })
        .backgroundImageUrl
    ).toBe('https://example.com/replacement.png');
    for (const backgroundImageUrl of ['', 'not a URL', 'javascript:alert(1)']) {
      expect(projectCover({ backgroundImage: storedImage, backgroundImageUrl }).backgroundImageUrl).toBe('');
    }
  });

  it('does not add new cover settings to legacy Editions', () => {
    expect(projectCover({})).toEqual({ artwork: { status: 'unselected' }, subtitle: '', supportingText: '' });
  });

  it('projects only the selected preset and preserves it in publication', () => {
    const cover = projectCover({
      backgroundSource: { kind: 'preset', presetId: 'sandworm' },
      backgroundImageUrl: sourceUrl,
      backgroundImage: storedImage,
    });
    expect(cover.backgroundImageUrl).toBe(getRulebookCoverPreset('sandworm').imageUrl);
    expect(cover.backgroundImage).toBeUndefined();
    expect(JSON.stringify(cover)).not.toContain(sourceUrl);
    const contents = rulebookContentsV1Schema.parse({
      schemaVersion: 1,
      pageOrder: ['CVER'],
      pagesById: {
        CVER: {
          id: 'CVER',
          anchor: 'cover',
          title: 'Cover',
          layoutId: 'cover',
          showHeading: true,
          controlValues: {
            cover: { backgroundSource: { kind: 'preset', presetId: 'sandworm' }, subtitle: '', supportingText: '' },
          },
          blockOrderByRegion: {},
          blocksById: {},
        },
      },
    });
    const published = projectRulebookRenderDocument(contents, {}, DEFAULT_RULEBOOK_SETTINGS);
    expect(published.pagesById.CVER).toMatchObject({
      controlValues: { cover: { backgroundImageUrl: cover.backgroundImageUrl } },
    });
  });

  it('collects only visible footer factions and resolves updates without copying them into the draft', () => {
    const contents = rulebookContentsV1Schema.parse({
      schemaVersion: 1,
      pageOrder: ['CVER'],
      pagesById: {
        CVER: {
          id: 'CVER',
          anchor: 'cover',
          title: 'Cover',
          layoutId: 'cover',
          showHeading: true,
          controlValues: {
            cover: {
              subtitle: '',
              supportingText: '',
              footer: {
                enabled: true,
                title: 'CHOAM & Richese',
                label: 'House expansion',
                leftFactionId: 'choam',
                rightFactionId: 'richese',
              },
            },
          },
          blockOrderByRegion: {},
          blocksById: {},
        },
      },
    });
    const page = contents.pagesById.CVER!;
    if (page.layoutId !== 'cover') {
      throw new Error('Expected Cover');
    }
    expect(collectRulebookReferenceIds(contents).factionIds).toEqual(['choam', 'richese']);
    const before = JSON.stringify(contents);
    const resolved = projectRulebookDraftRenderPage(
      page,
      {},
      { choam: { factionId: 'choam', name: 'CHOAM', color: '#222', emblemUrl: '/current.svg' } }
    );
    expect(resolved).toMatchObject({
      controlValues: {
        cover: {
          footer: {
            leftFaction: { status: 'ready', emblemUrl: '/current.svg' },
            rightFaction: { status: 'unavailable', factionId: 'richese' },
          },
        },
      },
    });
    expect(JSON.stringify(contents)).toBe(before);
    page.controlValues.cover.footer!.enabled = false;
    expect(collectRulebookReferenceIds(contents).factionIds).toEqual([]);
    expect(projectRulebookDraftRenderPage(page, {})).toMatchObject({ controlValues: { cover: { subtitle: '' } } });
    expect(JSON.stringify(projectRulebookDraftRenderPage(page, {}))).not.toContain('choam');
    expect(page.controlValues.cover.footer!.leftFactionId).toBe('choam');
  });

  it('prefers the independent footer region even when a legacy footer remains enabled', () => {
    const footer = rulebookCoverFooterSchema.parse({
      enabled: true,
      title: 'Independent footer',
      label: '',
      leftFactionId: 'new-house',
    });
    const page = rulebookDraftEntitySchemas.page.parse({
      id: 'CVER',
      anchor: 'cover',
      title: 'Dreamrules',
      layoutId: 'cover',
      showHeading: true,
      controlValues: {
        cover: {
          subtitle: '',
          supportingText: '',
          footer: { enabled: true, title: 'Legacy footer', label: '', leftFactionId: 'old-house' },
        },
        footer,
      },
      blockOrderByRegion: {},
      blocksById: {},
    });
    const contents = { schemaVersion: 1 as const, pageOrder: ['CVER'], pagesById: { CVER: page } };
    expect(collectRulebookReferenceIds(contents).factionIds).toEqual(['new-house']);
    expect(projectRulebookRenderDocument(contents, {}, DEFAULT_RULEBOOK_SETTINGS).pagesById.CVER).toMatchObject({
      controlValues: { cover: { footer: { title: 'Independent footer' } } },
    });
    if (page.layoutId !== 'cover' || !page.controlValues.footer) {
      throw new Error('Expected the independent Cover footer');
    }
    page.controlValues.footer.enabled = false;
    expect(collectRulebookReferenceIds(contents).factionIds).toEqual([]);
    expect(projectRulebookRenderDocument(contents, {}, DEFAULT_RULEBOOK_SETTINGS).pagesById.CVER).not.toHaveProperty(
      'controlValues.cover.footer'
    );
  });
});
