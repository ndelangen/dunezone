import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type { RulebookContentsDraftV1 } from '@shared/rulebooks/contents';
import { describe, expect, it } from 'vitest';

import { createRulebookEditorStateManager } from './rulebookEditorState';
import type { RulebookEditorResult, RulebookEditorStateManager } from './rulebookEditorState';
import { createCleanRulebookEditorInput } from './rulebookEditorState.fixtures';

const sourceUrl = 'https://example.com/arrakis.png';
const storedImage = {
  sourceUrl,
  url: `https://dune.zone/user-images/${'a'.repeat(64)}.jpg`,
  width: 1450,
  height: 1445,
};

function ready(result: RulebookEditorResult) {
  if (result.status !== 'ready') {
    throw new Error('Expected a ready editor');
  }
  return result;
}

function cover(contents: RulebookContentsDraftV1) {
  const page = contents.pagesById.CVER;
  if (page?.layoutId !== 'cover') {
    throw new Error('Expected a Cover');
  }
  return page;
}

function createCoverManager() {
  const input = createCleanRulebookEditorInput();
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
          cover: { backgroundImageUrl: '', showDuneLogo: true, showSubtitle: true, subtitle: '', supportingText: '' },
        },
        blockOrderByRegion: {},
        blocksById: {},
      },
    },
  });
  return createRulebookEditorStateManager({
    ...input,
    baseline: { ...input.baseline, contents },
    latest: { ...input.latest, contents: structuredClone(contents) },
  });
}

function editCover(manager: RulebookEditorStateManager, edit: (page: ReturnType<typeof cover>) => void) {
  const draft = structuredClone(ready(manager.result).draft);
  edit(cover(draft));
  return ready(manager.dispatch({ kind: 'replace-draft', draft }));
}

describe('Cover image editor state', () => {
  it('keeps incomplete image URLs editable and blocks Save with a field diagnostic', () => {
    const manager = createCoverManager();
    for (const backgroundImageUrl of [
      'h',
      'https:/',
      'https://',
      'http://example.com/image.png',
      'javascript:alert(1)',
    ]) {
      const result = editCover(manager, (page) => {
        page.controlValues.cover.backgroundImageUrl = backgroundImageUrl;
      });
      expect(cover(result.draft).controlValues.cover.backgroundImageUrl).toBe(backgroundImageUrl);
      expect(result.operationError).toBeUndefined();
      expect(result.canSave).toBe(false);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          target: { kind: 'page', pageId: 'CVER' },
          field: 'control-values',
          code: 'invalid-cover-image-url',
        }),
      ]);
    }
    const valid = editCover(manager, (page) => {
      page.controlValues.cover.backgroundImageUrl = sourceUrl;
    });
    expect(valid.diagnostics).toHaveLength(0);
    expect(valid.canSave).toBe(true);
    const cleared = editCover(manager, (page) => {
      page.controlValues.cover.backgroundImageUrl = '';
    });
    expect(cleared.diagnostics).toHaveLength(0);
    expect(cleared.canSave).toBe(false);
  });

  it.each(['title', 'subtitle', 'logo', 'replacement', 'clear'] as const)(
    'preserves a %s edit while Save stores the image and the subscription arrives first',
    (change) => {
      const manager = createCoverManager();
      editCover(manager, (page) => {
        page.controlValues.cover.backgroundImageUrl = sourceUrl;
      });
      const request = ready(manager.dispatch({ kind: 'begin-save' })).saveRequest!;
      editCover(manager, (page) => {
        if (change === 'title') {
          page.title = 'A later title';
        }
        if (change === 'subtitle') {
          page.controlValues.cover.subtitle = 'A later subtitle';
        }
        if (change === 'logo') {
          page.controlValues.cover.showDuneLogo = false;
        }
        if (change === 'replacement') {
          page.controlValues.cover.backgroundImageUrl = 'https://example.com/replacement.png';
        }
        if (change === 'clear') {
          page.controlValues.cover.backgroundImageUrl = '';
        }
      });
      const expectedPage = structuredClone(cover(ready(manager.result).draft));
      const contents = structuredClone(request.contents);
      cover(contents).controlValues.cover.backgroundImage = storedImage;
      const saved = { revision: 'revision-2', contents };
      manager.dispatch({ kind: 'receive-latest', latest: saved });
      const result = ready(manager.dispatch({ kind: 'save-succeeded', saved }));
      expect(result.incompatibilities).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.canSave).toBe(true);
      expect(cover(result.draft)).toMatchObject(expectedPage);
      expect(cover(result.draft).controlValues.cover.backgroundImage).toEqual(
        change === 'replacement' || change === 'clear' ? undefined : storedImage
      );
      expect(cover(request.contents).controlValues.cover.backgroundImage).toBeUndefined();
      expect(cover(saved.contents).controlValues.cover.backgroundImage).toEqual(storedImage);
    }
  );

  it('accepts a direct Save acknowledgement and retains a subtitle typed during rehosting', () => {
    const manager = createCoverManager();
    editCover(manager, (page) => {
      page.controlValues.cover.backgroundImageUrl = sourceUrl;
    });
    const request = ready(manager.dispatch({ kind: 'begin-save' })).saveRequest!;
    editCover(manager, (page) => {
      page.controlValues.cover.subtitle = 'Written during Save';
    });
    const contents = structuredClone(request.contents);
    cover(contents).controlValues.cover.backgroundImage = storedImage;
    const result = ready(manager.dispatch({ kind: 'save-succeeded', saved: { revision: 'revision-2', contents } }));
    expect(result.incompatibilities).toHaveLength(0);
    expect(result.canSave).toBe(true);
    expect(cover(result.draft).controlValues.cover).toMatchObject({
      subtitle: 'Written during Save',
      backgroundImage: storedImage,
    });
  });

  it('clears the pending change after a pasted URL is normalized and its image is stored', () => {
    const manager = createCoverManager();
    editCover(manager, (page) => {
      page.controlValues.cover.backgroundImageUrl = `  ${sourceUrl}  `;
    });
    const request = ready(manager.dispatch({ kind: 'begin-save' })).saveRequest!;
    expect(cover(request.contents).controlValues.cover.backgroundImageUrl).toBe(sourceUrl);
    const contents = structuredClone(request.contents);
    cover(contents).controlValues.cover.backgroundImage = storedImage;
    const result = ready(manager.dispatch({ kind: 'save-succeeded', saved: { revision: 'revision-2', contents } }));
    expect(result.incompatibilities).toHaveLength(0);
    expect(result.canSave).toBe(false);
    expect(cover(result.draft).controlValues.cover.backgroundImage).toEqual(storedImage);
  });
});
