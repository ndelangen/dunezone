import { Stack, Text } from '@mantine/core';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { createLowlight } from 'lowlight';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

import styles from './CodeExample.module.css';

const highlighter = createLowlight({ xml, typescript, css, json, yaml });

export type CodeExampleLine = { kind: 'context' | 'added' | 'removed'; code: string };

type CodeExampleProps = Readonly<
  {
    label: string;
    language?: 'typescript' | 'css' | 'json' | 'yaml';
  } & ({ code: string; lines?: never } | { code?: never; lines: readonly CodeExampleLine[] })
>;

type HighlightNode = ReturnType<typeof highlighter.highlight>['children'][number];

function renderHighlightNode(node: HighlightNode, index: number): ReactNode {
  if (node.type === 'text') {
    return node.value;
  }
  if (node.type !== 'element') {
    return null;
  }
  const classes = node.properties.className;
  return (
    <span key={index} className={Array.isArray(classes) ? classes.join(' ') : undefined}>
      {node.children.map(renderHighlightNode)}
    </span>
  );
}

function HighlightedSource({ code, language }: Readonly<{ code: string; language: string }>) {
  return highlighter.highlight(language, code).children.map(renderHighlightNode);
}

const MARKERS = { context: ' ', added: '+', removed: '-' };

function DiffLines({ lines, language }: Readonly<{ lines: readonly CodeExampleLine[]; language: string }>) {
  return lines.map((line, index) => (
    <span className={styles.line} key={index}>
      <span
        className={styles.marker}
        data-kind={line.kind}
        aria-label={line.kind === 'context' ? undefined : line.kind}
      >
        {MARKERS[line.kind]}
      </span>
      <span>
        <HighlightedSource code={line.code || ' '} language={language} />
      </span>
    </span>
  ));
}

function useSourceOverflow(sourceRef: RefObject<HTMLElement | null>, codeRef: RefObject<HTMLElement | null>) {
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const source = sourceRef.current;
    const contents = codeRef.current;
    if (!source || !contents) {
      return;
    }
    const observer = new ResizeObserver(() => setScrollable(source.scrollWidth > source.clientWidth + 1));
    observer.observe(source);
    observer.observe(contents);
    return () => observer.disconnect();
  }, [sourceRef, codeRef]);
  return scrollable;
}

/** Callers own the source and any diff; this owns syntax tokens and readable change markers. */
export function CodeExample({ label, language = 'typescript', code, lines }: CodeExampleProps) {
  const sourceRef = useRef<HTMLElement>(null);
  const codeRef = useRef<HTMLElement>(null);
  const scrollable = useSourceOverflow(sourceRef, codeRef);
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed" ff="monospace">
        {label}
      </Text>
      <section
        ref={sourceRef}
        className={styles.source}
        aria-label={label}
        role={scrollable ? 'region' : undefined}
        tabIndex={scrollable ? 0 : undefined}
      >
        <pre>
          <code ref={codeRef}>
            {lines ? (
              <DiffLines lines={lines} language={language} />
            ) : (
              <HighlightedSource code={code} language={language} />
            )}
          </code>
        </pre>
      </section>
    </Stack>
  );
}
