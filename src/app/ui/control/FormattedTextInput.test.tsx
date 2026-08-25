/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, it, vi } from 'vitest';

import { FormattedTextInput } from './FormattedTextInput';

window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

afterEach(cleanup);

function renderInput(value: string, onChange = vi.fn(), error?: string) {
  render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <FormattedTextInput label="Text" value={value} onChange={onChange} error={error} />
    </MantineProvider>
  );
  return onChange;
}

it('reports the source location, explanation, and repair for an invalid draft', () => {
  renderInput('*unfinished');

  const field = screen.getByRole('textbox', { name: 'Text' });
  const error = document.getElementById(field.getAttribute('aria-describedby')!);
  expect(error?.textContent).toContain('Line 1, column 1: Bold starts here but has no closing *.');
  expect(error?.textContent).toContain('Suggestion: Add * after the words you want formatted, or remove this *.');
  expect(field.getAttribute('aria-invalid')).toBe('true');
});

it('keeps field-specific validation while formatted text is valid', () => {
  renderInput('', vi.fn(), 'Text is required');

  expect(screen.getByText('Text is required')).toBeTruthy();
});

it('passes the edited string through the control membrane', () => {
  const onChange = renderInput('Opening');

  fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), {
    target: { value: 'Opening words' },
  });

  expect(onChange).toHaveBeenCalledExactlyOnceWith('Opening words');
});
