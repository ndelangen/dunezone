import { Buffer } from 'node:buffer';

import { describe, expect, test, vi } from 'vitest';

import {
  componentEnvelopeKey,
  componentPublicationEnvelopeSchema,
  factionMemberPublicationId,
} from '../../src/shared/asset-publishing/componentPublication';
import {
  matchRulebookAnnotatedIllustrationPath,
  rulebookAnnotatedIllustrationPath,
} from '../../src/shared/rulebooks/annotatedIllustration';
import type { RulebookAnnotatedIllustrationResolution } from '../../src/shared/rulebooks/annotatedIllustration';
import { handlePublicAssetRequest } from './delivery';
import { handleRulebookIllustrationRequest } from './rulebook-illustration-delivery';
import { fakeR2Object, jpegBytes } from './test-helpers';

const identity = { rulebookId: 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p', editionNumber: 2, pageId: 'PAGE', blockId: 'BLC2' };
const source = {
  kind: 'faction-member' as const,
  factionId: 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p',
  memberId: '10000000-1000-4000-8000-100000000001',
};
const assetId = factionMemberPublicationId(source.factionId, source.memberId);
const revisionA = '10000000-1000-4000-8000-100000000002';
const revisionB = '10000000-1000-4000-8000-100000000003';
const url = `https://dune.zone${rulebookAnnotatedIllustrationPath(identity)}`;
const geometry = {
  width: 600,
  height: 600,
  parts: [
    { key: 'name', x: 0.1, y: 0.7, width: 0.8, height: 0.2 },
    { key: 'strength', x: 0.7, y: 0.3, width: 0.2, height: 0.2 },
  ],
};

function resolution(): Extract<RulebookAnnotatedIllustrationResolution, { status: 'found' }> {
  return {
    ok: true,
    status: 'found',
    design: 'illustrated',
    configuration: {
      source,
      numbering: 'custom',
      colorMode: 'manual',
      items: [
        { id: 'one', label: '<&"', color: '#112233', target: { kind: 'named', key: 'name', source } },
        { id: 'two', label: '2', target: { kind: 'named', key: 'strength', source } },
        { id: 'three', label: '3', target: { kind: 'position', x: 0.2, y: 0.3, source } },
      ],
    },
    source: {
      status: 'published',
      reference: source,
      name: '<script>alert("source")</script>',
      assetType: 'faction-leader',
      assetId,
      revision: revisionA,
      publishedAt: 1000,
    },
  };
}

function fixture() {
  const envelopes = new Map<string, Uint8Array>();
  function put(revision: string, bytes: number[], parts = geometry.parts) {
    const envelope = componentPublicationEnvelopeSchema.parse({
      schemaVersion: 1,
      assetId,
      assetType: 'faction-leader',
      revision,
      payloadHash: revision === revisionA ? 'a'.repeat(64) : 'b'.repeat(64),
      geometry: { ...geometry, parts },
      image: { contentType: 'image/jpeg', base64: Buffer.from(bytes).toString('base64') },
    });
    envelopes.set(componentEnvelopeKey(assetId, revision), new TextEncoder().encode(JSON.stringify(envelope)));
  }
  const bucket = {
    head: vi.fn(async () => null),
    get: vi.fn(async (key: string) => {
      const bytes = envelopes.get(key);
      if (!bytes) {
        return null;
      }
      return {
        ...fakeR2Object({ key, etag: key, size: bytes.length, uploaded: new Date(0) }),
        body: new Response(bytes).body!,
        bodyUsed: false,
        writeHttpMetadata: () => {},
        bytes: async () => bytes.slice(),
        arrayBuffer: async () => bytes.slice().buffer,
        text: async () => new TextDecoder().decode(bytes),
        json: async <T>() => JSON.parse(new TextDecoder().decode(bytes)) as T,
        blob: async () => new Blob([bytes]),
      };
    }),
  };
  let current: RulebookAnnotatedIllustrationResolution = resolution();
  const client = { resolveRulebookAnnotatedIllustration: vi.fn(async () => current) };
  put(revisionA, [1, 2, 3]);
  return {
    bucket,
    client,
    put,
    set: (next: RulebookAnnotatedIllustrationResolution) => {
      current = next;
    },
    get: () => current,
  };
}

async function serve(f: ReturnType<typeof fixture>, headers?: HeadersInit, method = 'GET') {
  return handleRulebookIllustrationRequest(new Request(url, { headers, method }), identity, f);
}

describe('annotated Rulebook illustration delivery', () => {
  test('the original HTML address follows replacement image bytes and named geometry together', async () => {
    const f = fixture();
    const originalHtml = `<img src="${url}">`;
    const first = await serve(f);
    const oldEtag = first.headers.get('ETag')!;
    const oldSvg = await first.text();
    expect(first.status).toBe(200);
    expect(oldSvg).toContain('data:image/jpeg;base64,AQID');
    expect(oldSvg).toContain('&lt;script&gt;alert(&quot;source&quot;)&lt;/script&gt;');
    expect(oldSvg).toContain('&lt;&amp;&quot;');
    expect(oldSvg).not.toMatch(/<script|onload=|https:\/\//);
    const unchanged = await serve(f, { 'If-None-Match': oldEtag });
    expect(unchanged.status).toBe(304);
    expect(f.client.resolveRulebookAnnotatedIllustration).toHaveBeenCalledTimes(2);
    f.put(revisionB, [4, 5, 6], [{ ...geometry.parts[0]!, y: 0.1 }]);
    const changed = resolution();
    if (changed.source.status === 'published') {
      changed.source.revision = revisionB;
    }
    f.set(changed);
    const next = await serve(f, { 'If-None-Match': oldEtag });
    const newSvg = await next.text();
    expect(next.status).toBe(200);
    expect(next.headers.get('ETag')).not.toBe(oldEtag);
    expect(newSvg).toContain('data:image/jpeg;base64,BAUG');
    expect(newSvg).not.toContain('AQID');
    expect(newSvg).toContain('Unavailable markers: 2');
    expect(newSvg).toContain('Fighting strength');
    expect(newSvg).not.toBe(oldSvg);
    expect(originalHtml).toContain(url);
    expect(next.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
    expect(next.headers.get('Content-Security-Policy')).toContain('img-src data:');
  });

  test('removed sources and access are resolved before old conditional tags or retained bytes', async () => {
    const f = fixture();
    const etag = (await serve(f)).headers.get('ETag')!;
    const removed = resolution();
    removed.source = { status: 'unavailable' };
    f.set(removed);
    f.bucket.get.mockClear();
    const missingSource = await serve(f, { 'If-None-Match': etag });
    expect(missingSource.status).toBe(200);
    expect(await missingSource.text()).not.toContain('data:image');
    expect(missingSource.headers.get('ETag')).not.toBe(etag);
    expect(f.bucket.get).not.toHaveBeenCalled();
    f.set({ ok: true, status: 'missing' });
    const gated = await serve(f, { 'If-None-Match': '*' });
    expect(gated.status).toBe(404);
    expect(gated.headers.get('Cache-Control')).toBe('no-store');
    expect(f.bucket.get).not.toHaveBeenCalled();
  });

  test('HEAD, Design changes and source replacements use the same validated projection', async () => {
    const f = fixture();
    const first = await serve(f);
    const etag = first.headers.get('ETag')!;
    const head = await serve(f, undefined, 'HEAD');
    expect(head.headers.get('ETag')).toBe(etag);
    expect(head.headers.get('Content-Length')).toBe(first.headers.get('Content-Length'));
    expect(await head.text()).toBe('');
    const changed = resolution();
    changed.design = 'restrained';
    changed.configuration.items[0]!.target.source = { ...source, memberId: '10000000-1000-4000-8000-100000000009' };
    f.set(changed);
    const next = await serve(f, { 'If-None-Match': etag });
    expect(next.status).toBe(200);
    expect(next.headers.get('ETag')).not.toBe(etag);
    expect(await next.text()).toContain('Unavailable markers: &lt;&amp;&quot;');
  });

  test('routes accept only bounded Edition identities and never accept URL or annotation payloads', async () => {
    expect(matchRulebookAnnotatedIllustrationPath(new URL(url).pathname)).toEqual(identity);
    for (const path of [
      new URL(url).pathname.replace('/2/', '/0/'),
      new URL(url).pathname.replace('/PAGE/', '/AAAAA/'),
      new URL(url).pathname.replace('/BLC2/', '/%2e%2e/'),
      '/published/rulebooks/' + 'a'.repeat(300),
    ]) {
      expect(matchRulebookAnnotatedIllustrationPath(path)).toBeNull();
    }
    const f = fixture();
    for (const suffix of ['?url=https://evil.invalid/image', '?annotations=[]', '?source=other']) {
      expect((await handleRulebookIllustrationRequest(new Request(url + suffix), identity, f)).status).toBe(400);
    }
    expect((await serve(f, undefined, 'POST')).status).toBe(405);
    expect(f.client.resolveRulebookAnnotatedIllustration).not.toHaveBeenCalled();
    const unexpectedWrite = () => {
      throw new Error('Read-only delivery touched another storage method');
    };
    const binding: Env['ASSET_BUCKET'] = {
      ...f.bucket,
      put: unexpectedWrite,
      createMultipartUpload: unexpectedWrite,
      resumeMultipartUpload: unexpectedWrite,
      delete: unexpectedWrite,
      list: unexpectedWrite,
    };
    const routed = await handlePublicAssetRequest(
      new Request(url),
      { ASSET_BUCKET: binding },
      { waitUntil: vi.fn() },
      { rulebookIllustrationClient: f.client }
    );
    expect(routed?.status).toBe(200);
  });

  test('a missing or oversized private envelope fails closed even for a conditional request', async () => {
    const f = fixture();
    f.bucket.get.mockResolvedValueOnce(null);
    expect((await serve(f, { 'If-None-Match': '*' })).status).toBe(503);
    const object = await f.bucket.get(componentEnvelopeKey(assetId, revisionA));
    if (!object) {
      throw new Error('Expected envelope');
    }
    f.bucket.get.mockResolvedValueOnce({ ...object, size: 8_000_000 });
    expect((await serve(f, { 'If-None-Match': '*' })).status).toBe(503);
  });

  test('positioned stock and faction artwork preserve intrinsic size and revalidate delivered bytes', async () => {
    const f = fixture();
    const stock = { kind: 'stock' as const, artworkId: '/vector/logo/atreides.svg' };
    const make = (
      reference: typeof stock | { kind: 'faction'; factionId: string }
    ): Extract<RulebookAnnotatedIllustrationResolution, { status: 'found' }> => ({
      ok: true,
      status: 'found',
      design: 'illustrated',
      source: { status: 'stock', reference, artworkId: stock.artworkId, name: 'Emblem' },
      configuration: {
        source: reference,
        numbering: 'automatic',
        colorMode: 'automatic',
        items: [{ id: 'pin', label: 'saved', target: { kind: 'position', x: 0.75, y: 0.25, source: reference } }],
      },
    });
    let illustration = '<svg viewBox="0 0 300 100"><path d="M0 0H300V100Z"/></svg>';
    const fetch = vi.fn<Fetcher['fetch']>(async () => new Response(illustration));
    const serveStatic = (etag?: string) =>
      handleRulebookIllustrationRequest(
        new Request(url, { headers: etag ? { 'If-None-Match': etag } : {} }),
        identity,
        { ...f, assets: { fetch } }
      );
    f.set(make(stock));
    const first = await serveStatic();
    const etag = first.headers.get('ETag')!;
    const svg = await first.text();
    expect(first.status).toBe(200);
    expect(svg).toContain('width="300" height="100" preserveAspectRatio');
    expect(svg).toContain('cx="225" cy="25"');
    expect((await serveStatic(etag)).status).toBe(304);
    illustration = '<svg viewBox="0 0 200 400"><path d="M0 0H200V400Z"/></svg>';
    const updated = await serveStatic(etag);
    expect(updated.status).toBe(200);
    expect(await updated.text()).toContain('cx="150" cy="100"');
    f.set(make({ kind: 'faction', factionId: source.factionId }));
    expect((await serveStatic()).status).toBe(200);
    f.set({ ...make(stock), source: { status: 'unavailable' } });
    fetch.mockClear();
    const removed = await serveStatic(etag);
    expect(removed.status).toBe(200);
    expect(await removed.text()).not.toContain('data:image');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('deck markers use the current JPEG dimensions and refuse mismatched publication revisions', async () => {
    const f = fixture();
    const reference = { kind: 'asset' as const, assetId: identity.rulebookId };
    f.set({
      ok: true,
      status: 'found',
      design: 'illustrated',
      source: {
        status: 'image',
        reference,
        name: 'Card back',
        assetType: 'deck',
        assetId: reference.assetId,
        revision: revisionA,
      },
      configuration: {
        source: reference,
        numbering: 'automatic',
        colorMode: 'automatic',
        items: [{ id: 'pin', label: 'saved', target: { kind: 'position', x: 0.5, y: 0.5, source: reference } }],
      },
    });
    const body = jpegBytes({ widthPx: 900, heightPx: 1263, progressive: true });
    const object = (await f.bucket.get(componentEnvelopeKey(assetId, revisionA)))!;
    f.bucket.get.mockResolvedValue({
      ...object,
      size: body.length,
      customMetadata: { publisherCacheToken: revisionA },
      arrayBuffer: async () => body.slice().buffer,
    });
    const first = await serve(f);
    expect(first.status).toBe(200);
    expect(await first.text()).toContain('cx="450" cy="631.5"');
    f.bucket.get.mockResolvedValue({ ...object, customMetadata: { publisherCacheToken: revisionB } });
    const mismatched = await serve(f, { 'If-None-Match': '*' });
    expect(mismatched.status).toBe(503);
    expect(mismatched.headers.get('Cache-Control')).toBe('no-store');
  });

  test('maintained board illustration and highlights arrive in one self-contained SVG', async () => {
    const f = fixture();
    const board = { kind: 'board' as const, boardId: 'arrakis' };
    f.set({
      ok: true,
      status: 'found',
      design: 'illustrated',
      source: { status: 'board', boardId: 'arrakis' },
      configuration: {
        source: board,
        numbering: 'automatic',
        colorMode: 'automatic',
        items: [{ id: 'one', label: 'saved', target: { kind: 'named', key: 'arrakeen', source: board } }],
      },
    });
    const response = await serve(f);
    const svg = await response.text();
    expect(response.status).toBe(200);
    expect(svg).toContain('data:image/svg+xml;base64,');
    expect(svg).toContain('<path');
    expect(svg).not.toContain('target unavailable');
    expect(f.bucket.get).not.toHaveBeenCalled();
  });
});
