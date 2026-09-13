import { getRulebookCoverFooter, rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type { RulebookContentsDraftV1 } from '@shared/rulebooks/contents';
import { describe, expect, it } from 'vitest';

import { createRulebookEditorStateManager } from './rulebookEditorState';
import type { RulebookEditorResult, RulebookEditorStateManager } from './rulebookEditorState';
import { createCleanRulebookEditorInput } from './rulebookEditorState.fixtures';

const legacyFooter = {
  enabled: true,
  title: 'CHOAM & Richese',
  label: 'House expansion',
  leftFactionId: 'choam',
  rightFactionId: 'richese',
};
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

function createLegacyCoverManager() {
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
          cover: {
            backgroundImageUrl: '',
            showDuneLogo: true,
            subtitle: 'Rules for Arrakis',
            supportingText: '',
            footer: legacyFooter,
          },
        },
        blockOrderByRegion: {},
        blocksById: {},
      },
    },
  });
  const manager = createRulebookEditorStateManager({
    ...input,
    baseline: { ...input.baseline, contents },
    latest: { ...input.latest, contents: structuredClone(contents) },
  });
  return { manager, contents };
}

function editCover(manager: RulebookEditorStateManager, edit: (page: ReturnType<typeof cover>) => void) {
  const draft = structuredClone(ready(manager.result).draft);
  edit(cover(draft));
  return ready(manager.dispatch({ kind: 'replace-draft', draft }));
}

describe('Cover footer editor state', () => {
  it('edits and saves a separate footer on a legacy Cover without changing its issued layout', () => {
    const { manager, contents } = createLegacyCoverManager();
    const initial = ready(manager.result);
    expect(initial.canSave).toBe(false);
    expect(getRulebookCoverFooter(cover(initial.draft).controlValues)).toEqual(legacyFooter);
    expect(cover(initial.draft).controlValues).not.toHaveProperty('footer');

    const footer = { ...legacyFooter, enabled: false, title: 'Expansion guide' };
    const changed = editCover(manager, (page) => {
      page.controlValues.footer = footer;
    });
    expect(changed.operationError).toBeUndefined();
    expect(changed.incompatibilities).toHaveLength(0);
    expect(changed.canSave).toBe(true);
    expect(getRulebookCoverFooter(cover(changed.draft).controlValues)).toEqual(footer);

    const detailsChanged = editCover(manager, (page) => {
      page.controlValues.cover.subtitle = 'Advanced rules';
      page.controlValues.cover.showDuneLogo = false;
    });
    expect(detailsChanged.operationError).toBeUndefined();
    expect(getRulebookCoverFooter(cover(detailsChanged.draft).controlValues)).toEqual(footer);
    const request = ready(manager.dispatch({ kind: 'begin-save' })).saveRequest!;
    const saved = { revision: 'revision-2', contents: request.contents };
    const result = ready(manager.dispatch({ kind: 'save-succeeded', saved }));
    expect(result.operationError).toBeUndefined();
    expect(result.incompatibilities).toHaveLength(0);
    expect(result.canSave).toBe(false);
    expect(cover(result.draft).controlValues).toMatchObject({
      footer,
      cover: { subtitle: 'Advanced rules', showDuneLogo: false },
    });
    expect(getRulebookCoverFooter(cover(contents).controlValues)).toEqual(legacyFooter);
    expect(cover(contents).controlValues).not.toHaveProperty('footer');
  });

  it('rebases a local subtitle over an equivalent separate footer without a representation conflict', () => {
    const { manager, contents } = createLegacyCoverManager();
    editCover(manager, (page) => {
      page.controlValues.cover.subtitle = 'A local subtitle';
    });
    const latestContents = structuredClone(contents);
    const latestCover = cover(latestContents);
    latestCover.controlValues.footer = structuredClone(legacyFooter);
    delete latestCover.controlValues.cover.footer;
    const result = ready(
      manager.dispatch({ kind: 'receive-latest', latest: { revision: 'revision-2', contents: latestContents } })
    );
    expect(result.operationError).toBeUndefined();
    expect(result.incompatibilities).toHaveLength(0);
    expect(result.canSave).toBe(true);
    expect(cover(result.draft).controlValues.cover.subtitle).toBe('A local subtitle');
    expect(getRulebookCoverFooter(cover(result.draft).controlValues)).toEqual(legacyFooter);
    expect(result.saveRequest?.expectedRevision).toBe('revision-2');
  });

  it.each(['direct', 'subscription-first'] as const)(
    'retains a later footer edit when image rehosting receives a %s Save acknowledgement',
    (delivery) => {
      const { manager } = createLegacyCoverManager();
      editCover(manager, (page) => {
        page.controlValues.cover.backgroundImageUrl = sourceUrl;
      });
      const request = ready(manager.dispatch({ kind: 'begin-save' })).saveRequest!;
      const footer = { ...legacyFooter, enabled: false, label: 'Written during Save' };
      const changed = editCover(manager, (page) => {
        page.controlValues.footer = footer;
      });
      expect(changed.operationError).toBeUndefined();
      const contents = structuredClone(request.contents);
      cover(contents).controlValues.cover.backgroundImage = storedImage;
      const saved = { revision: 'revision-2', contents };
      if (delivery === 'subscription-first') {
        const received = ready(manager.dispatch({ kind: 'receive-latest', latest: saved }));
        expect(received.incompatibilities).toHaveLength(0);
        expect(getRulebookCoverFooter(cover(received.draft).controlValues)).toEqual(footer);
      }
      const result = ready(manager.dispatch({ kind: 'save-succeeded', saved }));
      expect(result.operationError).toBeUndefined();
      expect(result.incompatibilities).toHaveLength(0);
      expect(result.canSave).toBe(true);
      expect(getRulebookCoverFooter(cover(result.draft).controlValues)).toEqual(footer);
      expect(cover(result.draft).controlValues.cover.backgroundImage).toEqual(storedImage);
      expect(getRulebookCoverFooter(cover(saved.contents).controlValues)).toEqual(legacyFooter);
      expect(cover(request.contents).controlValues.cover.backgroundImage).toBeUndefined();
    }
  );
});
