import { describe, expect, test } from 'vitest';

import { checkRulebookLive } from './rulebook-live-check';
import type { LiveCheckClient } from './rulebook-live-check';

const RULEBOOK_ID = 'kx7rulebookid000000000000000000';
const ORIGIN = 'https://dune.zone';
const ready = (kind: 'html' | 'pdf', edition: number) => ({
  status: 'ready' as const,
  href: `/published/rulebooks/${RULEBOOK_ID}/editions/${edition}/rulebook.${kind}`,
});
const preparing = { status: 'preparing' as const, href: null };

const editions = [
  { edition_number: 2, created_at: '2026-09-04T00:00:00.000Z', html: ready('html', 2), pdf: preparing },
  { edition_number: 1, created_at: '2026-09-01T00:00:00.000Z', html: ready('html', 1), pdf: ready('pdf', 1) },
];

/* A production stand-in that answers every route the script asks for with the delivery contract, minus whatever the test breaks. */
function fakeClient(breaks: { editionRobots?: boolean } = {}): LiveCheckClient {
  const responses = new Map<string, (method: string) => Response>();
  const html = (edition: number) => (method: string) => {
    if (method === 'POST') {
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    return new Response(method === 'HEAD' ? null : '<html></html>', {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': 'text/html; charset=utf-8',
        ETag: `"html-${edition}"`,
        Link: `<${ORIGIN}/published/rulebooks/${RULEBOOK_ID}/rulebook.html>; rel="canonical"`,
        ...(breaks.editionRobots ? {} : { 'X-Robots-Tag': 'noindex' }),
      },
    });
  };
  responses.set(`/published/rulebooks/${RULEBOOK_ID}/editions/2/rulebook.html`, html(2));
  responses.set(`/published/rulebooks/${RULEBOOK_ID}/editions/1/rulebook.html`, html(1));
  responses.set(`/published/rulebooks/${RULEBOOK_ID}/editions/1/rulebook.pdf`, (method) =>
    method === 'POST'
      ? new Response(null, { status: 405 })
      : new Response(null, {
          status: 200,
          headers: {
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="rulebook.pdf"',
            ETag: '"pdf-1"',
            'X-Robots-Tag': 'noindex',
          },
        })
  );
  responses.set(
    `/published/rulebooks/${RULEBOOK_ID}/editions/2/rulebook.pdf`,
    () => new Response('missing', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  );
  responses.set(
    `/published/rulebooks/${RULEBOOK_ID}/rulebook.html`,
    () =>
      new Response('<html></html>', {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=0, must-revalidate',
          'Content-Location': `/published/rulebooks/${RULEBOOK_ID}/editions/2/rulebook.html`,
        },
      })
  );
  return {
    origin: ORIGIN,
    fetch: async (url, init) => {
      const { pathname } = new URL(url);
      const respond = responses.get(pathname);
      if (respond) {
        return respond(init?.method ?? 'GET');
      }
      if (pathname.startsWith('/rulesets/')) {
        return new Response('<html></html>', { status: 200 });
      }
      return new Response('missing', { status: 404 });
    },
    query: async (path, args) => {
      switch (path) {
        case 'rulebooks:listByRulesetSlug':
          return [
            {
              _id: RULEBOOK_ID,
              slug: 'core',
              name: 'Core',
              current_edition_number: 2,
              html: editions[0].html,
              pdf: editions[0].pdf,
            },
          ];
        case 'rulebooks:editionHistory':
          return { editions };
        case 'rulebooks:readerPage':
          return { edition: { edition_number: args.edition_number } };
        default:
          throw new Error(`Unexpected query ${path}`);
      }
    },
  };
}

describe('the Rulebook live check', () => {
  test('passes a Rulebook whose production delivery meets every contract', async () => {
    const report = await checkRulebookLive(fakeClient(), 'dreamrules', 'core');
    expect(report.rulebook).toEqual({ id: RULEBOOK_ID, name: 'Core', currentEdition: 2 });
    expect(report.findings.filter((finding) => !finding.ok)).toEqual([]);
    expect(report.findings.map((finding) => finding.check)).toContain('Edition 2 PDF preparing');
    expect(report.findings.map((finding) => finding.check)).toContain('no latest PDF alias');
  });

  test('names the contract an Edition response breaks', async () => {
    const report = await checkRulebookLive(fakeClient({ editionRobots: true }), 'dreamrules', 'core');
    expect(report.findings.filter((finding) => !finding.ok).map((finding) => finding.check)).toEqual([
      'Edition 2 HTML robots',
      'Edition 1 HTML robots',
    ]);
  });

  test('reports an absent Rulebook as nothing to verify', async () => {
    const report = await checkRulebookLive(fakeClient(), 'dreamrules', 'elsewhere');
    expect(report.rulebook).toBeNull();
    expect(report.findings).toEqual([expect.objectContaining({ check: 'listing', ok: false })]);
  });
});
