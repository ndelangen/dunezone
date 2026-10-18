import { Anchor, Code, List, Stack, Text } from '@mantine/core';
import { Link, createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { PageLayout } from '@ui/layout/PageLayout';
import { Bullets } from '@ui/list/Bullets';
import { Surface } from '@ui/surface';
import {
  AppWindow,
  Blocks,
  Brush,
  Database,
  FileCode2,
  Frame,
  Hand,
  Printer,
  Puzzle,
  Server,
  Share2,
  ShieldCheck,
} from 'lucide-react';

import { publicPageHead } from '@app/routes/publicPage';
import { ContributingGuide } from '@app/widgets/contributing-guide/ContributingGuide';

export const Route = createFileRoute('/_app/contributing/code')({
  ssr: true,
  head: () =>
    publicPageHead({
      name: 'How the Dune Zone code works',
      pathname: '/contributing/code',
      description: 'Where Dune Zone code lives, how a page gets its data, and the rules that keep the parts apart.',
      social: { kind: 'Dune Zone', shape: 'portrait' },
    }),
  component: CodePage,
});

const DOCS = 'https://github.com/ndelangen/dunezone/blob/main';

const FOLDERS = [
  {
    icon: <FileCode2 size={18} />,
    path: 'src/app/routes',
    detail: 'One file per page. A page owns its data and its own composition.',
  },
  {
    icon: <Blocks size={18} />,
    path: 'src/app/ui',
    detail: 'The kit: six categories of components that render what they are given.',
  },
  {
    icon: <Puzzle size={18} />,
    path: 'src/app/widgets',
    detail: 'An assembly two or more pages install whole, such as the faction editor.',
  },
  {
    icon: <Hand size={18} />,
    path: 'src/app/pickers',
    detail: 'The one kind of control that loads its own options, lazily and read-only.',
  },
  {
    icon: <Frame size={18} />,
    path: 'src/app/shell',
    detail: 'The chrome every page sits in: header band, navigation and footer.',
  },
  {
    icon: <Database size={18} />,
    path: 'src/app/db',
    detail: 'The doorway to Convex. Nothing else in the app may import it.',
  },
  {
    icon: <Printer size={18} />,
    path: 'src/app/print',
    detail: 'The glue that turns records into printable sheets and publisher captures.',
  },
  {
    icon: <Share2 size={18} />,
    path: 'src/shared',
    detail: 'Schemas and rules the app, Convex and the Workers all read.',
  },
  {
    icon: <Brush size={18} />,
    path: 'src/game',
    detail: 'Print-faithful renderers for cards, tokens, boards and rulebooks.',
  },
  { icon: <Server size={18} />, path: 'convex', detail: 'Server functions, the schema and migrations.' },
  {
    icon: <AppWindow size={18} />,
    path: 'workers',
    detail: 'Cloudflare Workers: the site and publisher, the game rooms, Storybook.',
  },
];

const GUARDS = [
  {
    check: '.oxlintrc.json',
    detail: 'Keeps fetching and navigation out of the kit and Convex out of everything but src/app/db.',
  },
  { check: 'bun run check:app-layout', detail: 'Holds src/app to its closed set of folders.' },
  { check: 'bun run check:breakpoints', detail: 'Holds every media query to the 30, 48 and 62rem ladder.' },
  { check: 'bun run check:css-orphans', detail: 'Finds stylesheets and classes nothing uses.' },
  { check: 'rendererIsolation.test.ts', detail: 'Keeps Mantine and the app out of the game renderers.' },
  { check: 'PageLayout.architecture.test.ts', detail: 'Makes every page mount PageLayout itself.' },
  { check: 'bun run storybook:test', detail: 'Runs every story in a real browser, with its play steps as tests.' },
];

const SECTIONS = [
  { id: 'folders', label: 'Where code lives' },
  { id: 'data', label: 'How a page gets its data' },
  { id: 'pages', label: 'How a page is put together' },
  { id: 'guards', label: 'What keeps it in shape' },
  { id: 'more', label: 'Read more' },
];

function CodePage() {
  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack gap="sm" maw="48rem">
          <PageTitle eyebrow="Contributing" title="How the code works" />
          <Text size="lg">
            One repository holds the web app, the Convex backend and the Cloudflare Workers. Each part has one home, and
            a few firm rules keep them from leaning on each other.
          </Text>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <ContributingGuide current="code" sections={SECTIONS}>
          <Stack gap="xl">
            <Section
              id="folders"
              title="Where code lives"
              description="Every folder answers one question. When none fits, the code is in the wrong place."
            >
              <Surface padding="lg">
                <Bullets gap="xl" columns={{ base: 1, sm: 2 }}>
                  {FOLDERS.map((folder) => (
                    <Bullets.Item
                      key={folder.path}
                      icon={folder.icon}
                      title={<Code>{folder.path}</Code>}
                      detail={folder.detail}
                    />
                  ))}
                </Bullets>
              </Surface>
            </Section>
            <Section
              id="data"
              title="How a page gets its data"
              description="There is no client cache to manage: Convex keeps every open page up to date."
            >
              <Surface padding="lg">
                <List type="ordered" spacing="sm">
                  <List.Item>
                    The route's <Code>loader</Code> asks Convex once through <Code>db.query()</Code>, so the first paint
                    has data. Public pages run this on the server and arrive as HTML.
                  </List.Item>
                  <List.Item>
                    The page calls a hook from <Code>src/app/db</Code>, which subscribes to the same query. From then on
                    Convex pushes every change while the page is open.
                  </List.Item>
                  <List.Item>
                    A page holds at most one Convex query for its data, plus the signed-in profile. The query shapes the
                    data for the page, so components below it only receive.
                  </List.Item>
                  <List.Item>
                    Changes go through mutation hooks. Convex checks the arguments, then the shared Zod schema in{' '}
                    <Code>src/shared</Code> decides whether the change is valid.
                  </List.Item>
                </List>
              </Surface>
            </Section>
            <Section
              id="pages"
              title="How a page is put together"
              description="Pages compose; components render what they are given."
            >
              <Surface padding="lg">
                <Stack gap="sm">
                  <Text>
                    Every page mounts <Code>PageLayout</Code> and fills its slots: <Code>Header</Code> for the title on
                    the artwork band, <Code>Toolbar</Code> for search and actions, and <Code>Content</Code> for the
                    rest.
                  </Text>
                  <Text>
                    The page's own JSX lives in its route file. It is built from the kit, whose components never fetch
                    and never navigate on their own: they take data and slots, and report what the reader did through
                    callbacks. That is what lets every one of them appear in a story.
                  </Text>
                  <Text>
                    The{' '}
                    <Anchor component={Link} to="/contributing/glossary">
                      technical glossary
                    </Anchor>{' '}
                    names each part, and the{' '}
                    <Anchor component={Link} to="/contributing/design-decisions">
                      design decisions
                    </Anchor>{' '}
                    explain why the rules are what they are.
                  </Text>
                </Stack>
              </Surface>
            </Section>
            <Section
              id="guards"
              title="What keeps it in shape"
              description="A rule we can check is a rule nobody has to remember."
            >
              <Surface padding="lg">
                <Bullets gap="md">
                  {GUARDS.map((guard) => (
                    <Bullets.Item
                      key={guard.check}
                      icon={<ShieldCheck size={18} />}
                      title={<Code>{guard.check}</Code>}
                      detail={guard.detail}
                    />
                  ))}
                </Bullets>
              </Surface>
            </Section>
            <Section id="more" title="Read more" description="The full documentation lives beside the code.">
              <Surface padding="lg">
                <List spacing="xs">
                  <List.Item>
                    <Anchor href={`${DOCS}/docs/architecture.md`}>Architecture</Anchor>
                  </List.Item>
                  <List.Item>
                    <Anchor href={`${DOCS}/docs/state-management.md`}>State management</Anchor> and{' '}
                    <Anchor href={`${DOCS}/docs/data-layer.md`}>the data layer</Anchor>
                  </List.Item>
                  <List.Item>
                    <Anchor href={`${DOCS}/docs/routing.md`}>Routing</Anchor>
                  </List.Item>
                  <List.Item>
                    <Anchor href={`${DOCS}/AGENTS.md#component-taxonomy`}>The component taxonomy</Anchor>
                  </List.Item>
                  <List.Item>
                    <Anchor href={`${DOCS}/docs/technical/operational-traps.md`}>Operational traps</Anchor>, the tooling
                    behaviours that look like success while being wrong
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
