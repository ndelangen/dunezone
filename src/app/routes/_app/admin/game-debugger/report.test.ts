import { initialSnapshot } from '@shared/play/commands';
import { describe, expect, it } from 'vite-plus/test';

import { canRenderReport, comparableSnapshots, MAX_REPORT_BYTES, parseReport, renderSnapshot } from './report';

const fixture = () => ({
  server: {
    format: 'dunezone-game-report-v1',
    capturedAt: '2026-10-26T12:00:00.000Z',
    gameId: 'test-game',
    gitSha: 'test-release',
    versionId: 'test-worker',
    state: { ...initialSnapshot(), revision: 2, privatePredictions: { example: 'hidden' } },
    captures: {},
    activity: {},
    conversations: { messages: [{ text: '-redacted message, original length: 12-' }] },
    events: { game: { entries: [], more: true }, audit: { entries: [], more: false } },
  },
  browser: {
    snapshot: { snapshot: { ...initialSnapshot(), revision: 1 } },
    diagnostics: {},
    conversations: {},
    logs: [],
    droppedLogs: 2,
  },
});

describe('report import', () => {
  it('keeps private state, censored conversations and truncation evidence without converting them to a live game', () => {
    const report = parseReport(JSON.stringify(fixture()));
    expect(report.server.state.privatePredictions).toEqual({ example: 'hidden' });
    expect(report.server.conversations).toEqual(fixture().server.conversations);
    expect(report.server.events.game.more).toBe(true);
    expect(report.browser.droppedLogs).toBe(2);
    expect(renderSnapshot(report, 'browser')?.revision).toBe(1);
    expect(renderSnapshot(report, 'server')?.revision).toBe(2);
  });

  it('compares shared fields without presenting hidden server-only fields as missing browser data', () => {
    const compared = comparableSnapshots(parseReport(JSON.stringify(fixture())))!;
    expect(compared.server.revision).toBe(2);
    expect(compared.browser.revision).toBe(1);
    expect(compared.server).not.toHaveProperty('privatePredictions');
  });

  it('rejects unsupported formats, unsafe object keys, excessive size and deep data', () => {
    expect(() => parseReport('{')).toThrow();
    expect(() => parseReport(JSON.stringify({ server: { format: 'other' } }))).toThrow('supported');
    expect(() => parseReport('{"__proto__":{}}')).toThrow('unsafe');
    expect(() => parseReport(' '.repeat(MAX_REPORT_BYTES + 1))).toThrow('20 MB');
    expect(() => parseReport('['.repeat(82) + '0' + ']'.repeat(82))).toThrow('complex');
  });

  it('refuses foreign artwork and active markup before the renderer sees it', () => {
    expect(canRenderReport({ face: 'https://dune.zone/published/cards/card/front.jpg?v=2' })).toBe(true);
    expect(canRenderReport({ logo: '/vector/logo/atreides.svg', texture: '/image/texture/001.jpg' })).toBe(true);
    for (const face of [
      'https://example.com/track.png',
      '  https://example.com/track.png',
      '/__play/games/game',
      'ftp://example.com/track.png',
      'https://dune.zone/__play/games/game',
      'data:image/svg+xml,test',
      '//example.com/image',
      '<svg onload="alert(1)">',
      '<image href="https://example.com/track.png"/>',
    ]) {
      expect(canRenderReport({ face })).toBe(false);
    }
  });
});
