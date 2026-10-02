import { Group, Stack, Textarea } from '@mantine/core';
import type { TextareaProps } from '@mantine/core';
import { parseFormattedText } from '@shared/formattedText';
import type { FormattedTextParseResult, FormattedTextProfile } from '@shared/formattedText';
import { distinctTermHints, fixTermWording } from '@shared/glossary/hints';
import { Bold, Italic, Underline } from 'lucide-react';
import { Fragment, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { TermHints } from '../content/TermHints';
import { IconAction } from './IconAction';

/** The one sentence every formatted field's help can say about what it accepts, kept beside the control that parses it. */
export const FORMATTED_TEXT_SYNTAX_HELP =
  'Wrap words in _underscores_ to underline them, -hyphens- for italic, and *asterisks* for bold.';

type FormattedTextDiagnostic = Extract<FormattedTextParseResult, { valid: false }>['diagnostics'][number];

export interface FormattedTextInputProps extends Omit<TextareaProps, 'defaultValue' | 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  profile?: FormattedTextProfile;
  /** False turns off the glossary's wording suggestions, for text that is not about the game. */
  termHints?: boolean;
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

function isEntireMark(source: string, delimiter: '*' | '-' | '_') {
  if (!source.startsWith(delimiter) || !source.endsWith(delimiter)) {
    return false;
  }
  const parsed = parseFormattedText(source, 'marks-only');
  const paragraph = parsed.blocks[0];
  const node = paragraph?.kind === 'paragraph' && paragraph.children.length === 1 ? paragraph.children[0] : null;
  return (
    parsed.valid && node?.kind === 'mark' && node.mark === { '*': 'bold', '-': 'italic', _: 'underline' }[delimiter]
  );
}

/**
 * Edits the shared formatted-text language with selection tools and repair guidance for invalid drafts.
 *
 * The caller owns the draft and any field-specific validation such as requiredness.
 * This control owns syntax validation so every author sees the same source location, explanation, and suggested repair.
 * It also suggests the glossary's word wherever the draft uses one the glossary avoids;
 * the suggestions never block a save.
 */
export function FormattedTextInput({
  value,
  onChange,
  error,
  profile = 'prose',
  termHints = true,
  ...props
}: FormattedTextInputProps) {
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
    const wrapped = start > 0 && end < value.length && isEntireMark(value.slice(start - 1, end + 1), delimiter);
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
            const marked = isEntireMark(words, delimiter);
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
  const hints = useMemo(() => (termHints ? distinctTermHints(value) : []), [termHints, value]);
  const hintsId = useId();
  /* The draft from before the last fix, offered back only while the field still holds exactly what the fix wrote. */
  const [lastFix, setLastFix] = useState<{ before: string; after: string } | null>(null);
  const undoable = lastFix?.after === value && !props.disabled && !props.readOnly;
  const fixWording = () => {
    const after = fixTermWording(value);
    setLastFix({ before: value, after });
    onChange(after);
  };
  /*
   * Mantine owns the textarea's aria-describedby and overwrites any value passed in, so the hint id is merged after each render.
   * React leaves the attribute alone until Mantine's own value changes, and this runs again whenever it does.
   */
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) {
      return;
    }
    const ids = (field.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id && id !== hintsId);
    if (hints.length > 0 || undoable) {
      ids.push(hintsId);
    }
    if (ids.length > 0) {
      field.setAttribute('aria-describedby', ids.join(' '));
    } else {
      field.removeAttribute('aria-describedby');
    }
  });
  const parsed = parseFormattedText(value, profile);
  const diagnostics = parsed.valid ? [] : parsed.diagnostics;

  return (
    <Textarea
      {...props}
      inputContainer={(input) => (
        <Stack gap="xs">
          <Group gap="xs" role="group" aria-label="Text formatting">
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
          <TermHints
            hints={hints}
            id={hintsId}
            onFix={props.disabled || props.readOnly ? undefined : fixWording}
            onUndo={undoable ? () => onChange(lastFix.before) : undefined}
          />
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
