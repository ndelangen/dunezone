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
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) {
      throw new Error('Expected an empty normalized value');
    }
    expect(normalized.value).toBe('');
    expectTypeOf<string>().not.toMatchTypeOf<NormalizedFormattedText>();
  });

  it('keeps marks in marks-only fields while rejecting lists, hard breaks, and paragraphs', () => {
    const marked = parseFormattedText('One *bold* instruction.', 'marks-only');
    const list = parseFormattedText('- first', 'marks-only');
    const hardBreak = parseFormattedText('first\nsecond', 'marks-only');
    const paragraph = parseFormattedText('first\n\nsecond', 'marks-only');

    expect(marked.valid).toBe(true);
    expect(list.valid).toBe(false);
    expect(hardBreak.valid).toBe(false);
    expect(paragraph.valid).toBe(false);
    if (!list.valid && !hardBreak.valid && !paragraph.valid) {
      expect(list.diagnostics[0]).toMatchObject({
        code: 'marks-only-list',
        line: 1,
        column: 1,
      });
      expect(hardBreak.diagnostics[0]).toMatchObject({
        code: 'marks-only-line-break',
        line: 2,
        column: 1,
      });
      expect(paragraph.diagnostics[0]).toMatchObject({
        code: 'marks-only-line-break',
        line: 2,
        column: 1,
      });
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
      expect(invalid.diagnostics[0]).toMatchObject({
        code: 'unclosed-mark',
        line: 1,
        column: 1,
      });
    }
  });

  it('keeps ordinary prose literal and preserves supported escapes', () => {
    const parsed = parseValid(String.raw`2*3 snake_case counter-clockwise \*plain\* \-plain\- \_plain\_ \\`);

    expect(parsed.source).toBe(String.raw`2*3 snake_case counter-clockwise \*plain\* \-plain\- \_plain\_ \\`);
    expect(parsed.blocks[0]).toMatchObject({
      kind: 'paragraph',
      children: [
        {
          kind: 'text',
          value: '2*3 snake_case counter-clockwise *plain* -plain- _plain_ \\',
        },
      ],
    });
  });

  it('keeps a delimiter glued to punctuation as prose instead of opening a mark', () => {
    const parsed = parseValid('the Supplies!-cache is revealed, wait!-really (see below)');

    expect(parsed.source).toBe('the Supplies!-cache is revealed, wait!-really (see below)');
    expect(parsed.blocks[0]).toMatchObject({
      kind: 'paragraph',
      children: [
        {
          kind: 'text',
          value: 'the Supplies!-cache is revealed, wait!-really (see below)',
        },
      ],
    });

    const nested = parseValid('_-*all three*-_ still nest, and -after a space- still opens');
    expect(nested.blocks[0]).toMatchObject({
      kind: 'paragraph',
      children: [
        {
          kind: 'mark',
          mark: 'underline',
          children: [
            {
              kind: 'mark',
              mark: 'italic',
              children: [{ kind: 'mark', mark: 'bold' }],
            },
          ],
        },
        { kind: 'text', value: ' still nest, and ' },
        {
          kind: 'mark',
          mark: 'italic',
          children: [{ kind: 'text', value: 'after a space' }],
        },
        { kind: 'text', value: ' still opens' },
      ],
    });
  });

  it('treats astral Unicode letters as prose-boundary word characters', () => {
    const parsed = parseValid('𝒜*bold* and *𝒜*');

    expect(parsed.source).toBe('𝒜*bold* and *𝒜*');
    expect(parsed.blocks[0]).toMatchObject({
      kind: 'paragraph',
      children: [
        { kind: 'text', value: '𝒜*bold* and ' },
        {
          kind: 'mark',
          mark: 'bold',
          children: [{ kind: 'text', value: '𝒜' }],
        },
      ],
    });
  });

  it.each(['e\u0301*bold*', 'क्*bold*'])(
    'treats combining marks as part of the word before an opening delimiter in %s',
    (source) => {
      const parsed = parseValid(source);

      expect(parsed.source).toBe(source);
      expect(parsed.blocks[0]).toMatchObject({
        kind: 'paragraph',
        children: [{ kind: 'text', value: source }],
      });
    }
  );

  it('does not close a mark immediately before a combining sequence', () => {
    const parsed = parseFormattedText('*bold*\u0301e');

    expect(parsed.valid).toBe(false);
    if (!parsed.valid) {
      expect(parsed.diagnostics[0]).toMatchObject({
        code: 'unclosed-mark',
        line: 1,
        column: 1,
        offset: 0,
      });
    }
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

  it('keeps diagnostics aligned to the original input while normalizing the draft', () => {
    const input = 'Opening\r\n\r\n\r\n\r\n- item   \r\n  *missing';
    const parsed = parseFormattedText(input);

    expect(parsed.valid).toBe(false);
    expect(parsed.source).toBe('Opening\n\n- item\n  *missing');
    if (!parsed.valid) {
      expect(parsed.diagnostics[0]).toMatchObject({
        code: 'unclosed-mark',
        line: 6,
        column: 3,
        offset: input.indexOf('*'),
      });
    }
  });

  it.each([
    { source: '😀 text *missing', column: 8, offset: 8 },
    { source: 'e\u0301 text *missing', column: 8, offset: 8 },
    { source: 'क्ष text *missing', column: 8, offset: 9 },
    { source: '👩‍💻 text *missing', column: 8, offset: 11 },
  ])('reports an extended-grapheme column and UTF-16 offset for $source', ({ source, column, offset }) => {
    const parsed = parseFormattedText(source);

    expect(parsed.valid).toBe(false);
    if (!parsed.valid) {
      expect(parsed.diagnostics[0]).toMatchObject({
        code: 'unclosed-mark',
        line: 1,
        column,
        offset,
      });
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
