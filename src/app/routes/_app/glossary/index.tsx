import { Badge, Group, Select, Stack, Text } from '@mantine/core';
import { GLOSSARY, GLOSSARY_TOPICS } from '@shared/glossary/terms';
import type { GlossaryTerm, GlossaryTopic } from '@shared/glossary/terms';
import { createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { TopicIcon } from '@ui/content/TopicIcon';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import { SearchRefine } from '@ui/control/SearchRefine';
import { AsymmetricSplitLayout } from '@ui/layout/AsymmetricSplitLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { useState } from 'react';

import { pageHead } from '@app/routes/pageTitle';

import styles from './index.module.css';
import { TopicVisual } from './TopicVisual';

export const Route = createFileRoute('/_app/glossary/')({
  head: () => pageHead('Glossary'),
  component: GlossaryPage,
});

const TOPIC_ICONS: Record<GlossaryTopic, TopicIconTopic> = {
  pieces: 'troops',
  turn: 'turn',
  battle: 'battle',
  board: 'board',
  spice: 'spice',
  cards: 'cards',
  factions: 'factions',
};

/* A search matches the preferred term or any word it replaces, so a reader can look up the word they were about to use. */
function matches(term: GlossaryTerm, needle: string) {
  return (
    !needle ||
    term.term.toLowerCase().includes(needle) ||
    term.avoid.some((avoided) =>
      [avoided.word, ...(avoided.forms ?? [])].some((word) => word.toLowerCase().includes(needle))
    )
  );
}

function SourceBadge({ term }: { term: GlossaryTerm }) {
  return (
    <StatusBadge tone={term.source === 'rulebook' ? 'neutral' : 'brand'}>
      {term.source === 'rulebook' ? 'Rulebook' : 'Dune Zone'}
    </StatusBadge>
  );
}

function TermBody({ term }: { term: GlossaryTerm }) {
  return (
    <Stack gap="xs">
      <Text>{term.explanation}</Text>
      <Text c="dimmed" size="sm">
        {term.reason}
      </Text>
      {term.avoid.length > 0 ? (
        <Group gap="xs">
          <Text size="sm" fw={600}>
            Say {term.term.toLowerCase()} instead of
          </Text>
          {term.avoid.map((avoided) => (
            <Badge key={avoided.word} variant="outline" color="gray" size="sm" tt="none" className={styles.avoided}>
              {avoided.word}
            </Badge>
          ))}
        </Group>
      ) : null}
    </Stack>
  );
}

function TermSection({ term }: { term: GlossaryTerm }) {
  return (
    <Section id={term.id} className={styles.term} title={term.term} action={<SourceBadge term={term} />}>
      <TermBody term={term} />
    </Section>
  );
}

type TopicProps = { topic: GlossaryTopic; terms: GlossaryTerm[]; flip: boolean };

/* The topic's picture and its terms side by side on one pane, the picture swapping sides from one topic to the next. */
function TopicPane({ topic, terms, flip }: TopicProps) {
  return (
    <Surface padding="lg">
      <AsymmetricSplitLayout narrowSide={flip ? 'end' : 'start'} stackFirst="narrow">
        <AsymmetricSplitLayout.Wide>
          <Stack gap="lg">
            {terms.map((term) => (
              <TermSection key={term.id} term={term} />
            ))}
          </Stack>
        </AsymmetricSplitLayout.Wide>
        <AsymmetricSplitLayout.Narrow>
          <div className={styles.visual}>
            <TopicVisual topic={topic} />
          </div>
        </AsymmetricSplitLayout.Narrow>
      </AsymmetricSplitLayout>
    </Surface>
  );
}

function GlossaryPage() {
  const [query, setQuery] = useState('');
  const [onlyTopic, setOnlyTopic] = useState<GlossaryTopic | null>(null);
  const needle = query.trim().toLowerCase();
  const topics = GLOSSARY_TOPICS.filter((topic) => !onlyTopic || topic.id === onlyTopic)
    .map((topic) => ({
      topic,
      terms: GLOSSARY.filter((term) => term.topic === topic.id && matches(term, needle)),
    }))
    .filter((entry) => entry.terms.length > 0);
  const topicSelect = (label?: string) => (
    <Select
      aria-label={label ? undefined : 'Topic'}
      label={label}
      placeholder="All topics"
      clearable
      data={GLOSSARY_TOPICS.map((topic) => ({ value: topic.id, label: topic.label }))}
      value={onlyTopic}
      onChange={(value) => setOnlyTopic(value as GlossaryTopic | null)}
    />
  );

  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack gap="sm" maw="48rem">
          <PageTitle eyebrow="Words we use" title="Glossary" />
          <Text size="lg">
            Every game idea on Dune Zone has one name. We follow the 2019 rulebook, except that we say troops where it
            says forces. When you write on Dune Zone we point out the other words, and you can always keep your own.
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
                label: 'Search the glossary',
                placeholder: 'Search, for example forces or combat',
              }}
              refine={{ label: 'Refine glossary', active: onlyTopic ? 1 : 0, content: topicSelect('Topic') }}
            >
              {topicSelect()}
            </SearchRefine>
          </Toolbar.Center>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="xl">
          {topics.length === 0 ? <Text c="dimmed">No term matches that search.</Text> : null}
          {topics.map(({ topic, terms }, index) => (
            <Section
              key={topic.id}
              id={`topic-${topic.id}`}
              className={styles.topic}
              icon={<TopicIcon topic={TOPIC_ICONS[topic.id]} size={20} />}
              title={topic.label}
              description={topic.summary}
            >
              <TopicPane topic={topic.id} terms={terms} flip={index % 2 === 1} />
            </Section>
          ))}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
