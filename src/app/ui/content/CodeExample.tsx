import { Stack, Text } from '@mantine/core';
import hljs from 'highlight.js/lib/core';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

import styles from './CodeExample.module.css';

hljs.registerLanguage('xml', xml);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);

export type CodeExampleLine = { kind: 'context' | 'added' | 'removed'; code: string };

type CodeExampleProps = {
  label: string;
  language?: 'typescript' | 'css' | 'json' | 'yaml';
} & ({ code: string; lines?: never } | { code?: never; lines: readonly CodeExampleLine[] });

/** Callers own the source and any diff; this owns escaped syntax highlighting and readable change markers. */
export function CodeExample({ label, language = 'typescript', code, lines }: CodeExampleProps) {
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed" ff="monospace">
        {label}
      </Text>
      <pre className={styles.source} aria-label={label}>
        <code>
          {lines ? (
            lines.map((line, index) => (
              <span className={styles.line} key={index}>
                <span
                  className={styles.marker}
                  data-kind={line.kind}
                  aria-label={line.kind === 'context' ? undefined : line.kind}
                >
                  {line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}
                </span>
                <span dangerouslySetInnerHTML={{ __html: hljs.highlight(line.code || ' ', { language }).value }} />
              </span>
            ))
          ) : (
            <span dangerouslySetInnerHTML={{ __html: hljs.highlight(code, { language }).value }} />
          )}
        </code>
      </pre>
    </Stack>
  );
}
