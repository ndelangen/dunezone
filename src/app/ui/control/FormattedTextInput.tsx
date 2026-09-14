import { Group, Stack, Textarea } from '@mantine/core';
import type { TextareaProps } from '@mantine/core';
import { parseFormattedText } from '@shared/formattedText';
import type { FormattedTextParseResult, FormattedTextProfile } from '@shared/formattedText';
import { Bold, Italic, Underline } from 'lucide-react';
import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { IconAction } from './IconAction';

/** The one sentence every formatted field's help can say about what it accepts, kept beside the control that parses it. */
export const FORMATTED_TEXT_SYNTAX_HELP =
  'Wrap words in _underscores_ to underline them, -hyphens- for italic, and *asterisks* for bold.';

type FormattedTextDiagnostic = Extract<FormattedTextParseResult, { valid: false }>['diagnostics'][number];

export interface FormattedTextInputProps extends Omit<TextareaProps, 'defaultValue' | 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  profile?: FormattedTextProfile;
}

function Diagnostic({ diagnostic }: { diagnostic: FormattedTextDiagnostic }) {
  return (
    <span>
      Line {diagnostic.line}, column {diagnostic.column}: {diagnostic.message}
      <br />
      Suggestion: {diagnostic.suggestion}
    </span>
  );
}

function validationError(diagnostics: readonly FormattedTextDiagnostic[], fieldError: ReactNode): ReactNode {
  if (diagnostics.length === 0) {
    return fieldError;
  }
  return (
    <>
      {diagnostics.map((diagnostic, index) => (
        <Fragment key={`${diagnostic.code}-${diagnostic.offset}`}>
          {index > 0 ? (
            <>
              <br />
              <br />
            </>
          ) : null}
          <Diagnostic diagnostic={diagnostic} />
        </Fragment>
      ))}
      {fieldError ? (
        <>
          <br />
          <br />
          {fieldError}
        </>
      ) : null}
    </>
  );
}

/**
 * Edits the shared formatted-text language with selection tools and repair guidance for invalid drafts.
 *
 * The caller owns the draft and any field-specific validation such as requiredness.
 * This control owns syntax validation so every author sees the same source location, explanation, and suggested repair.
 */
export function FormattedTextInput({ value, onChange, error, profile = 'prose', ...props }: FormattedTextInputProps) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ value: string; start: number; end: number } | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    pendingSelection.current = null;
    if (selection?.value === value) {
      fieldRef.current?.focus();
      fieldRef.current?.setSelectionRange(selection.start, selection.end);
    }
  }, [value]);

  const formatSelection = (delimiter: '*' | '-' | '_') => {
    const field = fieldRef.current;
    if (!field || props.disabled || props.readOnly) {
      return;
    }
    const start = field.selectionStart;
    const end = field.selectionEnd;
    if (start === end) {
      return;
    }
    const selected = value.slice(start, end);
    const wrapped = value[start - 1] === delimiter && value[end] === delimiter;
    const replacement = wrapped
      ? selected
      : selected
          .split('\n')
          .map((line, index) => {
            const atLineStart = index > 0 || start === 0 || value[start - 1] === '\n';
            const listPrefix = atLineStart && line.startsWith('- ') ? '- ' : '';
            const body = line.slice(listPrefix.length);
            const words = body.trim();
            if (!words) {
              return line;
            }
            const marked = words.startsWith(delimiter) && words.endsWith(delimiter) && words.length > 2;
            return (
              listPrefix + body.replace(words, () => (marked ? words.slice(1, -1) : `${delimiter}${words}${delimiter}`))
            );
          })
          .join('\n');
    const from = wrapped ? start - 1 : start;
    const to = wrapped ? end + 1 : end;
    const nextValue = value.slice(0, from) + replacement + value.slice(to);
    pendingSelection.current = {
      value: nextValue,
      start: from,
      end: from + replacement.length,
    };
    onChange(nextValue);
  };
  const parsed = parseFormattedText(value, profile);
  const diagnostics = parsed.valid ? [] : parsed.diagnostics;

  return (
    <Textarea
      {...props}
      inputContainer={(input) => (
        <Stack gap={4}>
          <Group gap={4} role="group" aria-label="Text formatting">
            {[
              { label: 'Bold', delimiter: '*' as const, icon: <Bold size={16} aria-hidden /> },
              { label: 'Italic', delimiter: '-' as const, icon: <Italic size={16} aria-hidden /> },
              { label: 'Underline', delimiter: '_' as const, icon: <Underline size={16} aria-hidden /> },
            ].map((tool) => (
              <IconAction
                key={tool.label}
                label={tool.label}
                tooltip={hasSelection ? tool.label : `Select text to apply ${tool.label.toLowerCase()}`}
                icon={tool.icon}
                intent="neutral"
                emphasis="quiet"
                size="sm"
                disabled={props.disabled || props.readOnly}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => formatSelection(tool.delimiter)}
              />
            ))}
          </Group>

          {props.inputContainer ? props.inputContainer(input) : input}
        </Stack>
      )}
      ref={fieldRef}
      value={value}
      onSelect={(event) => {
        setHasSelection(event.currentTarget.selectionStart !== event.currentTarget.selectionEnd);
        props.onSelect?.(event);
      }}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey) {
          return;
        }
        const delimiter = { b: '*', i: '-', u: '_' }[event.key.toLowerCase()] as '*' | '-' | '_' | undefined;
        if (delimiter) {
          event.preventDefault();
          formatSelection(delimiter);
        }
      }}
      onChange={(event) => onChange(event.currentTarget.value)}
      error={validationError(diagnostics, error)}
    />
  );
}
