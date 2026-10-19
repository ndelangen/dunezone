import { Anchor, Group, Text, Tree, getTreeExpandedState, useTree } from '@mantine/core';
import type { TreeNodeData } from '@mantine/core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SiTypescript, SiYaml } from 'react-icons/si';
import { VscFileText, VscFolder, VscFolderOpened, VscJson } from 'react-icons/vsc';

import styles from './repository.module.css';

type RepositoryEntry = { path: string; description: string; children?: RepositoryEntry[] };
const ENTRIES: RepositoryEntry[] = [
  {
    path: 'src',
    description: 'Browser application and shared source.',
    children: [
      {
        path: 'src/app',
        description: 'The application. Each folder has one role.',
        children: [
          { path: 'src/app/routes', description: 'Pages own their data and composition.' },
          {
            path: 'src/app/ui',
            description: 'Kit components render caller-supplied data.',
            children: [
              { path: 'src/app/ui/content', description: 'Words, links and statuses.' },
              { path: 'src/app/ui/control', description: 'Values and user intents.' },
              { path: 'src/app/ui/list', description: 'Sequences of items and the spacing between them.' },
              { path: 'src/app/ui/layout', description: 'Named slots and spacing.' },
              { path: 'src/app/ui/surface', description: 'Pane backgrounds and borders.' },
              { path: 'src/app/ui/block', description: 'Content in a fixed arrangement.' },
            ],
          },
          { path: 'src/app/widgets', description: 'Assemblies shared by multiple pages.' },
          { path: 'src/app/pickers', description: 'Lazy, read-only option loading.' },
          { path: 'src/app/shell', description: 'The persistent header, navigation and footer.' },
          { path: 'src/app/db', description: "The application's doorway to Convex." },
          { path: 'src/app/print', description: 'Records turned into sheets and publisher captures.' },
        ],
      },
      { path: 'src/shared', description: 'Schemas and rules used by the browser, Convex and Workers.' },
      { path: 'src/game', description: 'Game renderers for screen and print, separate from the app.' },
    ],
  },
  {
    path: 'convex',
    description: 'Database schema, server functions and migrations.',
    children: [
      {
        path: 'convex/functions.ts',
        description: 'Public and private queries, and mutations that run registered triggers.',
      },
      { path: 'convex/schema.ts', description: "The database's stored record shapes." },
    ],
  },
  {
    path: 'workers',
    description: 'Separately deployed Cloudflare Workers.',
    children: [
      { path: 'workers/publisher', description: 'Public site, SSR and artwork publishing.' },
      { path: 'workers/game', description: 'Hosted game rooms that validate player actions and hold game state.' },
      { path: 'workers/storybook', description: 'Isolated component and page previews.' },
    ],
  },
  {
    path: 'docs',
    description: 'Architecture and contributor workflows.',
    children: [{ path: 'docs/README.md', description: 'Start here for repository documentation.' }],
  },
  {
    path: '.github/workflows',
    description: 'Checks and deployment automation.',
    children: [{ path: '.github/workflows/deploy-main.yml', description: 'The production release order.' }],
  },
  { path: 'package.json', description: 'Scripts and the dependency catalogue.' },
  { path: 'AGENTS.md', description: 'Instructions and vocabulary for work in this repository.' },
];

function flatten(entries: RepositoryEntry[]): RepositoryEntry[] {
  return entries.flatMap((entry) => [entry, ...flatten(entry.children ?? [])]);
}
const BY_PATH = new Map(flatten(ENTRIES).map((entry) => [entry.path, entry]));
function nodes(entries: RepositoryEntry[]): TreeNodeData[] {
  return entries.map((entry) => ({
    value: entry.path,
    label: entry.path.split('/').at(-1),
    children: entry.children ? nodes(entry.children) : undefined,
  }));
}
const DATA = nodes(ENTRIES);

/** The repository hierarchy stays in the tree; expanding a folder reveals its children in place. */
function repositoryIcon(path: string, expanded: boolean) {
  if (!/\.[a-z]+$/.test(path)) {
    return expanded ? VscFolderOpened : VscFolder;
  }
  if (path.endsWith('.json')) {
    return VscJson;
  }
  if (/\.tsx?$/.test(path)) {
    return SiTypescript;
  }
  if (path.endsWith('.yml')) {
    return SiYaml;
  }
  return VscFileText;
}

export function RepositoryTree() {
  const tree = useTree({
    initialExpandedState: getTreeExpandedState(DATA, ['src', 'src/app']),
  });
  return (
    <Tree
      data={DATA}
      tree={tree}
      withLines
      levelOffset="md"
      aria-label="Repository files"
      selectOnClick={false}
      renderNode={({ node, expanded, hasChildren, elementProps }) => {
        const entry = BY_PATH.get(node.value)!;
        const file = /\.[a-z]+$/.test(node.value);
        const FileIcon = repositoryIcon(node.value, expanded);
        const ExpansionIcon = expanded ? ChevronDown : ChevronRight;
        return (
          <Group
            {...elementProps}
            wrap="nowrap"
            align="flex-start"
            gap="xs"
            className={`${elementProps.className} ${styles.row}`}
          >
            <span className={styles.chevron} aria-hidden>
              {hasChildren ? <ExpansionIcon size={14} /> : null}
            </span>
            <FileIcon className={styles.icon} aria-hidden />
            <Group gap="sm" className={styles.details}>
              <Anchor
                size="sm"
                ff="monospace"
                className={styles.path}
                href={`https://github.com/ndelangen/dunezone/${file ? 'blob' : 'tree'}/main/${entry.path}`}
                onClick={(event) => event.stopPropagation()}
              >
                {node.label}
                {file ? '' : '/'}
              </Anchor>
              <Text size="xs" c="dimmed" className={styles.description}>
                {entry.description}
              </Text>
            </Group>
          </Group>
        );
      }}
    />
  );
}
