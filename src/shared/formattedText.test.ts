import { describe, expect, expectTypeOf, it } from 'vitest';

import type { NormalizedFormattedText } from './formattedText';
import { normalizeFormattedText, parseFormattedText } from './formattedText';

function parseValid(input: string) {
  const result = parseFormattedText(input);
  expect(result.valid, result.valid ? undefined : JSON.stringify(result.diagnostics)).toBe(true);
  if (!result.valid) {
    throw new Error('Expected valid formatted text');
  }
  return result;
}

describe('formatted-text core', () => {
  it('accepts an empty value without deciding field requiredness', () => {
    const parsed = parseValid('');
    const normalized = normalizeFormattedText('');

    expect(parsed.source).toBe('');
    expect(parsed.blocks).toHaveLength(0);
    expect(normalized).toEqual({ ok: true, value: '' });
    if (normalized.ok) {
      expectTypeOf(normalized.value).toEqualTypeOf<NormalizedFormattedText>();
    }
  });

  it('normalizes plain text into paragraphs, separate lists, and multiline list items', () => {
    const parsed = parseValid(
      'Opening  \r\ncontinues\r\n\r\n\r\n• first  \r\n– second\r\n\r\n— third\r\n  continuation'
    );

    expect(parsed.source).toBe('Opening\ncontinues\n\n- first\n- second\n\n- third\n  continuation');
    expect(parsed.blocks.map((block) => block.kind)).toEqual(['paragraph', 'list', 'list']);
    expect(parsed.blocks[0]).toMatchObject({
      kind: 'paragraph',
      children: [{ kind: 'text', value: 'Opening' }, { kind: 'line-break' }, { kind: 'text', value: 'continues' }],
    });
    expect(parsed.blocks[2]).toMatchObject({
      kind: 'list',
      items: [
        {
          children: [{ kind: 'text', value: 'third' }, { kind: 'line-break' }, { kind: 'text', value: 'continuation' }],
        },
      ],
    });
  });

  it('stores fully nested marks in canonical underline, italic, bold order', () => {
    const parsed = parseValid('*-_words_-*');

    expect(parsed.source).toBe('_-*words*-_');
    expect(parsed.blocks[0]).toMatchObject({
      kind: 'paragraph',
      children: [
        {
          kind: 'mark',
          mark: 'underline',
          children: [
            {
              kind: 'mark',
              mark: 'italic',
              children: [
                {
                  kind: 'mark',
                  mark: 'bold',
                  children: [{ kind: 'text', value: 'words' }],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('allows a mark across a line break but not across a block boundary', () => {
    const valid = parseValid('*line one\nline two*');
    const invalid = parseFormattedText('*paragraph one\n\nparagraph two*');

    expect(valid.blocks[0]).toMatchObject({
      kind: 'paragraph',
      children: [
        {
          kind: 'mark',
          mark: 'bold',
          children: [{ kind: 'text', value: 'line one' }, { kind: 'line-break' }, { kind: 'text', value: 'line two' }],
        },
      ],
    });
    expect(invalid.valid).toBe(false);
    if (!invalid.valid) {
      expect(invalid.diagnostics[0]).toMatchObject({ code: 'unclosed-mark', line: 1, column: 1 });
    }
  });

  it('keeps ordinary prose literal and preserves supported escapes', () => {
    const parsed = parseValid(String.raw`2*3 snake_case counter-clockwise \*plain\* \-plain\- \_plain\_ \\`);

    expect(parsed.source).toBe(String.raw`2*3 snake_case counter-clockwise \*plain\* \-plain\- \_plain\_ \\`);
    expect(parsed.blocks[0]).toMatchObject({
      kind: 'paragraph',
      children: [{ kind: 'text', value: '2*3 snake_case counter-clockwise *plain* -plain- _plain_ \\' }],
    });
  });

  it('reports crossed marks at the offending delimiter with correction guidance', () => {
    const parsed = parseFormattedText('*bold _underline* still underline_');

    expect(parsed.valid).toBe(false);
    if (!parsed.valid) {
      expect(parsed.diagnostics[0]).toMatchObject({
        code: 'crossed-mark',
        line: 1,
        column: 17,
        offset: 16,
        length: 1,
      });
      expect(parsed.diagnostics[0].suggestion).toContain('Close underline with _ before this *');
    }
  });

  it('reports list and continuation errors at their editable source locations', () => {
    const emptyItem = parseFormattedText('- ');
    const continuation = parseFormattedText('- first\n  *missing');

    expect(emptyItem.valid).toBe(false);
    if (!emptyItem.valid) {
      expect(emptyItem.diagnostics[0]).toMatchObject({
        code: 'empty-list-item',
        line: 1,
        column: 3,
        offset: 2,
        length: 0,
      });
    }
    expect(continuation.valid).toBe(false);
    if (!continuation.valid) {
      expect(continuation.diagnostics[0]).toMatchObject({
        code: 'unclosed-mark',
        line: 2,
        column: 3,
        offset: 10,
      });
      expect(continuation.diagnostics[0].suggestion).toContain('Add *');
    }
  });

  it('refuses to mint a normalized value for an invalid direct-typing draft', () => {
    const normalized = normalizeFormattedText('An *unfinished draft');

    expect(normalized.ok).toBe(false);
    if (!normalized.ok) {
      expect(normalized.diagnostics[0]).toMatchObject({
        code: 'unclosed-mark',
        line: 1,
        column: 4,
      });
      expect(normalized.diagnostics[0].message).toBe('Bold starts here but has no closing *.');
    }
  });

  it('returns hostile-looking source only as inert text nodes', () => {
    const source = '<img src=x onerror=alert(1)> <script>alert(1)</script>';
    const parsed = parseValid(source);

    expect(parsed.source).toBe(source);
    expect(parsed.blocks[0]).toMatchObject({
      kind: 'paragraph',
      children: [{ kind: 'text', value: source }],
    });
    expect(JSON.stringify(parsed.blocks)).not.toContain('"html"');
  });

  it('normalizes valid input idempotently', () => {
    const first = normalizeFormattedText('  leading\r\n\r\n*-_nested_-*\r\n');
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error('Expected a normalized value');
    }

    expect(normalizeFormattedText(first.value)).toEqual(first);
  });
});
