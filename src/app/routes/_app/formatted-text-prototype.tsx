import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PageLayout } from '@ui/layout/PageLayout';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  ArrowLeft,
  ArrowRight,
  Bold,
  Check,
  Eye,
  Italic,
  List,
  Pencil,
  Plus,
  TextCursorInput,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';

import {
  delimiterForMark,
  guidedBlocksFromText,
  normalizePaste,
  parseFormattedText,
  textFromGuidedBlocks,
  validateRequiredFormattedText,
} from './-formatted-text-prototype/grammar';
import type {
  FieldValidationIssue,
  FormattedBlock,
  GuidedBlock,
  InlineNode,
  Mark,
  ParsedFormattedText,
} from './-formatted-text-prototype/grammar';
import styles from './FormattedTextPrototype.module.css';

type ContextKey = 'about' | 'advantage' | 'card' | 'rulebook';
type Variant = 'guided' | 'preview-first' | 'split';

const variants: Array<{ value: Variant; label: string; key: string }> = [
  { value: 'split', label: 'Write + preview', key: 'A' },
  { value: 'guided', label: 'Guided blocks', key: 'B' },
  { value: 'preview-first', label: 'Preview first', key: 'C' },
];

const examples: Record<ContextKey, { label: string; fieldLabel: string; required: boolean; value: string }> = {
  about: {
    label: 'About',
    fieldLabel: 'Ruleset about (optional)',
    required: false,
    value:
      'The Guild of Navigators controls *interstellar travel*.\n\nIts agents prefer _quiet influence_ to open rule.',
  },
  card: {
    label: 'Card body',
    fieldLabel: 'Card body',
    required: true,
    value: '*Voice:* Name an opponent. They must -obey- your command.',
  },
  advantage: {
    label: 'Advantage',
    fieldLabel: 'Advantage text',
    required: true,
    value: 'You may keep one additional treachery card.\n\n- Reveal it only when played.\n- Discard it after use.',
  },
  rulebook: {
    label: 'Rulebook',
    fieldLabel: 'Rulebook text block',
    required: true,
    value:
      '*Storm phase*\n\nMove the storm marker -counter-clockwise- by the revealed amount. The sector it enters is _under the storm_.\n\n- Remove exposed forces.\n- Protect forces inside a stronghold.\n- Resolve nested *bold with -italic emphasis-* in order.',
  },
};

export const Route = createFileRoute('/_app/formatted-text-prototype')({
  validateSearch: (search: Record<string, unknown>): { variant: Variant } => ({
    variant: variants.some((entry) => entry.value === search.variant) ? (search.variant as Variant) : 'split',
  }),
  component: FormattedTextPrototypePage,
});

function renderInline(nodes: InlineNode[], keyPrefix: string): ReactNode {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.kind === 'text') {
      return (
        <Fragment key={key}>
          {node.value.split('\n').map((line, lineIndex) => (
            <Fragment key={`${key}-line-${lineIndex}`}>
              {lineIndex > 0 ? <br /> : null}
              {line}
            </Fragment>
          ))}
        </Fragment>
      );
    }
    const children = renderInline(node.children, key);
    if (node.mark === 'bold') {
      return <strong key={key}>{children}</strong>;
    }
    if (node.mark === 'italic') {
      return <em key={key}>{children}</em>;
    }
    return <u key={key}>{children}</u>;
  });
}

