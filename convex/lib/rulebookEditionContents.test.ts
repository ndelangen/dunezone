import { describe, expect, test } from 'vite-plus/test';

import {
  canonicalRulebookCoverControlValues,
  rulebookContentsV1Schema,
  rulebookEditionContentsV1Schema,
} from '../../src/shared/rulebooks/contents';
import type { RulebookContentsV1 } from '../../src/shared/rulebooks/contents';
import {
  createRulebookEditorialStarterContents,
  createRulebookStarterContents,
} from '../../src/shared/rulebooks/fixtures';
import {
  comparableRulebookContentsMatch,
  RULEBOOK_CONTENTS_HASH_VERSION,
  rulebookContentsHash,
  rulebookContentsHashesMatch,
  rulebookContentsMatch,
  rulebookDraftContentsHash,
  rulebookEditionContentsHash,
} from './rulebookEditionContents';

/** Rebuilds every object with its keys in reverse order, so only the order differs. */
function reversedKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reversedKeys);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, child]) => [key, reversedKeys(child)])
    );
  }
  return value;
}

function withFirstPageTitle(contents: RulebookContentsV1, title: string) {
  const next = structuredClone(contents);
  next.pagesById[next.pageOrder[0]!]!.title = title;
  return next;
}

/** A Cover whose footer sits where earlier editors stored it, inside the cover controls. */
function legacyCoverContents() {
  return rulebookContentsV1Schema.parse({
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
            subtitle: 'Rules for Arrakis',
            supportingText: '',
            footer: { enabled: true, title: 'Original footer', label: 'House expansion' },
          },
        },
        blocksById: {},
        blockOrderByRegion: {},
      },
    },
  });
}

/** The same Cover with its footer moved into its own region, which the editor treats as unchanged. */
function regionCoverContents() {
  const contents = legacyCoverContents();
  const page = contents.pagesById.CVER!;
  if (page.layoutId !== 'cover') {
    throw new Error('Expected the Cover fixture');
  }
  page.controlValues = canonicalRulebookCoverControlValues(page.controlValues);
  return contents;
}

/** Draft and Edition values paired the way the editor compares them, covering equal, reordered, canonicalized and changed documents. */
function comparisonPairs(): Array<[string, unknown, unknown]> {
  const starter = createRulebookStarterContents();
  const editorial = createRulebookEditorialStarterContents();
  return [
    ['identical starter', starter, structuredClone(starter)],
    ['identical editorial starter', editorial, structuredClone(editorial)],
    ['reversed key order', editorial, reversedKeys(editorial)],
    ['legacy footer against its region', legacyCoverContents(), regionCoverContents()],
    ['region footer against its legacy spelling', regionCoverContents(), legacyCoverContents()],
    ['changed title', withFirstPageTitle(starter, 'A changed title'), starter],
    ['different documents', starter, editorial],
    ['reordered pages', { ...editorial, pageOrder: [...editorial.pageOrder].reverse() }, editorial],
  ];
}

describe('Rulebook Contents hashes', () => {
  /* A frozen literal, not a product fixture, so only a change to the hashing inputs can move this value; see RULEBOOK_CONTENTS_HASH_VERSION. */
  test('stay pinned for a frozen document until the hash version changes', () => {
    const frozen = {
      schemaVersion: 1,
      pageOrder: ['CVER'],
      pagesById: {
        CVER: {
          id: 'CVER',
          anchor: 'cover',
          title: 'Pinned',
          layoutId: 'cover',
          showHeading: true,
          controlValues: {
            cover: {
              subtitle: 'Subtitle',
              supportingText: '',
              footer: { enabled: true, title: 'Footer', label: 'Label' },
            },
          },
          blocksById: {},
          blockOrderByRegion: {},
        },
      },
    };
    const pinned = 'v1:6bcb33a59e01e61f55066ab6eae3d30bf1024a9dc445f4d3c376b41745155cef';
    expect(rulebookDraftContentsHash(frozen)).toBe(pinned);
    expect(rulebookEditionContentsHash(frozen)).toBe(pinned);
  });

  test('carry the current version prefix and a SHA-256 hex digest', () => {
    expect(rulebookContentsHash({ schemaVersion: 1 })).toMatch(
      new RegExp(`^${RULEBOOK_CONTENTS_HASH_VERSION}[0-9a-f]{64}$`)
    );
  });

  test('ignore key order and keys left undefined, as storage does', () => {
    const contents = createRulebookEditorialStarterContents();
    expect(rulebookContentsHash(reversedKeys(contents))).toBe(rulebookContentsHash(contents));
    expect(rulebookContentsHash({ ...contents, missing: undefined })).toBe(rulebookContentsHash(contents));
    expect(rulebookContentsMatch({ ...contents, missing: undefined }, contents)).toBe(true);
  });

  test('tell distinct documents apart, including array order', () => {
    const contents = createRulebookStarterContents();
    expect(rulebookContentsHash(withFirstPageTitle(contents, 'Another title'))).not.toBe(
      rulebookContentsHash(contents)
    );
    expect(rulebookContentsHash({ ...contents, pageOrder: [...contents.pageOrder].reverse() })).not.toBe(
      rulebookContentsHash(contents)
    );
  });

  test.each(comparisonPairs())('agree with the full comparison: %s', (_name, draft, edition) => {
    const matches = comparableRulebookContentsMatch(
      rulebookContentsV1Schema.parse(draft),
      rulebookEditionContentsV1Schema.parse(edition)
    );
    const draftHash = rulebookDraftContentsHash(draft);
    const editionHash = rulebookEditionContentsHash(edition);
    expect(rulebookContentsHashesMatch(draftHash, editionHash)).toBe(matches);
  });

  test('call the canonical Cover spellings equal and a changed document different', () => {
    expect(rulebookDraftContentsHash(legacyCoverContents())).toBe(rulebookEditionContentsHash(regionCoverContents()));
    const starter = createRulebookStarterContents();
    expect(rulebookDraftContentsHash(withFirstPageTitle(starter, 'Changed'))).not.toBe(
      rulebookEditionContentsHash(starter)
    );
  });

  test('are absent for Contents that do not parse, so the full comparison decides', () => {
    expect(rulebookDraftContentsHash({ schemaVersion: 1, retired: true })).toBeUndefined();
    expect(rulebookEditionContentsHash({ schemaVersion: 1, retired: true })).toBeUndefined();
  });

  test('are compared only when both carry the current version', () => {
    const hash = rulebookContentsHash({ schemaVersion: 1 });
    expect(rulebookContentsHashesMatch(hash, hash)).toBe(true);
    expect(rulebookContentsHashesMatch(hash, rulebookContentsHash({ schemaVersion: 2 }))).toBe(false);
    expect(rulebookContentsHashesMatch(hash, undefined)).toBeUndefined();
    expect(rulebookContentsHashesMatch(undefined, hash)).toBeUndefined();
    const older = `v0:${hash.slice(RULEBOOK_CONTENTS_HASH_VERSION.length)}`;
    expect(rulebookContentsHashesMatch(older, older)).toBeUndefined();
  });
});
