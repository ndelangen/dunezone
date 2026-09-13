import { describe, expect, it } from 'vitest';

import { rulebookDraftEntitySchemas } from './contents';
import { projectRulebookDraftRenderPage } from './projectRenderDocument';

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
});
