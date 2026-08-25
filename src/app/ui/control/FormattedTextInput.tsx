import { Textarea } from '@mantine/core';
import type { TextareaProps } from '@mantine/core';
import { parseFormattedText } from '@shared/formattedText';
import type { FormattedTextParseResult } from '@shared/formattedText';
import { Fragment } from 'react';
import type { ReactNode } from 'react';

type FormattedTextDiagnostic = Extract<FormattedTextParseResult, { valid: false }>['diagnostics'][number];

export interface FormattedTextInputProps extends Omit<TextareaProps, 'defaultValue' | 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
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
 * A Textarea for the shared formatted-text language, with repair guidance beside an invalid draft.
 *
 * The caller owns the draft and any field-specific validation such as requiredness.
 * This control owns syntax validation so every author sees the same source location, explanation, and suggested repair.
 */
export function FormattedTextInput({ value, onChange, error, ...props }: FormattedTextInputProps) {
  const parsed = parseFormattedText(value);
  const diagnostics = parsed.valid ? [] : parsed.diagnostics;

  return (
    <Textarea
      {...props}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      error={validationError(diagnostics, error)}
    />
  );
}
