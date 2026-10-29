import { homepageSnapshot } from '@shared/homepage/setup';
import { initialSnapshot } from '@shared/play/commands';
import { redactReportData } from '@shared/play/reportRedaction';
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
  it('renders exported card handles without merging their identities', () => {
    const snapshot = homepageSnapshot('https://dune.zone');
    const ids = ['a', 'b'].map((digit) => `card-${digit.repeat(64)}`);
    snapshot.table.pieces[0]!.items = ids.map((id) => ({ ...snapshot.table.pieces[0]!.items[0]!, id }));
    const input = fixture();
    input.browser.snapshot.snapshot = snapshot;
    const report = parseReport(JSON.stringify({ ...input, browser: redactReportData(input.browser) }));
    expect(renderSnapshot(report, 'browser')?.table.pieces[0]?.items.map((item) => item.id)).toEqual(ids);
  });

  it('renders URL-like names and instructions while refusing the same text as artwork', () => {
    const snapshot = homepageSnapshot('https://dune.zone');
    snapshot.table.pieces[0]!.label = 'https://example.com';
    snapshot.table.pieces[0]!.items[0]!.artwork!.name = '<image onload="example">';
    snapshot.phases = [
      {
        id: 'custom',
        label: '/phase',
        symbol: '',
        instructions: 'https://example.com/rules',
        allPlayersMustBeReady: false,
        kind: 'faction',
      },
    ];
    const input = fixture();
    input.browser.snapshot.snapshot = snapshot;
    expect(renderSnapshot(parseReport(JSON.stringify(input)), 'browser')).not.toBeNull();
    snapshot.table.pieces[0]!.items[0]!.artwork!.front = 'https://example.com/track.png';
    expect(renderSnapshot(parseReport(JSON.stringify(input)), 'browser')).toBeNull();
  });

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
    expect(canRenderReport({ front: 'https://dune.zone/published/cards/card/front.jpg?v=2' })).toBe(true);
    expect(canRenderReport({ logo: '/vector/logo/atreides.svg', image: '/image/texture/001.jpg' })).toBe(true);
    for (const face of [
      'https://example.com/track.png',
      'ht\ttps://example.com/track.png',
      '\u0000https://example.com/track.png',
      '\u0007https://example.com/track.png',
      'https:\n//example.com/track.png',
      'https:example.com/track.png',
      'https:\\example.com/track.png',
      '  https://example.com/track.png',
      '/__play/games/game',
      'ftp://example.com/track.png',
      'https://dune.zone/__play/games/game',
      'data:image/svg+xml,test',
      '//example.com/image',
      '<svg onload="alert(1)">',
      '<image href="https://example.com/track.png"/>',
    ]) {
      expect(canRenderReport({ front: face })).toBe(false);
    }
  });

  it('checks artwork nested in boards, hidden pieces, phases, faction art and preload lists', () => {
    const address = 'https://example.com/track.png';
    for (const artwork of [
      { board: { definition: { properties: { area: { decals: [{ artwork: address }] } } } } },
      { hand: [{ items: [{ artwork: { back: address } }] }] },
      { peek: { piece: { items: [{ artwork: { front: address } }] } } },
      { phases: [{ symbol: address }] },
      { setup: { steps: [{ symbol: address }] } },
      { factionArtwork: { faction: { logo: address } } },
      { factionArtwork: { faction: { background: { image: address } } } },
      { factionArtwork: { faction: { troops: [{ star: address }] } } },
      { combatFaces: { faction: [{ image: address }] } },
      { cardFaces: [address] },
    ]) {
      expect(canRenderReport(artwork)).toBe(false);
    }
  });
});
