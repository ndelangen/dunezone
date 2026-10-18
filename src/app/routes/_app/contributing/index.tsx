import { Anchor, Code, List, Stack, Text } from '@mantine/core';
import { Link, createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { PageLayout } from '@ui/layout/PageLayout';
import { Bullets } from '@ui/list/Bullets';
import { Surface } from '@ui/surface';
import { ChevronRight, Cloud, Database, FlaskConical, Layers, Route as RouteIcon, Wrench } from 'lucide-react';

import { publicPageHead } from '@app/routes/publicPage';
import { CONTRIBUTING_PAGES, ContributingGuide } from '@app/widgets/contributing-guide/ContributingGuide';

export const Route = createFileRoute('/_app/contributing/')({
  ssr: true,
  head: () =>
    publicPageHead({
      name: 'Contributing to Dune Zone',
      pathname: '/contributing',
      description:
        'How Dune Zone is built and shipped, the names we use for its parts, and the design decisions behind them.',
      social: { kind: 'Dune Zone', shape: 'portrait' },
    }),
  component: ContributingPage,
});

const REPOSITORY = 'https://github.com/ndelangen/dunezone';

const STACK = [
  {
    icon: <RouteIcon size={18} />,
    title: 'TanStack Router and Start',
    detail: 'One file per page under src/app/routes; public pages also render on the server.',
  },
  {
    icon: <Database size={18} />,
    title: 'Convex',
    detail: 'The database and server functions. Pages subscribe to queries, so what they show stays live.',
  },
  {
    icon: <Layers size={18} />,
    title: 'Mantine, under our own kit',
    detail: 'Controls come from Mantine; everything a page is built from lives in our kit under src/app/ui.',
  },
  {
    icon: <FlaskConical size={18} />,
    title: 'Storybook',
    detail: 'Every kit component and every page has stories, and the stories double as browser tests.',
  },
  {
    icon: <Wrench size={18} />,
    title: 'Bun and Vite+',
    detail: 'Bun installs and runs the scripts; Vite+ builds, tests, lints and formats.',
  },
  {
    icon: <Cloud size={18} />,
    title: 'Cloudflare Workers',
    detail: 'Serve the site, render asset images on a schedule, and run hosted games.',
  },
];

const SECTIONS = [
  { id: 'guide', label: 'The guide' },
  { id: 'stack', label: 'What it is built from' },
  { id: 'start', label: 'Get it running' },
];

function ContributingPage() {
  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack gap="sm" maw="48rem">
          <PageTitle eyebrow="Help build Dune Zone" title="Contributing" />
          <Text size="lg">
            Dune Zone is open source. This guide explains how the code is put together, how a change reaches the site,
            what we call its parts, and the decisions we hold ourselves to.
          </Text>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <ContributingGuide current="overview" sections={SECTIONS}>
          <Stack gap="xl">
            <Section id="guide" title="The guide">
              <Surface padding="lg">
                <Bullets gap="xl" columns={{ base: 1, sm: 2 }}>
                  {CONTRIBUTING_PAGES.filter((page) => page.id !== 'overview').map((page) => {
                    const Icon = page.icon;
                    return (
                      <Bullets.Item
                        key={page.id}
                        icon={<Icon size={18} />}
                        title={page.label}
                        detail={page.summary}
                        trailing={<ChevronRight size={16} aria-hidden />}
                        renderLink={(content) => (
                          <Anchor component={Link} to={page.to} c="inherit" underline="never">
                            {content}
                          </Anchor>
                        )}
                      />
                    );
                  })}
                </Bullets>
              </Surface>
            </Section>
            <Section id="stack" title="What it is built from">
              <Surface padding="lg">
                <Bullets gap="xl" columns={{ base: 1, sm: 2 }}>
                  {STACK.map((item) => (
                    <Bullets.Item key={item.title} icon={item.icon} title={item.title} detail={item.detail} />
                  ))}
                </Bullets>
              </Surface>
            </Section>
            <Section
              id="start"
              title="Get it running"
              description="Each launch gets its own throwaway backend with test sign-in and sample data."
            >
              <Surface padding="lg">
                <List type="ordered" spacing="sm">
                  <List.Item>
                    Clone <Anchor href={REPOSITORY}>the repository</Anchor>, run <Code>nvm use</Code>, then{' '}
                    <Code>bun install</Code>.
                  </List.Item>
                  <List.Item>
                    Start the app with <Code>bun run app:dev --local</Code>. It needs Docker for the local backend; add{' '}
                    <Code>--data=snapshot</Code> to load an anonymised copy of the published content instead of the
                    sample data.
                  </List.Item>
                  <List.Item>
                    Open Storybook with <Code>bun run storybook</Code> to see every component and page on its own.
                  </List.Item>
                  <List.Item>
                    Before a pull request, run <Code>bun run check</Code>, <Code>bun run typecheck</Code> and{' '}
                    <Code>bun run test</Code>.
                  </List.Item>
                </List>
              </Surface>
            </Section>
          </Stack>
        </ContributingGuide>
      </PageLayout.Content>
    </PageLayout>
  );
}
