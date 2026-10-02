/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { useState } from 'react';
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

function renderInput(value: string, onChange = vi.fn(), error?: string, profile?: 'prose' | 'marks-only') {
  render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <FormattedTextInput label="Text" value={value} onChange={onChange} error={error} profile={profile} />
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

it('rejects paragraphs in marks-only fields without rejecting marks', () => {
  renderInput('First *bold* line\nsecond line', vi.fn(), undefined, 'marks-only');

  expect(screen.getByText(/not line breaks or paragraphs/)).toBeTruthy();
});

it('passes the edited string through the control membrane', () => {
  const onChange = renderInput('Opening');

  fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), {
    target: { value: 'Opening words' },
  });

  expect(onChange).toHaveBeenCalledExactlyOnceWith('Opening words');
});

function EditableInput({ initialValue }: { initialValue: string }) {
  const [value, onChange] = useState(initialValue);
  return <FormattedTextInput label="Text" value={value} onChange={onChange} />;
}

it.each([
  ['Bold', '*'],
  ['Italic', '-'],
  ['Underline', '_'],
])('formats the selected words with %s and toggles them off', (label, delimiter) => {
  render(
    <MantineProvider>
      <EditableInput initialValue="Control Arrakeen now" />
    </MantineProvider>
  );
  const field = screen.getByRole('textbox', { name: 'Text' }) as HTMLTextAreaElement;
  field.setSelectionRange(8, 16);
  fireEvent.click(screen.getByRole('button', { name: label }));
  expect(field.value).toBe(`Control ${delimiter}Arrakeen${delimiter} now`);
  expect(document.activeElement).toBe(field);
  fireEvent.click(screen.getByRole('button', { name: label }));
  expect(field.value).toBe('Control Arrakeen now');
});

it('keeps paragraphs and list prefixes valid when formatting spans multiple lines', () => {
  render(
    <MantineProvider>
      <EditableInput initialValue={'First paragraph\n\n- One item\n- Another item'} />
    </MantineProvider>
  );
  const field = screen.getByRole('textbox', { name: 'Text' }) as HTMLTextAreaElement;
  field.setSelectionRange(0, field.value.length);
  fireEvent.keyDown(field, { key: 'i', ctrlKey: true });
  expect(field.value).toBe('-First paragraph-\n\n- -One item-\n- -Another item-');
  expect(field.getAttribute('aria-invalid')).not.toBe('true');
  fireEvent.keyDown(field, { key: 'i', metaKey: true });
  expect(field.value).toBe('First paragraph\n\n- One item\n- Another item');
});

it('does not change read-only text through formatting shortcuts', () => {
  const onChange = vi.fn();
  render(
    <MantineProvider>
      <FormattedTextInput label="Text" value="Arrakeen" onChange={onChange} readOnly />
    </MantineProvider>
  );
  const field = screen.getByRole('textbox', { name: 'Text' }) as HTMLTextAreaElement;
  field.setSelectionRange(0, 8);
  fireEvent.keyDown(field, { key: 'b', ctrlKey: true });
  expect(onChange).not.toHaveBeenCalled();
});

it('formats a selection containing separate bold spans without unbalancing them', () => {
  render(
    <MantineProvider>
      <EditableInput initialValue="*Arrakeen* and *Carthag*" />
    </MantineProvider>
  );
  const field = screen.getByRole('textbox', { name: 'Text' }) as HTMLTextAreaElement;
  field.setSelectionRange(0, field.value.length);
  fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
  expect(field.value).toBe('**Arrakeen* and *Carthag**');
  expect(field.getAttribute('aria-invalid')).not.toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
  expect(field.value).toBe('*Arrakeen* and *Carthag*');
});

it('does not mistake delimiters outside a mixed selection for a single enclosing mark', () => {
  render(
    <MantineProvider>
      <EditableInput initialValue="*Arrakeen* and *Carthag*" />
    </MantineProvider>
  );
  const field = screen.getByRole('textbox', { name: 'Text' }) as HTMLTextAreaElement;
  field.setSelectionRange(1, field.value.length - 1);
  fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
  expect(field.value).toBe('**Arrakeen* and *Carthag**');
  expect(field.getAttribute('aria-invalid')).not.toBe('true');
});

it('suggests the glossary word for an avoided one without marking the field invalid', () => {
  renderInput('Ship three forces.');

  const field = screen.getByRole('textbox', { name: 'Text' });
  expect(screen.getByRole('note', { name: 'Wording suggestions' }).textContent).toContain(
    'Dune Zone says troop (opens in a new tab) rather than “forces”. You can keep your wording.'
  );
  expect(screen.getByRole('link', { name: /^troop\b/ }).getAttribute('href')).toBe('/glossary#troop');
  const note = screen.getByRole('note', { name: 'Wording suggestions' });
  expect(field.getAttribute('aria-describedby')?.split(' ')).toContain(note.id);
  expect(field.getAttribute('aria-invalid')).not.toBe('true');
});

it('shows no wording suggestions when the caller turns them off', () => {
  render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <FormattedTextInput label="Text" value="Ship three forces." onChange={vi.fn()} termHints={false} />
    </MantineProvider>
  );

  expect(screen.queryByRole('note', { name: 'Wording suggestions' })).toBeNull();
});

it('fixes the wording on request and can put the draft back', () => {
  render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <EditableInput initialValue="Forces fight in combat." />
    </MantineProvider>
  );
  const field = screen.getByRole('textbox', { name: 'Text' }) as HTMLTextAreaElement;

  fireEvent.click(screen.getByRole('button', { name: 'Fix wording' }));
  expect(field.value).toBe('Troops fight in battle.');
  expect(screen.getByRole('note', { name: 'Wording suggestions' }).textContent).toContain('rather than “fight”');
  expect(screen.queryByRole('button', { name: 'Fix wording' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(field.value).toBe('Forces fight in combat.');
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
});

it('drops the undo once the author edits the fixed draft', () => {
  render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <EditableInput initialValue="Ship three forces." />
    </MantineProvider>
  );
  const field = screen.getByRole('textbox', { name: 'Text' }) as HTMLTextAreaElement;

  fireEvent.click(screen.getByRole('button', { name: 'Fix wording' }));
  expect(screen.getByRole('note', { name: 'Wording suggestions' }).textContent).toContain('Wording fixed.');
  fireEvent.change(field, { target: { value: 'Ship three troops now.' } });
  expect(screen.queryByRole('note', { name: 'Wording suggestions' })).toBeNull();
});
