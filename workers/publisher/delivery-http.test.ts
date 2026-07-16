import { describe, expect, test } from 'vitest';

import { type AssetRepresentation, evaluateAssetRequest, parseHttpDate } from './delivery-http';

const NOW = Date.parse('2026-07-16T13:00:00.000Z');
const LAST_MODIFIED = 'Thu, 16 Jul 2026 12:00:00 GMT';
const representation: AssetRepresentation = {
  exists: true,
  etag: '"etag-one"',
  lastModified: LAST_MODIFIED,
  size: 10,
};

function request(headers: HeadersInit = {}, method: 'GET' | 'HEAD' = 'GET'): Request {
  return new Request('https://assets.example.test/published/factions/id/sheet.pdf', {
    method,
    headers,
  });
}

describe('RFC-aligned delivery evaluator', () => {
  test.each([
    ['Thu, 16 Jul 2026 12:00:00 GMT', Date.UTC(2026, 6, 16, 12)],
    ['Thursday, 16-Jul-26 12:00:00 GMT', Date.UTC(2026, 6, 16, 12)],
    ['Thu Jul 16 12:00:00 2026', Date.UTC(2026, 6, 16, 12)],
  ])('accepts an RFC HTTP-date: %s', (value, expected) => {
    expect(parseHttpDate(value, NOW)).toBe(expected);
  });

  test.each([
    '2026-07-16T12:00:00Z',
    'Thu, 16 Jul 2026 12:00:00 UTC',
    'thu, 16 Jul 2026 12:00:00 GMT',
    'Fri, 16 Jul 2026 12:00:00 GMT',
    'Mon, 01 Jan 1600 00:00:00 GMT',
    'Thu, 32 Jul 2026 12:00:00 GMT',
    'Thu, 16 Jul 2026 25:00:00 GMT',
  ])('rejects a non-RFC or semantically invalid HTTP-date: %s', (value) => {
    expect(parseHttpDate(value, NOW)).toBeNull();
  });

  test.each([
    ['If-Match star with representation', { 'If-Match': '*' }, representation, 200],
    ['If-Match star without representation', { 'If-Match': '*' }, { exists: false }, 412],
    ['If-Match strong match', { 'If-Match': '"etag-one"' }, representation, 200],
    ['If-Match weak mismatch', { 'If-Match': 'W/"etag-one"' }, representation, 412],
    ['If-Match different tag', { 'If-Match': '"other"' }, representation, 412],
    ['If-None-Match star with representation', { 'If-None-Match': '*' }, representation, 304],
    ['If-None-Match star without representation', { 'If-None-Match': '*' }, { exists: false }, 404],
    ['If-None-Match weak match', { 'If-None-Match': 'W/"etag-one"' }, representation, 304],
    ['If-None-Match mismatch', { 'If-None-Match': '"other"' }, representation, 200],
  ] as const)('%s', (_label, headers, selected, status) => {
    expect(evaluateAssetRequest(request(headers), selected, NOW).status).toBe(status);
  });

  test('applies RFC precondition precedence and ignores invalid dates', () => {
    expect(
      evaluateAssetRequest(
        request({
          'If-Match': '"etag-one"',
          'If-Unmodified-Since': 'Wed, 15 Jul 2026 12:00:00 GMT',
        }),
        representation,
        NOW
      ).status
    ).toBe(200);
    expect(
      evaluateAssetRequest(
        request({
          'If-None-Match': '"other"',
          'If-Modified-Since': LAST_MODIFIED,
        }),
        representation,
        NOW
      ).status
    ).toBe(200);
    expect(
      evaluateAssetRequest(
        request({ 'If-Unmodified-Since': 'Wed, 15 Jul 2026 12:00:00 GMT' }),
        representation,
        NOW
      ).status
    ).toBe(412);
    expect(
      evaluateAssetRequest(request({ 'If-Modified-Since': LAST_MODIFIED }), representation, NOW)
        .status
    ).toBe(304);
    expect(
      evaluateAssetRequest(
        request({ 'If-Unmodified-Since': '2026-07-17', 'If-Modified-Since': 'not-a-date' }),
        representation,
        NOW
      ).status
    ).toBe(200);
  });

  test.each([
    ['closed', 'bytes=2-4', { status: 206, range: { offset: 2, length: 3 } }],
    ['open', 'bytes=7-', { status: 206, range: { offset: 7, length: 3 } }],
    ['suffix', 'bytes=-4', { status: 206, range: { offset: 6, length: 4 } }],
    ['clamped end', 'bytes=8-100', { status: 206, range: { offset: 8, length: 2 } }],
    ['multiple', 'bytes=0-1,3-4', { status: 416, size: 10 }],
    ['malformed', 'bytes=oops', { status: 416, size: 10 }],
    ['reversed', 'bytes=5-2', { status: 416, size: 10 }],
    ['zero suffix', 'bytes=-0', { status: 416, size: 10 }],
    ['unsatisfiable', 'bytes=10-', { status: 416, size: 10 }],
  ] as const)('evaluates one %s range', (_label, range, expected) => {
    expect(evaluateAssetRequest(request({ Range: range }), representation, NOW)).toEqual(expected);
  });

  test.each(['bytes=2-4', 'bytes=oops', 'bytes=0-1,3-4'])('ignores Range on HEAD: %s', (range) => {
    expect(evaluateAssetRequest(request({ Range: range }, 'HEAD'), representation, NOW)).toEqual({
      status: 200,
    });
  });

  test.each([
    ['strong matching ETag', '"etag-one"', 206],
    ['weak matching ETag', 'W/"etag-one"', 200],
    ['different ETag', '"other"', 200],
    ['matching HTTP-date', LAST_MODIFIED, 206],
    ['stale HTTP-date', 'Wed, 15 Jul 2026 12:00:00 GMT', 200],
    ['invalid HTTP-date', '2026-07-16T12:00:00Z', 200],
  ] as const)('evaluates If-Range with a %s', (_label, ifRange, status) => {
    expect(
      evaluateAssetRequest(
        request({ Range: 'bytes=2-4', 'If-Range': ifRange }),
        representation,
        NOW
      ).status
    ).toBe(status);
  });

  test.each([
    'bytes=100-200',
    'bytes=oops',
    'bytes=0-1,3-4',
  ])('retains matching If-Range processing for invalid or unsatisfiable Range: %s', (range) => {
    expect(
      evaluateAssetRequest(request({ Range: range, 'If-Range': '"etag-one"' }), representation, NOW)
    ).toEqual({ status: 416, size: 10 });
  });

  test('evaluates preconditions before If-Range', () => {
    expect(
      evaluateAssetRequest(
        request({
          Range: 'bytes=2-4',
          'If-Range': '"etag-one"',
          'If-None-Match': 'W/"etag-one"',
        }),
        representation,
        NOW
      ).status
    ).toBe(304);
  });
});
