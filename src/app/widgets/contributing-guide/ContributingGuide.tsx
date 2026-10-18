import { Button, Group, NavLink, Stack } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { AsymmetricSplitLayout } from '@ui/layout/AsymmetricSplitLayout';
import { Surface } from '@ui/surface';
import { BookA, Code2, Compass, Rocket, Scale } from 'lucide-react';
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import styles from './ContributingGuide.module.css';

export type ContributingPage = 'overview' | 'code' | 'deployment' | 'glossary' | 'decisions';

/** The guide's pages in reading order, each with the one line the overview and the rail describe it by. */
export const CONTRIBUTING_PAGES = [
  {
    id: 'overview',
    to: '/contributing',
    label: 'Overview',
    summary: 'What Dune Zone is built from and how to get it running.',
    icon: Compass,
  },
  {
    id: 'code',
    to: '/contributing/code',
    label: 'How the code works',
    summary: 'Where code lives, how a page gets its data, and what keeps the parts apart.',
    icon: Code2,
  },
  {
    id: 'deployment',
    to: '/contributing/deployment',
    label: 'How it ships',
    summary: 'What happens between a merge to main and the change being live on dune.zone.',
    icon: Rocket,
  },
  {
    id: 'glossary',
    to: '/contributing/glossary',
    label: 'Technical glossary',
    summary: 'The names we give our own ideas and interface parts, so we all say the same thing.',
    icon: BookA,
  },
  {
    id: 'decisions',
    to: '/contributing/design-decisions',
    label: 'Design decisions',
    summary: 'The rules we build by, and why each one makes the product and the code better.',
    icon: Scale,
  },
] as const satisfies readonly {
  id: ContributingPage;
  to: string;
  label: string;
  summary: string;
  icon: typeof Compass;
}[];

/* PREVIEW ONLY: the two navigation looks Norbert is choosing between; the losing one goes before merge. */
export type ContributingGuideLook = 'rail' | 'tabs';
export const ContributingGuideLookContext = createContext<ContributingGuideLook>('rail');

type GuideSection = { id: string; label: string };

function PageTabs({ current }: { current: ContributingPage }) {
  return (
    <nav aria-label="Contributing guide">
      <Group gap="xs" className={styles.tabs}>
        {CONTRIBUTING_PAGES.map((page) => {
          const Icon = page.icon;
          const active = page.id === current;
          return (
            <Button
              key={page.id}
              component={Link}
              to={page.to}
              activeOptions={{ exact: true }}
              variant={active ? 'light' : 'subtle'}
              color={active ? 'selected' : 'gray'}
              leftSection={<Icon size={16} aria-hidden />}
              aria-current={active ? 'page' : undefined}
            >
              {page.label}
            </Button>
          );
        })}
      </Group>
    </nav>
  );
}

function PageRail({ current, sections }: { current: ContributingPage; sections: readonly GuideSection[] }) {
  return (
    <Surface as="aside" padding="sm" className={styles.rail}>
      <nav aria-label="Contributing guide">
        <Stack gap={0}>
          {CONTRIBUTING_PAGES.map((page) => {
            const Icon = page.icon;
            const active = page.id === current;
            return (
              <NavLink
                key={page.id}
                component={Link}
                to={page.to}
                activeOptions={{ exact: true }}
                label={page.label}
                leftSection={<Icon size={16} aria-hidden />}
                active={active}
                color="selected"
                aria-current={active ? 'page' : undefined}
                opened={active && sections.length > 0}
                childrenOffset="lg"
              >
                {active
                  ? sections.map((section) => (
                      <NavLink
                        key={section.id}
                        href={`#${section.id}`}
                        label={section.label}
                        className={styles.anchor}
                      />
                    ))
                  : null}
              </NavLink>
            );
          })}
        </Stack>
      </nav>
    </Surface>
  );
}

/**
 * The contributing guide's way between its pages, around one page's own content.
 * Callers own the page's content and the anchors of its sections;
 * this owns how a reader moves between the guide's pages.
 */
export function ContributingGuide({
  current,
  sections = [],
  children,
}: Readonly<{ current: ContributingPage; sections?: readonly GuideSection[]; children: ReactNode }>) {
  const look = useContext(ContributingGuideLookContext);
  if (look === 'tabs') {
    return (
      <Stack gap="xl">
        <PageTabs current={current} />
        {children}
      </Stack>
    );
  }
  return (
    <AsymmetricSplitLayout narrowSide="start" rail="slim" narrowFallback="stack" stackFirst="narrow">
      <AsymmetricSplitLayout.Wide>{children}</AsymmetricSplitLayout.Wide>
      <AsymmetricSplitLayout.Narrow>
        <PageRail current={current} sections={sections} />
      </AsymmetricSplitLayout.Narrow>
    </AsymmetricSplitLayout>
  );
}
