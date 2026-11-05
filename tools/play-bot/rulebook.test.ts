import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vite-plus/test';

import { claudeThought, codexThought } from './brains';
import { Rulebook, rulebookMarkdown } from './rulebook';
import type { RulebookContents } from './rulebook';

const contents: RulebookContents = {
  pageOrder: ['p1', 'p2'],
  pagesById: {
    p1: {
      title: 'Traitors',
      anchor: 'traitors',
      blockOrderByRegion: { main: ['h', 't', 'tbl'] },
      blocksById: {
        h: { kind: 'section-heading', title: 'Keeping Traitors' },
        t: { kind: 'text', text: 'Each player keeps one Traitor; Harkonnen keeps all four.' },
        tbl: {
          kind: 'reference-table',
          columnOrder: ['a', 'b'],
          columnsById: { a: { label: 'Deck' }, b: { label: 'Cards' } },
          rowOrder: ['r'],
          rowsById: { r: { cellsByColumnId: { a: 'Traitor', b: '30' } } },
        },
      },
    },
    p2: {
      title: 'Bidding',
      anchor: 'bidding',
      blockOrderByRegion: { main: ['c'] },
      blocksById: { c: { kind: 'callout', title: 'Karama', text: 'A Karama card buys a card for free.' } },
    },
  },
};

it('renders a Rulebook Edition as sections a bot can search, read by anchor and cite', () => {
  const markdown = rulebookMarkdown('Core rules', contents);
  expect(markdown).toContain('## Traitors {#traitors}');
  expect(markdown).toContain('| Traitor | 30 |');
  expect(markdown).toContain('> **Karama.** A Karama card buys a card for free.');
  const book = new Rulebook(markdown);
  expect(book.contents()).toContain('Core rules › Traitors › Keeping Traitors');
  expect(book.read('#bidding')).toContain('A Karama card buys a card for free.');
  expect(book.read('bidding')).toContain('(#bidding)');
  expect(book.search('harkonnen keeps')).toContain('Harkonnen keeps all four');
  expect(book.search('xyzzy')).toContain('Nothing in the rulebook matches');
});

it('keeps the GF9 core rules out of the prompt but within a search', () => {
  const file = path.join(import.meta.dirname, '../../content/gf9/core-rules.json');
  const { data } = JSON.parse(readFileSync(file, 'utf8')) as { data: { name: string; contents: RulebookContents } };
  const book = new Rulebook(rulebookMarkdown(data.name, data.contents));
  expect(book.sections.length).toBeGreaterThan(40);
  expect(book.search('traitor').length).toBeLessThanOrEqual(2600);
  expect(book.read('#traitors')).not.toContain('No section');
});

it('reads tokens and cost from the agent CLIs', () => {
  const claude = claudeThought(
    JSON.stringify({
      type: 'result',
      result: 'Kept Feyd.',
      num_turns: 4,
      total_cost_usd: 0.0123,
      usage: { input_tokens: 12, cache_creation_input_tokens: 3000, cache_read_input_tokens: 9000, output_tokens: 200 },
    })
  );
  expect(claude).toEqual({
    text: 'Kept Feyd.',
    usage: { inputTokens: 12, cacheWriteTokens: 3000, cacheReadTokens: 9000, outputTokens: 200, costUsd: 0.0123, turns: 4 },
  });
  const codex = codexThought(
    [
      '{"type":"thread.started"}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"Ready."}}',
      '{"type":"turn.completed","usage":{"input_tokens":5000,"cached_input_tokens":4000,"output_tokens":90}}',
    ].join('\n')
  );
  expect(codex).toEqual({ text: 'Ready.', usage: { inputTokens: 1000, cacheReadTokens: 4000, outputTokens: 90, turns: 1 } });
  expect(claudeThought('plain words')).toEqual({ text: 'plain words' });
});
