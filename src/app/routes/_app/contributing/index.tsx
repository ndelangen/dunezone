import { Anchor, Badge, Button, Code, CopyButton, Group, List, SimpleGrid, Stack, Text } from '@mantine/core';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { PageLayout } from '@ui/layout/PageLayout';
import { Bullets } from '@ui/list/Bullets';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import {
  ArrowLeftRight,
  BookOpenCheck,
  Boxes,
  Braces,
  Cable,
  ClipboardList,
  Code2,
  Columns3,
  Database,
  Dices,
  FileCode2,
  FolderTree,
  Globe,
  HardDrive,
  Image,
  Images,
  Info,
  Layers,
  ListChecks,
  MousePointerClick,
  Network,
  PanelsTopLeft,
  Rocket,
  Sparkles,
  Split,
  TableProperties,
  Terminal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { SiBun, SiCloudflareworkers, SiConvex, SiMantine, SiStorybook, SiTanstack } from 'react-icons/si';

import { publicPageHead } from '@app/routes/publicPage';

import { AnatomyLesson } from './AnatomyLesson';
import { CodeChecks } from './checks';
import { DataTeaching } from './dataTeaching';
import { DESIGN_DECISIONS } from './designDecisions';
import type { DecisionGuard, DesignDecision } from './designDecisions';
import { GuideExperiment } from './experiments';
import {
  CommentExamples,
  ContractExample,
  DeleteExample,
  FloatingExamples,
  NamedSlotsExample,
  PublishingDiagram,
  SlugExample,
  ToolbarExample,
} from './illustrations';
import styles from './index.module.css';
import { KitCategories } from './kitCategories';
import { SUBJECTS, validateGuideSearch } from './navigation';
import type { GuideSubject } from './navigation';
import { ReleaseTeaching } from './releaseTeaching';
import { RepositoryTree } from './repository';
import { TECHNICAL_GLOSSARY } from './technicalTerms';
import type { TechnicalTerm } from './technicalTerms';
/* Vite+ brand mark from https://viteplus.dev/icon.svg. */
import vitePlusLogo from './viteplus.svg';

const TOPIC_ICONS: Record<GuideSubject, Record<string, LucideIcon>> = {
  start: { intro: Info, stack: Layers, setup: Terminal },
  code: { repository: FolderTree, testing: ListChecks },
  data: { queries: Split, lifecycle: ArrowLeftRight },
  ui: { page: PanelsTopLeft, membrane: Cable },
  deployment: { release: Rocket, publishing: Images, schema: TableProperties },
  glossary: { structure: Boxes, assets: Image, data: Database },
  decisions: {
    reading: ClipboardList,
    components: Braces,
    layout: Columns3,
    data: Network,
    look: MousePointerClick,
    code: FileCode2,
  },
};

export const Route = createFileRoute('/_app/contributing/')({
  ssr: true,
  validateSearch: validateGuideSearch,
  beforeLoad: ({ search }) => {
    if (search.glossary === 'board') {
      throw redirect({ to: '/glossary', hash: 'product-terms' });
    }
  },
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

function ContributingPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack gap="sm">
          <PageTitle title="Contributing" />
          <Text size="lg">A guide to the code, deployment, technical names and design decisions.</Text>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="xl">
          {SUBJECTS.map((subject) => {
            const selected = search[subject.id] ?? subject.topics[0]!.slug;
            return (
              <Section
                key={subject.id}
                id={`guide-${subject.id}`}
                className={styles.subject}
                title={subject.title}
                action={
                  subject.id === 'glossary' ? (
                    <Anchor href="/glossary#product-terms">Product glossary</Anchor>
                  ) : undefined
                }
              >
                <ConnectedTabs
                  stickyRail
                  value={selected}
                  ariaLabel={`${subject.title} topics`}
                  onValueChange={(topic) =>
                    void navigate({
                      to: '/contributing',
                      search: (previous) => ({ ...previous, [subject.id]: topic }),
                      replace: true,
                      resetScroll: false,
                    })
                  }
                  items={subject.topics.map((topic) => {
                    const Icon = TOPIC_ICONS[subject.id][topic.slug]!;
                    return {
                      value: topic.slug,
                      label: topic.title,
                      icon: <Icon />,
                      panel: topic.slug === selected ? <TopicContent subject={subject.id} topic={topic.slug} /> : null,
                    };
                  })}
                />
              </Section>
            );
          })}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

const REPOSITORY = 'https://github.com/ndelangen/dunezone';

const STACK = [
  {
    icon: <SiTanstack size={22} />,
    title: 'TanStack Router and Start',
    href: 'https://tanstack.com/',
    detail: 'File-based routes and public server rendering.',
  },
  {
    icon: <SiConvex size={22} />,
    title: 'Convex',
    href: 'https://www.convex.dev/',
    detail: 'Database functions, reactive queries, authentication and publication jobs.',
  },
  {
    icon: <SiMantine size={22} />,
    title: 'Mantine',
    href: 'https://mantine.dev/',
    detail: 'Provides the controls used in our kit.',
  },
  {
    icon: <SiStorybook size={22} />,
    title: 'Storybook',
    href: 'https://storybook.js.org/',
    detail: 'Shows components and pages on their own, with browser tests for their interactions.',
  },
  {
    icon: <SiBun size={22} />,
    title: 'Bun',
    href: 'https://bun.sh/',
    detail: 'Installs dependencies and runs project scripts.',
  },
  {
    icon: <img src={vitePlusLogo} width={22} height={22} alt="" />,
    title: 'Vite+',
    href: 'https://viteplus.dev/',
    detail: 'Builds, tests, lints and formats through the vp commands.',
  },
  {
    icon: <SiCloudflareworkers size={22} />,
    title: 'Cloudflare Workers',
    href: 'https://workers.cloudflare.com/',
    detail: 'Hosts the site, image publisher, game rooms and Storybook.',
  },
];

const SETUP_PROMPT = `Set up this Dune Zone checkout for local development.

Read AGENTS.md and docs/README.md first. Inspect the Git state and preserve local work. In a Codex-managed worktree, run bun run worktree:setup and resolve any stale-base report before editing.

Use the Node version in .nvmrc and install dependencies with bun install --frozen-lockfile. Prepare .env.e2e.local from its example as the local development guide describes. Ask for missing secrets. Do not guess their values or print existing secrets.

Check that Docker is available, then run bun run app:dev --local with disposable test fixtures. Start Storybook in a separate terminal. Use the local backend, without deploying or modifying production data.

Verify that the app and a Storybook page render. Report their URLs and explain anything that prevents them from running. Keep this task to environment setup.`;

const PLACES = [
  {
    icon: <Globe size={18} />,
    title: 'Site and publisher Worker',
    detail:
      'Serves dune.zone and renders public pages on the server. Its scheduled publisher processes image jobs every five minutes.',
  },
  {
    icon: <Dices size={18} />,
    title: 'Game Worker',
    detail: 'Runs a room for each hosted game and stores its live table state.',
  },
  {
    icon: <Database size={18} />,
    title: 'Convex',
    detail: 'Stores application records and publication jobs, and handles authentication.',
  },
  { icon: <HardDrive size={18} />, title: 'R2 storage', detail: 'Keeps one current image per published asset.' },
  { icon: <BookOpenCheck size={18} />, title: 'Storybook Worker', detail: 'Serves storybook.dune.zone.' },
];

function TopicContent({ subject, topic }: Readonly<{ subject: GuideSubject; topic: string }>) {
  switch (subject) {
    case 'start':
      return <StartContent topic={topic} />;
    case 'code':
      return <CodeContent topic={topic} />;
    case 'data':
      return <DataTeaching topic={topic as 'queries' | 'lifecycle'} />;
    case 'ui':
      return <InterfaceContent topic={topic} />;
    case 'deployment':
      return <DeploymentContent topic={topic} />;
    case 'glossary':
      return <GlossaryContent topic={topic} />;
    case 'decisions':
      return <DecisionsContent topic={topic} />;
  }
}

function StartContent({ topic }: Readonly<{ topic: string }>) {
  if (topic === 'stack') {
    return (
      <Bullets gap="xl" columns={{ base: 1, sm: 2 }}>
        {STACK.map((item) => (
          <Bullets.Item
            key={item.title}
            icon={item.icon}
            title={<Anchor href={item.href}>{item.title}</Anchor>}
            detail={item.detail}
          />
        ))}
      </Bullets>
    );
  }
  if (topic === 'setup') {
    return (
      <Stack gap="xl">
        <Text>Local mode starts a disposable backend with test sign-in and sample data.</Text>
        <List type="ordered" spacing="sm">
          <List.Item>
            Clone <Anchor href={REPOSITORY}>the repository</Anchor>, run <Code>nvm use</Code>, then{' '}
            <Code>bun install --frozen-lockfile</Code>.
          </List.Item>
          <List.Item>
            Set up <Code>.env.e2e.local</Code> from <Code>.env.e2e.local.example</Code> as described in the{' '}
            <Anchor href={`${REPOSITORY}/blob/main/docs/README.md#disposable-local-app-development`}>
              local development guide
            </Anchor>
            .
          </List.Item>
          <List.Item>
            Start the app with <Code>bun run app:dev --local</Code>. It needs Docker for the local backend; add{' '}
            <Code>--data=snapshot</Code> to load an anonymised copy of the published content instead of the sample data.
            Downloading that snapshot also needs GitHub CLI sign-in.
          </List.Item>
          <List.Item>
            Open Storybook with <Code>bun run storybook</Code> to see every component and page on its own.
          </List.Item>
          <List.Item>
            Before a pull request, run <Code>bun run check</Code>, <Code>bun run typecheck</Code> and{' '}
            <Code>bun run test</Code>. Run the affected browser stories with <Code>bun run storybook:test</Code>.
          </List.Item>
        </List>
        <Section
          title="Agent setup prompt"
          action={
            <CopyButton value={SETUP_PROMPT}>
              {({ copied, copy }) => (
                <Button variant="light" color="selected" onClick={copy}>
                  {copied ? 'Copied' : 'Copy agent prompt'}
                </Button>
              )}
            </CopyButton>
          }
        >
          <Text component="pre" ff="monospace" size="sm" className={styles.prompt}>
            {SETUP_PROMPT}
          </Text>
        </Section>
      </Stack>
    );
  }
  return (
    <Stack gap="md">
      <Text>
        Dune Zone is open source. You can work on the application, improve its artwork or help explain how its parts fit
        together.
      </Text>
      <Text>
        Start with local setup, then use the repository map to find the code you need. The glossary explains the names
        you will see in that code.
      </Text>
      <Text>
        The examples run in your browser. You can change their inputs without saving records or deploying code.
      </Text>
      <Anchor href={REPOSITORY}>Open the source repository</Anchor>
    </Stack>
  );
}

function CodeContent({ topic }: Readonly<{ topic: string }>) {
  return topic === 'repository' ? (
    <RepositoryTree />
  ) : (
    <Stack gap="xl">
      <GuideExperiment kind="tests" />
      <Section title="Automated checks">
        <CodeChecks />
      </Section>
    </Stack>
  );
}

function InterfaceContent({ topic }: Readonly<{ topic: string }>) {
  return topic === 'page' ? (
    <AnatomyLesson>
      <GuideExperiment kind="page" />
      {TECHNICAL_GLOSSARY.filter((term) => term.topic === 'page').map((term) => (
        <div key={term.id} data-anatomy-term={term.id}>
          <TermSection term={term} />
        </div>
      ))}
    </AnatomyLesson>
  ) : (
    <GuideExperiment kind="membrane" />
  );
}

function DeploymentContent({ topic }: Readonly<{ topic: string }>) {
  if (topic === 'release') {
    return (
      <Stack gap="xl">
        <ReleaseTeaching />
        {TECHNICAL_GLOSSARY.filter((term) => term.topic === 'deployment').map((term) => (
          <TermSection key={term.id} term={term} />
        ))}
        <Section title="Where it runs">
          <Bullets gap="md" columns={{ base: 1, sm: 2 }}>
            {PLACES.map((place) => (
              <Bullets.Item key={place.title} icon={place.icon} title={place.title} detail={place.detail} />
            ))}
          </Bullets>
        </Section>
      </Stack>
    );
  }
  return (
    <Stack gap="xl">
      <GuideExperiment kind={topic === 'schema' ? 'migration' : 'publishing'} />
      <Anchor href={`${REPOSITORY}/blob/main/docs/deployment.md`}>Read the deployment guide</Anchor>
    </Stack>
  );
}

function GlossaryContent({ topic }: Readonly<{ topic: string }>) {
  return (
    <Stack gap="xl">
      {topic === 'assets' ? <PublishingDiagram /> : null}
      {topic === 'structure' ? <KitCategories /> : null}
      <Stack gap="lg">
        {TECHNICAL_GLOSSARY.filter((term) => term.topic === topic).map((term) => (
          <TermSection key={term.id} term={term} />
        ))}
      </Stack>
    </Stack>
  );
}

function DecisionTopicExample({ topic }: Readonly<{ topic: string }>) {
  if (topic === 'layout') {
    return <GuideExperiment kind="layout" />;
  }
  if (topic === 'look') {
    return <GuideExperiment kind="meaning" />;
  }
  return null;
}

function DecisionsContent({ topic }: Readonly<{ topic: string }>) {
  if (topic === 'reading') {
    return (
      <Stack gap="md">
        <Text>Each decision gives a rule, explains why we use it and links to its source in the repository.</Text>
        <Text>
          The badge tells you how we enforce the rule. Some have a lint rule, test or check script. Others show a
          warning during development or need a person to check them in review.
        </Text>
        <Text>Where an automated check covers only part of a rule, the entry says what still needs review.</Text>
      </Stack>
    );
  }
  return (
    <Stack gap="xl">
      <DecisionTopicExample topic={topic} />
      <Stack gap="xl">
        {DESIGN_DECISIONS.filter((decision) => decision.group === topic).map((decision) => (
          <DecisionSection key={decision.id} decision={decision} />
        ))}
      </Stack>
    </Stack>
  );
}

function TermSection({ term }: Readonly<{ term: TechnicalTerm }>) {
  const sentenceEnd = term.explanation.indexOf('. ');
  const definition = sentenceEnd < 0 ? term.explanation : term.explanation.slice(0, sentenceEnd + 1);
  const detail = sentenceEnd < 0 ? null : term.explanation.slice(sentenceEnd + 2);
  return (
    <Section
      id={`term-${term.id}`}
      className={styles.term}
      title={term.term}
      action={term.code ? <Code className={styles.code}>{term.code}</Code> : undefined}
    >
      <Stack gap="xs">
        <Text fw={500}>{definition}</Text>
        {detail ? <Text c="dimmed">{detail}</Text> : null}
        {term.id === 'slug' ? <SlugExample /> : null}
        <Text size="sm" c="dimmed">
          Code location:{' '}
          <Anchor
            className={styles.location}
            href={'https://github.com/ndelangen/dunezone/blob/main/' + term.where}
            size="sm"
            ff="monospace"
          >
            {term.where}
          </Anchor>
        </Text>
        {term.avoid?.length ? (
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              Names to avoid
            </Text>
            {term.avoid.map((word) => (
              <Badge key={word} variant="outline" color="gray" size="sm" tt="none">
                {word}
              </Badge>
            ))}
          </Group>
        ) : null}
      </Stack>
    </Section>
  );
}

const REPOSITORY_FILES = 'https://github.com/ndelangen/dunezone/blob/main';

const GUARD_LABELS: Record<DecisionGuard, string> = {
  lint: 'Lint rule',
  check: 'Check script',
  test: 'Test',
  warning: 'Warns in development',
  review: 'Checked in review',
};

function Benefit({
  icon,
  label,
  children,
  audience,
}: Readonly<{ icon: ReactNode; label: string; children: string; audience: 'users' | 'contributors' }>) {
  return (
    <Stack gap="xs">
      <Text size="sm" fw={700} className={styles.benefitLabel} data-audience={audience}>
        {icon}
        {label}
      </Text>
      <Text size="sm" c="dimmed">
        {children}
      </Text>
    </Stack>
  );
}

function DecisionSection({ decision }: Readonly<{ decision: DesignDecision }>) {
  return (
    <Section
      id={decision.id}
      className={styles.decision}
      title={decision.title}
      action={
        <StatusBadge tone={decision.guard === 'review' ? 'neutral' : 'positive'}>
          {GUARD_LABELS[decision.guard]}
        </StatusBadge>
      }
    >
      <Stack gap="sm">
        <Text fw={500} className={styles.rule}>
          {decision.rule}
        </Text>
        <DecisionExample id={decision.id} />
        <SimpleGrid type="container" cols={{ base: 1, '30rem': 2 }} spacing="md">
          <Benefit icon={<Sparkles size={14} aria-hidden />} label="For users" audience="users">
            {decision.product}
          </Benefit>
          <Benefit icon={<Code2 size={14} aria-hidden />} label="For contributors" audience="contributors">
            {decision.code}
          </Benefit>
        </SimpleGrid>
        <Text size="sm" c="dimmed">
          {decision.guardName ? (
            <>
              Checked by <Code>{decision.guardName}</Code>.{' '}
            </>
          ) : null}
          {decision.guardScope ? <>{decision.guardScope} </> : null}
          <Anchor href={`${REPOSITORY_FILES}/${decision.source}`} size="sm">
            Read the full decision
          </Anchor>
        </Text>
      </Stack>
    </Section>
  );
}

function DecisionExample({ id }: Readonly<{ id: string }>) {
  switch (id) {
    case 'layouts-own-spacing':
      return <NamedSlotsExample />;
    case 'floating-ui':
      return <FloatingExamples />;
    case 'held-delete':
      return <DeleteExample />;
    case 'one-primary':
      return <ToolbarExample />;
    case 'contracts':
      return <ContractExample />;
    case 'comments-earned':
      return <CommentExamples />;
    default:
      return null;
  }
}