function FormattedPreview({ parsed, compact = false }: { parsed: ParsedFormattedText; compact?: boolean }) {
  return (
    <div className={styles.formattedPreview} data-compact={compact || undefined}>
      {parsed.blocks.map((block: FormattedBlock, index) => {
        if (block.kind === 'paragraph') {
          return <p key={`paragraph-${index}`}>{renderInline(block.children, `paragraph-${index}`)}</p>;
        }
        return (
          <ul key={`list-${index}`}>
            {block.items.map((item, itemIndex) => (
              <li key={`list-${index}-${itemIndex}`}>{renderInline(item.children, `list-${index}-${itemIndex}`)}</li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}

function applyMarkToTextarea(
  textarea: HTMLTextAreaElement,
  value: string,
  mark: Mark,
  onChange: (value: string) => void,
  onNotice: (message: string) => void
) {
  const currentErrors = parseFormattedText(value).errors;
  if (currentErrors.length > 0) {
    onNotice('Fix the highlighted text issue before applying more formatting.');
    return;
  }
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end);
  const delimiterMarks: Record<string, Mark> = { '*': 'bold', '-': 'italic', _: 'underline' };
  const markOrder: Record<Mark, number> = { underline: 0, italic: 1, bold: 2 };
  const isEscaped = (index: number) => {
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
      backslashes += 1;
    }
    return backslashes % 2 === 1;
  };
  let wrapperStart = start;
  let wrapperEnd = end;
  const existingMarks: Mark[] = [];
  while (wrapperStart > 0 && wrapperEnd < value.length) {
    const opening = value[wrapperStart - 1]!;
    const closing = value[wrapperEnd]!;
    const existingMark = opening === closing ? delimiterMarks[opening] : undefined;
    if (!existingMark || isEscaped(wrapperStart - 1) || isEscaped(wrapperEnd)) {
      break;
    }
    existingMarks.push(existingMark);
    wrapperStart -= 1;
    wrapperEnd += 1;
  }
  const nextMarks = existingMarks.includes(mark)
    ? existingMarks.filter((existing) => existing !== mark)
    : [...existingMarks, mark];
  nextMarks.sort((left, right) => markOrder[left] - markOrder[right]);
  const openingMarks = nextMarks.map(delimiterForMark).join('');
  const closingMarks = [...nextMarks].reverse().map(delimiterForMark).join('');
  const next = `${value.slice(0, wrapperStart)}${openingMarks}${selected}${closingMarks}${value.slice(wrapperEnd)}`;
  const issue = parseFormattedText(next).errors[0];
  if (issue) {
    onNotice(
      selected.includes('\n')
        ? 'Formatting can span a line break, but it cannot cross a paragraph or list-item boundary.'
        : `That selection cannot be formatted. ${issue.message} ${issue.suggestion}`
    );
    return;
  }
  onChange(next);
  onNotice(
    nextMarks.length === 0
      ? 'Removed formatting from the selection.'
      : 'Applied formatting in the stored order: underline, italic, then bold.'
  );
  requestAnimationFrame(() => {
    textarea.focus();
    const nextStart = wrapperStart + openingMarks.length;
    textarea.setSelectionRange(nextStart, selected.length > 0 ? nextStart + selected.length : nextStart);
  });
}

function toggleList(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (value: string) => void,
  onNotice: (message: string) => void
) {
  if (parseFormattedText(value).errors.length > 0) {
    onNotice('Fix the highlighted text issue before changing list structure.');
    return;
  }
  const start = value.lastIndexOf('\n', Math.max(0, textarea.selectionStart - 1)) + 1;
  const endBreak = value.indexOf('\n', textarea.selectionEnd);
  const end = endBreak === -1 ? value.length : endBreak;
  const lines = value.slice(start, end).split('\n');
  const nonempty = lines.filter((line) => line.length > 0);
  const remove = nonempty.length > 0 && nonempty.every((line) => line.startsWith('- '));
  const replacement = lines
    .map((line) => {
      if (line.length === 0) {
        return line;
      }
      return remove ? line.replace(/^- /, '') : line.startsWith('- ') ? line : `- ${line}`;
    })
    .join('\n');
  const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
  const issue = parseFormattedText(next).errors[0];
  if (issue) {
    onNotice(`Those lines cannot become a list. ${issue.message} ${issue.suggestion}`);
    return;
  }
  onChange(next);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start, start + replacement.length);
  });
}

function FormattingToolbar({
  textareaRef,
  value,
  onChange,
  onNotice,
  allowList = true,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  onNotice: (message: string) => void;
  allowList?: boolean;
}) {
  const os = useOs();
  const modifier = os === 'macos' || os === 'ios' ? 'command' : os === 'undetermined' ? null : 'control';
  const shortcut = (key: string) => {
    if (modifier === 'command') {
      return key === 'Shift+8' ? '⌘⇧8' : `⌘${key}`;
    }
    return modifier === 'control' ? `Ctrl+${key}` : null;
  };
  const tooltip = (label: string, key: string) => {
    const currentShortcut = shortcut(key);
    return currentShortcut ? `${label} (${currentShortcut})` : label;
  };
  const apply = (mark: Mark) => {
    if (textareaRef.current) {
      applyMarkToTextarea(textareaRef.current, value, mark, onChange, onNotice);
    }
  };
  return (
    <Group gap={4}>
      <Tooltip label={tooltip('Bold', 'B')}>
        <ActionIcon aria-label="Bold" variant="light" color="gray" onClick={() => apply('bold')}>
          <Bold size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={tooltip('Italic', 'I')}>
        <ActionIcon aria-label="Italic" variant="light" color="gray" onClick={() => apply('italic')}>
          <Italic size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={tooltip('Underline', 'U')}>
        <ActionIcon aria-label="Underline" variant="light" color="gray" onClick={() => apply('underline')}>
          <Underline size={16} />
        </ActionIcon>
      </Tooltip>
      {allowList ? (
        <Tooltip label={tooltip('Turn selected lines into a list', 'Shift+8')}>
          <ActionIcon
            aria-label="Bulleted list"
            variant="light"
            color="gray"
            onClick={() => textareaRef.current && toggleList(textareaRef.current, value, onChange, onNotice)}
          >
            <List size={16} />
          </ActionIcon>
        </Tooltip>
      ) : null}
    </Group>
  );
}

function editorKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  onChange: (value: string) => void,
  onNotice: (message: string) => void
) {
  if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const lineEndIndex = value.indexOf('\n', end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const line = value.slice(lineStart, lineEnd);
    const selectionStaysOnLine = end <= lineEnd;
    const isListItemStart = line.startsWith('- ');
    let isListContinuation = false;
    if (line.startsWith('  ') && lineStart > 0) {
      const precedingLines = value.slice(0, lineStart - 1).split('\n');
      for (let index = precedingLines.length - 1; index >= 0; index -= 1) {
        const precedingLine = precedingLines[index]!;
        if (precedingLine.startsWith('- ')) {
          isListContinuation = true;
          break;
        }
        if (!precedingLine.startsWith('  ')) {
          break;
        }
      }
    }
    if ((isListItemStart || isListContinuation) && selectionStaysOnLine) {
      event.preventDefault();
      if (event.shiftKey) {
        const next = `${value.slice(0, start)}\n  ${value.slice(end)}`;
        onChange(next);
        onNotice('Added a line break inside this list item.');
        requestAnimationFrame(() => {
          textarea.focus();
          const nextPosition = start + 3;
          textarea.setSelectionRange(nextPosition, nextPosition);
        });
      } else if (isListItemStart && line.slice(2).trim().length === 0) {
        const replacement = lineEndIndex === -1 ? '\n' : '';
        const next = `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`;
        onChange(next);
        onNotice('List ended. Continue typing a normal paragraph.');
        requestAnimationFrame(() => {
          textarea.focus();
          const nextPosition = lineStart + replacement.length;
          textarea.setSelectionRange(nextPosition, nextPosition);
        });
      } else {
        const next = `${value.slice(0, start)}\n- ${value.slice(end)}`;
        onChange(next);
        onNotice('Started the next list item.');
        requestAnimationFrame(() => {
          textarea.focus();
          const nextPosition = start + 3;
          textarea.setSelectionRange(nextPosition, nextPosition);
        });
      }
      return;
    }
  }
  if (!(event.metaKey || event.ctrlKey)) {
    return;
  }
  const key = event.key.toLowerCase();
  const mark = key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'u' ? 'underline' : null;
  if (mark) {
    event.preventDefault();
    applyMarkToTextarea(event.currentTarget, value, mark, onChange, onNotice);
  } else if ((key === '8' || key === '*') && event.shiftKey) {
    event.preventDefault();
    toggleList(event.currentTarget, value, onChange, onNotice);
  }
}

function SourceEditor({
  label,
  value,
  onChange,
  onNotice,
  minRows = 9,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onNotice: (message: string) => void;
  minRows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="end">
        <Text size="sm" fw={700}>
          {label}
        </Text>
        <FormattingToolbar textareaRef={textareaRef} value={value} onChange={onChange} onNotice={onNotice} />
      </Group>
      <Textarea
        ref={textareaRef}
        aria-label={label}
        autosize
        minRows={minRows}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => editorKeyDown(event, value, onChange, onNotice)}
        onPaste={(event) => {
          event.preventDefault();
          const pasted = normalizePaste(event.clipboardData.getData('text/plain'));
          const textarea = event.currentTarget;
          const next = `${value.slice(0, textarea.selectionStart)}${pasted}${value.slice(textarea.selectionEnd)}`;
          onChange(next);
          onNotice('Pasted as plain text. Common bullet characters became list items.');
        }}
      />
      <Text size="xs" c="dimmed">
        Select words, then use the buttons. A blank line starts a paragraph. Exact keyboard shortcuts appear in the
        button tooltips.
      </Text>
    </Stack>
  );
}

function ErrorList({ parsed, fieldIssues }: { parsed: ParsedFormattedText; fieldIssues: FieldValidationIssue[] }) {
  if (parsed.errors.length === 0 && fieldIssues.length === 0) {
    return (
      <Alert color="confirm" icon={<Check size={17} />}>
        Ready to save
      </Alert>
    );
  }
  if (parsed.errors.length === 0) {
    return (
      <Alert color="yellow" icon={<X size={17} />} title="Not ready to save">
        <Stack gap="xs">
          {fieldIssues.map((issue) => (
            <div key={issue.message}>
              <Text size="sm" fw={700}>
                {issue.message}
              </Text>
              <Text size="sm">
                <strong>Try this:</strong> {issue.suggestion}
              </Text>
            </div>
          ))}
        </Stack>
      </Alert>
    );
  }
  return (
    <Alert color="red" icon={<X size={17} />} title="This text needs attention">
      <Stack gap="md">
        {parsed.errors.map((error, index) => {
          const line = parsed.normalized.split('\n')[error.line - 1] ?? '';
          const before = line.slice(0, Math.max(0, error.column - 1));
          const problem = line.slice(Math.max(0, error.column - 1), error.column) || ' ';
          const after = line.slice(error.column);
          return (
            <div className={styles.errorDetail} key={`${error.line}-${error.column}-${index}`}>
              <Text size="sm" fw={700}>
                {error.message}
              </Text>
              <Code block className={styles.errorSource}>
                <span>{before}</span>
                <mark>{problem}</mark>
                <span>{after}</span>
              </Code>
              <Text size="sm">
                <strong>Try this:</strong> {error.suggestion}
              </Text>
              <Text size="xs" c="dimmed">
                Line {error.line}, position {error.column}
              </Text>
            </div>
          );
        })}
      </Stack>
    </Alert>
  );
}

function ContractPanel({ parsed }: { parsed: ParsedFormattedText }) {
  return (
    <Accordion variant="contained">
      <Accordion.Item value="stored">
        <Accordion.Control>
          <Group gap="xs">
            <Text size="sm" fw={700}>
              Stored value
            </Text>
            <Badge color={parsed.errors.length === 0 ? 'confirm' : 'red'} variant="light">
              {parsed.normalized.length} characters
            </Badge>
            <Badge color="gray" variant="light">
              {parsed.blocks.length} blocks
            </Badge>
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Code block className={styles.storedValue}>
            {JSON.stringify(parsed.normalized)}
          </Code>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

function SplitVariant({ label, value, parsed, fieldIssues, onChange, onNotice }: EditorVariantProps) {
  const [showPreview, setShowPreview] = useState(true);
  return (
    <div className={styles.splitVariant} data-preview={showPreview ? 'true' : 'false'}>
      <Group justify="flex-end" className={styles.splitControls}>
        <Switch
          label="Show rendered preview"
          checked={showPreview}
          onChange={(event) => setShowPreview(event.currentTarget.checked)}
        />
      </Group>
      <Paper withBorder p="lg" radius="md">
        <SourceEditor label={label} value={value} onChange={onChange} onNotice={onNotice} />
      </Paper>
      {showPreview ? (
        <Paper withBorder p="lg" radius="md">
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb="md">
            Rendered preview
          </Text>
          <FormattedPreview parsed={parsed} />
        </Paper>
      ) : null}
      <div className={styles.variantStatus}>
        <ErrorList parsed={parsed} fieldIssues={fieldIssues} />
        <ContractPanel parsed={parsed} />
      </div>
    </div>
  );
}

type EditorVariantProps = {
  label: string;
  value: string;
  parsed: ParsedFormattedText;
  fieldIssues: FieldValidationIssue[];
  onChange: (value: string) => void;
  onNotice: (message: string) => void;
};

function GuidedVariant({ value, parsed, fieldIssues, onChange, onNotice }: EditorVariantProps) {
  const blocks = guidedBlocksFromText(value);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const effectiveIndex = Math.min(selectedIndex, blocks.length - 1);
  const selected = blocks[effectiveIndex]!;
  const updateBlocks = (next: GuidedBlock[]) => onChange(textFromGuidedBlocks(next));
  const updateSelected = (text: string) => {
    updateBlocks(blocks.map((block, index) => (index === effectiveIndex ? { ...block, text } : block)));
  };

  return (
    <div className={styles.guidedVariant}>
      <Paper withBorder p="lg" radius="md">
        <Group justify="space-between" mb="md">
          <div>
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              Document structure
            </Text>
            <Title order={3}>Paragraphs and list items</Title>
          </div>
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              color="gray"
              leftSection={<Plus size={14} />}
              onClick={() => {
                updateBlocks([...blocks, { id: `block-${Date.now()}`, kind: 'paragraph', text: 'New paragraph' }]);
                setSelectedIndex(blocks.length);
              }}
            >
              Paragraph
            </Button>
            <Button
              size="xs"
              variant="light"
              color="gray"
              leftSection={<List size={14} />}
              onClick={() => {
                updateBlocks([...blocks, { id: `block-${Date.now()}`, kind: 'list-item', text: 'New list item' }]);
                setSelectedIndex(blocks.length);
              }}
            >
              List item
            </Button>
          </Group>
        </Group>
        <Stack gap="sm">
          {blocks.map((block, index) => (
            <button
              className={styles.structureRow}
              data-selected={index === effectiveIndex || undefined}
              key={`${block.id}-${index}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
            >
              {block.kind === 'paragraph' ? <TextCursorInput size={17} /> : <List size={17} />}
              <span>
                <strong>{block.kind === 'paragraph' ? 'Paragraph' : 'List item'}</strong>
                <small>{block.text || 'Empty'}</small>
              </span>
            </button>
          ))}
        </Stack>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Group justify="space-between" mb="sm">
          <Select
            label="Kind"
            value={selected.kind}
            data={[
              { value: 'paragraph', label: 'Paragraph' },
              { value: 'list-item', label: 'List item' },
            ]}
            onChange={(kind) =>
              kind &&
              updateBlocks(
                blocks.map((block, index) =>
                  index === effectiveIndex ? { ...block, kind: kind as GuidedBlock['kind'] } : block
                )
              )
            }
          />
          <ActionIcon
            aria-label="Delete selected block"
            color="red"
            variant="light"
            disabled={blocks.length === 1}
            onClick={() => {
              updateBlocks(blocks.filter((_, index) => index !== effectiveIndex));
              setSelectedIndex(Math.max(0, effectiveIndex - 1));
            }}
          >
            <Trash2 size={16} />
          </ActionIcon>
        </Group>
        <Stack gap="xs">
          <FormattingToolbar
            textareaRef={textareaRef}
            value={selected.text}
            onChange={updateSelected}
            onNotice={onNotice}
            allowList={false}
          />
          <Textarea
            ref={textareaRef}
            aria-label="Selected block text"
            autosize
            minRows={5}
            value={selected.text}
            onChange={(event) => updateSelected(event.currentTarget.value)}
            onKeyDown={(event) => editorKeyDown(event, selected.text, updateSelected, onNotice)}
          />
        </Stack>
      </Paper>

      <Paper withBorder p="lg" radius="md" className={styles.guidedPreview}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb="md">
          Live preview
        </Text>
        <FormattedPreview parsed={parsed} />
      </Paper>
      <div className={styles.guidedStatus}>
        <ErrorList parsed={parsed} fieldIssues={fieldIssues} />
        <ContractPanel parsed={parsed} />
      </div>
    </div>
  );
}

function PreviewFirstVariant({ label, value, parsed, fieldIssues, onChange, onNotice }: EditorVariantProps) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={styles.previewFirstVariant}>
      <Paper withBorder p="xl" radius="md" className={styles.previewFirstPaper}>
        <Group justify="space-between" mb="xl">
          <div>
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              {label}
            </Text>
            <Title order={2}>How readers see it</Title>
          </div>
          <Button
            variant={editing ? 'filled' : 'light'}
            color="gray"
            leftSection={editing ? <Eye size={16} /> : <Pencil size={16} />}
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? 'Close editor' : 'Edit text'}
          </Button>
        </Group>
        <FormattedPreview parsed={parsed} />
      </Paper>
      {editing ? (
        <Paper withBorder p="lg" radius="md" className={styles.previewFirstEditor}>
          <SourceEditor label={label} value={value} onChange={onChange} onNotice={onNotice} minRows={7} />
        </Paper>
      ) : null}
      <div className={styles.previewFirstStatus}>
        <ErrorList parsed={parsed} fieldIssues={fieldIssues} />
        <ContractPanel parsed={parsed} />
      </div>
    </div>
  );
}

function PrototypeSwitcher({ variant }: { variant: Variant }) {
  const navigate = useNavigate({ from: Route.fullPath });
  const index = variants.findIndex((entry) => entry.value === variant);
  const move = (offset: number) => {
    const next = variants[(index + offset + variants.length) % variants.length]!;
    navigate({ search: { variant: next.value }, replace: true });
  };

  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        move(-1);
      } else if (event.key === 'ArrowRight') {
        move(1);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  if (import.meta.env.PROD) {
    return null;
  }
  return (
    <div className={styles.switcher}>
      <ActionIcon aria-label="Previous prototype variant" variant="subtle" color="gray" onClick={() => move(-1)}>
        <ArrowLeft size={18} />
      </ActionIcon>
      <Text size="sm" fw={700}>
        {variants[index]!.key} · {variants[index]!.label}
      </Text>
      <ActionIcon aria-label="Next prototype variant" variant="subtle" color="gray" onClick={() => move(1)}>
        <ArrowRight size={18} />
      </ActionIcon>
    </div>
  );
}

function FormattedTextPrototypePage() {
  const { variant } = Route.useSearch();
  const [context, setContext] = useState<ContextKey>('about');
  const [values, setValues] = useState<Record<ContextKey, string>>(
    () =>
      Object.fromEntries(Object.entries(examples).map(([key, example]) => [key, example.value])) as Record<
        ContextKey,
        string
      >
  );
  const [notice, setNotice] = useState('Pick a field, select some text, and try the formatting controls.');
  const value = values[context];
  const parsed = useMemo(() => parseFormattedText(value), [value]);
  const onChange = (next: string) => setValues((current) => ({ ...current, [context]: next }));
  const props: EditorVariantProps = {
    label: examples[context].fieldLabel,
    value,
    parsed,
    fieldIssues: examples[context].required ? validateRequiredFormattedText(value) : [],
    onChange,
    onNotice: setNotice,
  };

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Group gap="sm">
          <TextCursorInput size={28} aria-hidden />
          <div>
            <h1>Formatted text control prototype</h1>
            <Text size="sm">Four real field shapes, one stored text contract, no database.</Text>
          </div>
        </Group>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <SegmentedControl
              aria-label="Example field"
              value={context}
              onChange={(next) => {
                setContext(next as ContextKey);
                setNotice(`Now editing the ${examples[next as ContextKey].label.toLowerCase()} example.`);
              }}
              data={Object.entries(examples).map(([key, example]) => ({ value: key, label: example.label }))}
            />
          </Toolbar.Left>
          <Toolbar.Right>
            <Badge color={parsed.errors.length === 0 ? 'confirm' : 'red'}>
              {parsed.errors.length === 0 ? 'Valid text' : `${parsed.errors.length} issues`}
            </Badge>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="md">
          <Alert color="gray" icon={<TextCursorInput size={17} />}>
            {notice}
          </Alert>
          <Box className={styles.prototypeShell}>
            {variant === 'split' ? <SplitVariant {...props} /> : null}
            {variant === 'guided' ? <GuidedVariant {...props} /> : null}
            {variant === 'preview-first' ? <PreviewFirstVariant {...props} /> : null}
          </Box>
        </Stack>
        <PrototypeSwitcher variant={variant} />
      </PageLayout.Content>
    </PageLayout>
  );
}
