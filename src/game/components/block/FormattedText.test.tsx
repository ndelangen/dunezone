// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormattedText, InlineFormattedText } from './FormattedText';

describe('FormattedText', () => {
  it('renders paragraphs, hard breaks, lists, and nested marks', () => {
    const { container } = render(
      <FormattedText value={'Opening\ncontinues with _-*every mark*-_.\n\n- First item\n- Second item'} />
    );

    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelectorAll('p br')).toHaveLength(1);
    expect(container.querySelector('p u > em > strong')?.textContent).toBe('every mark');
    expect([...container.querySelectorAll('ul > li')].map((item) => item.textContent)).toEqual([
      'First item',
      'Second item',
    ]);
  });

  it('keeps invalid mark syntax visible as literal text', () => {
    const { container } = render(<FormattedText value="An *unfinished draft" />);

    expect(container.textContent).toBe('An *unfinished draft');
  });
});

describe('InlineFormattedText', () => {
  it('keeps marks inline and turns authored line breaks into spaces', () => {
    const { container } = render(<InlineFormattedText value={'Keep the first line\nflowing with *bold words*.'} />);

    expect(container.textContent).toBe('Keep the first line flowing with bold words.');
    expect(container.querySelectorAll('p, ul, br')).toHaveLength(0);
    expect(container.querySelector('strong')?.textContent).toBe('bold words');
  });

  it.each(['First paragraph\n\nSecond paragraph', '- First item'])('rejects block content in %s', (value) => {
    expect(() => InlineFormattedText({ value })).toThrow('one paragraph without a list');
  });
});
