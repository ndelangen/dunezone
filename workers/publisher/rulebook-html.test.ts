import { describe, expect, test } from 'vitest';

import { createRulebookRenderDocumentFixture } from '../../src/shared/rulebooks/renderDocument.fixture';
import { generateRulebookHtml } from './rulebook-html';

const RULEBOOK_ID = 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p';

function bytes(value: string) {
  return new TextEncoder().encode(value).buffer as ArrayBuffer;
}

describe('permanent Rulebook HTML generation', () => {
  test('renders every Page and anchor as a self-contained document without client JavaScript', () => {
    const html = new TextDecoder().decode(
      generateRulebookHtml(
        {
          artifactId: 'artifact-one',
          editionId: 'edition-one',
          rulebookId: RULEBOOK_ID,
          editionNumber: 3,
          rulebookName: 'Arrakis field manual',
          document: createRulebookRenderDocumentFixture(),
        },
        'https://dune.zone',
        {
          caladeaBold: bytes('caladea-bold'),
          caladeaItalic: bytes('caladea-italic'),
          caladeaRegular: bytes('caladea-regular'),
          copperplate: bytes('copperplate'),
          rendererCss: '.rulebookDocument{display:grid}',
          trebuchet: bytes('trebuchet'),
        }
      )
    );

    expect(html).toMatch(/^<!doctype html><html lang="en">/);
    expect(html).toContain(
      `<link rel="canonical" href="https://dune.zone/published/rulebooks/${RULEBOOK_ID}/rulebook.html"/>`
    );
    expect(html).toContain('data:font/woff2;base64');
    expect(html).toContain('id="welcome-to-arrakis"');
    expect(html).toContain('id="movement"');
    expect(html).toContain('id="markers-and-tokens"');
    expect(html).toContain('id="storm-boundary"');
    expect(html).toContain('Movement sequence');
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/data-react(?:root|id)/i);
  });
});
