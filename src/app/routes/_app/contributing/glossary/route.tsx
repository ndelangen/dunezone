import { Anchor, Badge, Code, Group, Select, Stack, Text } from '@mantine/core';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { SearchRefine } from '@ui/control/SearchRefine';
import { AsymmetricSplitLayout } from '@ui/layout/AsymmetricSplitLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { Toolbar } from '@ui/surface/Toolbar';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { publicPageHead } from '@app/routes/publicPage';
import { ContributingGuide } from '@app/widgets/contributing-guide/ContributingGuide';

import { PageAnatomy } from './PageAnatomy';
import styles from './route.module.css';
import { TECHNICAL_GLOSSARY, TECHNICAL_TOPICS } from './terms';
import type { TechnicalTerm, TechnicalTopic } from './terms';
import { TintBoard } from './TintBoard';

export const Route = createFileRoute('/_app/contributing/glossary')({
  ssr: true,
  head: () =>
    publicPageHead({
      name: 'Technical glossary',
      pathname: '/contributing/glossary',
      description:
        "The names Dune Zone's code gives its own ideas and interface parts, explained for new contributors.",
      social: { kind: 'Dune Zone', shape: 'portrait' },
    }),
  component: TechnicalGlossaryPage,
});

const REPOSITORY_FILES = 'https://github.com/ndelangen/dunezone/blob/main';

/* The topics with a picture that demonstrates the term the reader points at. */
const PICTURES: Partial<Record<TechnicalTopic, (term: string | null) => ReactNode>> = {
  page: (term) => <PageAnatomy term={term} />,
  board: (term) => <TintBoard term={term} />,
};

/* A search matches the term, how the code spells it, or a word it replaces. */
function matches(term: TechnicalTerm, needle: string) {
  return (
    !needle || [term.term, term.code ?? '', ...(term.avoid ?? [])].some((word) => word.toLowerCase().includes(needle))
  );
}

function TermSection({ term, onPoint }: Readonly<{ term: TechnicalTerm; onPoint: (term: string | null) => void }>) {
  return (
    <div
      onMouseEnter={() => onPoint(term.id)}
      onMouseLeave={() => onPoint(null)}
      onFocus={() => onPoint(term.id)}
      onBlur={() => onPoint(null)}
    >
      <Section
        id={term.id}
        className={styles.term}
        title={term.term}
        action={term.code ? <Code className={styles.code}>{term.code}</Code> : undefined}
      >
        <Stack gap="xs">
          <Text>{term.explanation}</Text>
          <Text size="sm" c="dimmed">
            Lives in{' '}
            <Anchor href={`${REPOSITORY_FILES}/${term.where}`} size="sm" ff="monospace">
              {term.where}
            </Anchor>
          </Text>
          {term.avoid?.length ? (
            <Group gap="xs">
              <Text size="sm" fw={600}>
                Say {term.term} instead of
              </Text>
              {term.avoid.map((word) => (
                <Badge key={word} variant="outline" color="gray" size="sm" tt="none" className={styles.avoided}>
                  {word}
                </Badge>
              ))}
            </Group>
          ) : null}
        </Stack>
      </Section>
    </div>
  );
}

/* The topic's terms on one pane, beside its picture when it has one; on a phone the picture goes and the terms keep the pane. */
function TopicPane({ topic, terms, flip }: Readonly<{ topic: TechnicalTopic; terms: TechnicalTerm[]; flip: boolean }>) {
  const [pointed, setPointed] = useState<string | null>(null);
  const picture = PICTURES[topic];
  const list = (
    <Stack gap="lg">
      {terms.map((term) => (
        <TermSection key={term.id} term={term} onPoint={setPointed} />
      ))}
    </Stack>
  );
  return (
    <>
      {picture ? (
        <AsymmetricSplitLayout narrowSide={flip ? 'end' : 'start'} narrowFallback="hide">
          <AsymmetricSplitLayout.Wide>{list}</AsymmetricSplitLayout.Wide>
          <AsymmetricSplitLayout.Narrow>
            <div className={styles.visual}>{picture(pointed)}</div>
          </AsymmetricSplitLayout.Narrow>
        </AsymmetricSplitLayout>
      ) : (
        list
      )}
    </>
  );
}

function TechnicalGlossaryPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [onlyTopic, setOnlyTopic] = useState<TechnicalTopic | null>(null);
  const needle = query.trim().toLowerCase();
  const topics = TECHNICAL_TOPICS.filter((topic) => !onlyTopic || topic.id === onlyTopic)
    .map((topic) => ({
      topic,
      terms: TECHNICAL_GLOSSARY.filter((term) => term.topic === topic.id && matches(term, needle)),
    }))
    .filter((entry) => entry.terms.length > 0);
  const topicSelect = (label?: string) => (
    <Select
      className={label ? undefined : styles.topicSegment}
      variant={label ? 'default' : 'unstyled'}
      aria-label={label ? undefined : 'Topic'}
      label={label}
      placeholder="All topics"
      clearable
      data={TECHNICAL_TOPICS.map((topic) => ({ value: topic.id, label: topic.label }))}
      value={onlyTopic}
      onChange={(value) => setOnlyTopic(value as TechnicalTopic | null)}
    />
  );

  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack gap="sm" maw="48rem">
          <PageTitle eyebrow="Contributing" title="Technical glossary" />
          <Text size="lg">
            These are the names we use in code, reviews and conversation. Look up a feature such as tint, find the
            component behind a page region, or follow a term to the code that owns it.
          </Text>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Center>
            <SearchRefine
              label="Glossary filters"
              search={{
                value: query,
                onChange: setQuery,
                onCommit: () => undefined,
                label: 'Search the technical glossary',
                placeholder: 'Search, for example tint or PageHead',
              }}
              refine={{ label: 'Refine glossary', active: onlyTopic ? 1 : 0, content: topicSelect('Topic') }}
            >
              {topicSelect()}
            </SearchRefine>
          </Toolbar.Center>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <ContributingGuide
          onPageChange={(page) => void navigate({ to: page.to })}
          current="glossary"
          sections={topics.map(({ topic }) => ({ id: `topic-${topic.id}`, label: topic.label }))}
        >
          <Stack gap="xl">
            {topics.length === 0 ? <Text c="dimmed">No term matches that search.</Text> : null}
            {topics.map(({ topic, terms }, index) => (
              <Section
                key={topic.id}
                id={`topic-${topic.id}`}
                className={styles.topic}
                title={topic.label}
                description={topic.summary}
              >
                <TopicPane topic={topic.id} terms={terms} flip={index % 2 === 1} />
              </Section>
            ))}
          </Stack>
        </ContributingGuide>
      </PageLayout.Content>
    </PageLayout>
  );
}
