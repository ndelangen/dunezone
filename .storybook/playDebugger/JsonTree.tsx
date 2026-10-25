/* The manager bundles addons with the classic JSX transform, which reads `React` in scope. */
import React from 'react';
import { styled } from 'storybook/theming';

import { segment } from './diff';

/*
 * A JSON value as a tree the viewer opens branch by branch, in the manager's own colours.
 * With a filter, the tree gives way to the flat list of paths whose name or value holds the text.
 */

const Tree = styled.div(({ theme }) => ({
  fontFamily: theme.typography.fonts.mono,
  fontSize: theme.typography.size.s1,
  lineHeight: '18px',
}));

const Row = styled.div({ display: 'flex', gap: 4 });

const Toggle = styled.button(({ theme }) => ({
  all: 'unset',
  cursor: 'pointer',
  display: 'flex',
  gap: 4,
  borderRadius: 2,
  '&:hover': { background: theme.background.hoverable },
  '&:focus-visible': { outline: `1px solid ${theme.color.secondary}` },
}));

const Key = styled.span(({ theme }) => ({ color: theme.color.secondary }));
const Muted = styled.span(({ theme }) => ({ color: theme.textMutedColor }));
const Text = styled.span(({ theme }) => ({
  color: theme.color.positiveText,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
}));
const Literal = styled.span(({ theme }) => ({ color: theme.color.gold }));
const Children = styled.div(({ theme }) => ({
  marginLeft: 6,
  paddingLeft: 10,
  borderLeft: `1px solid ${theme.appBorderColor}`,
}));

const isBranch = (value: unknown): value is Record<string, unknown> | unknown[] =>
  typeof value === 'object' && value !== null;

/** A value as one line: a string quoted, a branch by its size. */
export function Preview({ value }: Readonly<{ value: unknown }>) {
  if (typeof value === 'string') {
    return <Text>{JSON.stringify(value.length > 160 ? `${value.slice(0, 160)}…` : value)}</Text>;
  }
  if (Array.isArray(value)) {
    return <Muted>[{value.length}]</Muted>;
  }
  if (isBranch(value)) {
    const keys = Object.keys(value);
    return <Muted>{`{${keys.slice(0, 4).join(', ')}${keys.length > 4 ? ', …' : ''}}`}</Muted>;
  }
  return <Literal>{value === undefined ? 'undefined' : JSON.stringify(value)}</Literal>;
}

function Node({ name, value, depth, open }: Readonly<{ name: string; value: unknown; depth: number; open: number }>) {
  const [expanded, setExpanded] = React.useState(depth < open);
  if (!isBranch(value)) {
    return (
      <Row>
        <Key>{name}</Key>
        <Muted>:</Muted>
        <Preview value={value} />
      </Row>
    );
  }
  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((entry, index) => [String(index), entry])
    : Object.entries(value);
  return (
    <div>
      <Toggle type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <Muted>{expanded ? '▾' : '▸'}</Muted>
        <Key>{name}</Key>
        <Muted>:</Muted>
        <Preview value={value} />
      </Toggle>
      {expanded && (
        <Children>
          {entries.length === 0 && <Muted>empty</Muted>}
          {entries.map(([key, entry]) => (
            <Node key={key} name={key} value={entry} depth={depth + 1} open={open} />
          ))}
        </Children>
      )}
    </div>
  );
}

/* A filter lists at most this many matches, so a broad one stays quick. */
const MATCHES = 400;

/** The paths under a value whose name or value holds the text, with the value found there. */
function matches(root: unknown, text: string) {
  const needle = text.toLowerCase();
  const found: { path: string; value: unknown }[] = [];
  const walk = (value: unknown, path: string) => {
    if (found.length >= MATCHES) {
      return;
    }
    const hit = path.toLowerCase().includes(needle);
    if (!isBranch(value)) {
      if (hit || String(value).toLowerCase().includes(needle)) {
        found.push({ path, value });
      }
      return;
    }
    if (hit && path.toLowerCase().endsWith(needle)) {
      found.push({ path, value });
    }
    for (const [key, entry] of Array.isArray(value) ? value.entries() : Object.entries(value)) {
      walk(entry, `${path}${segment(key)}`);
    }
  };
  walk(root, '');
  return found;
}

/** A JSON value as a tree opened `open` levels deep, or, with a filter, the paths that match it. */
export function JsonTree({
  value,
  filter = '',
  open = 1,
}: Readonly<{ value: unknown; filter?: string; open?: number }>) {
  if (filter.trim()) {
    const found = matches(value, filter.trim());
    return (
      <Tree>
        {found.length === 0 && <Muted>Nothing matches.</Muted>}
        {found.map(({ path, value: entry }) => (
          <Row key={path}>
            <Key>{path}</Key>
            <Muted>:</Muted>
            <Preview value={entry} />
          </Row>
        ))}
        {found.length >= MATCHES && <Muted>The first {MATCHES} matches.</Muted>}
      </Tree>
    );
  }
  if (!isBranch(value)) {
    return (
      <Tree>
        <Preview value={value} />
      </Tree>
    );
  }
  return (
    <Tree>
      {(Array.isArray(value)
        ? value.map((entry, index) => [String(index), entry] as const)
        : Object.entries(value)
      ).map(([key, entry]) => (
        <Node key={key} name={key} value={entry} depth={0} open={open} />
      ))}
    </Tree>
  );
}
