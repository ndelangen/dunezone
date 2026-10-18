import { Anchor, Group, Stack } from '@mantine/core';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { BookA, Code2, Compass, Rocket, Scale } from 'lucide-react';
import type { ReactNode } from 'react';

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

type GuideSection = { id: string; label: string };

/** Callers own the selected page and navigation; this owns the guide's connected tabs and pane. */
export function ContributingGuide({
  current,
  onPageChange,
  sections = [],
  children,
}: Readonly<{
  current: ContributingPage;
  onPageChange: (page: (typeof CONTRIBUTING_PAGES)[number]) => void;
  sections?: readonly GuideSection[];
  children: ReactNode;
}>) {
  const content = (
    <Stack gap="xl">
      {sections.length > 0 ? (
        <nav aria-label="On this page">
          <Group gap="sm">
            {sections.map((section) => (
              <Anchor key={section.id} href={`#${section.id}`} size="sm" underline="always">
                {section.label}
              </Anchor>
            ))}
          </Group>
        </nav>
      ) : null}
      {children}
    </Stack>
  );
  return (
    <ConnectedTabs
      value={current}
      ariaLabel="Contributing guide"
      onValueChange={(value) => {
        const page = CONTRIBUTING_PAGES.find((entry) => entry.id === value);
        if (page) {
          onPageChange(page);
        }
      }}
      items={CONTRIBUTING_PAGES.map((page) => {
        const Icon = page.icon;
        return {
          value: page.id,
          label: page.label,
          icon: <Icon />,
          panel: page.id === current ? content : null,
        };
      })}
    />
  );
}
