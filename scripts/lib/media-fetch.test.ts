import { describe, expect, it } from 'vitest';

import { storedState } from './media-fetch';

const record = { sha256: 'a'.repeat(64), bytes: 12 };

function head(status: number, headers: Record<string, string> = {}) {
  return { status, headers: new Headers(headers) };
}

describe('storedState', () => {
  it('treats a 404 as absent', () => {
    expect(storedState(head(404), record)).toBe('absent');
  });

  it('treats the bundled static fallback, a 200 without integrity headers, as absent', () => {
    expect(storedState(head(200, { 'Content-Type': 'image/webp' }), record)).toBe('absent');
  });

  it('treats a 200 naming the record as stored', () => {
    expect(storedState(head(200, { 'X-Media-SHA256': record.sha256, 'X-Media-Bytes': '12' }), record)).toBe('stored');
  });

  it('refuses a stored variant whose integrity disagrees', () => {
    expect(() => storedState(head(200, { 'X-Media-SHA256': 'b'.repeat(64), 'X-Media-Bytes': '12' }), record)).toThrow(
      /disagrees/
    );
  });

  it('refuses any other status', () => {
    expect(() => storedState(head(403), record)).toThrow(/403/);
  });
});
