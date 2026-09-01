import { describe, expect, test } from 'vitest';

import {
  matchRulebookHtmlPath,
  rulebookEditionArtifactKey,
  rulebookEditionArtifactPath,
  rulebookLatestHtmlPath,
} from './editionArtifacts';

const RULEBOOK_ID = 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p';

describe('Rulebook HTML paths', () => {
  test('builds and recognizes stable and permanent Edition paths', () => {
    expect(rulebookLatestHtmlPath(RULEBOOK_ID)).toBe(`/published/rulebooks/${RULEBOOK_ID}/rulebook.html`);
    expect(rulebookEditionArtifactPath(RULEBOOK_ID, 12, 'html')).toBe(
      `/published/rulebooks/${RULEBOOK_ID}/editions/12/rulebook.html`
    );
    expect(rulebookEditionArtifactKey(RULEBOOK_ID, 12, 'html')).toBe(
      `rulebooks/${RULEBOOK_ID}/editions/12/rulebook.html`
    );
    expect(matchRulebookHtmlPath(rulebookLatestHtmlPath(RULEBOOK_ID))).toEqual({
      kind: 'latest',
      rulebookId: RULEBOOK_ID,
    });
    expect(matchRulebookHtmlPath(rulebookEditionArtifactPath(RULEBOOK_ID, 12, 'html'))).toEqual({
      kind: 'edition',
      rulebookId: RULEBOOK_ID,
      editionNumber: 12,
    });
  });

  test('rejects malformed identifiers, edition numbers, and suffixes', () => {
    expect(matchRulebookHtmlPath('/published/rulebooks/../../rulebook.html')).toBeNull();
    expect(matchRulebookHtmlPath(`/published/rulebooks/${RULEBOOK_ID}/editions/0/rulebook.html`)).toBeNull();
    expect(matchRulebookHtmlPath(`/published/rulebooks/${RULEBOOK_ID}/editions/1/rulebook.pdf`)).toBeNull();
  });
});
