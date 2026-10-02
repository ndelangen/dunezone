import { Anchor, Badge, Group, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { GLOSSARY, GLOSSARY_TOPICS } from '@shared/glossary/terms';
import type { GlossaryTerm } from '@shared/glossary/terms';
import { createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Search } from 'lucide-react';
import { useState } from 'react';

import { pageHead } from '@app/routes/pageTitle';

import styles from './index.module.css';

export const Route = createFileRoute('/_app/glossary/')({
  head: () => pageHead('Glossary'),
  component: GlossaryPage,
});

function avoidedWords(term: GlossaryTerm) {
  return term.avoid.map((avoided) => avoided.word);
}

/* A search matches the preferred term or any word it replaces, so a reader can look up the word they were about to use. */
function matches(term: GlossaryTerm, needle: string) {
  return (
    !needle ||
    term.term.toLowerCase().includes(needle) ||
    term.avoid.some((avoided) => avoided.word.toLowerCase().includes(needle))
  );
}

function TermEntry({ term }: { term: GlossaryTerm }) {
  const avoided = avoidedWords(term);
  return (
    <Stack gap="xs" id={term.id} className={styles.term}>
      <Group gap="sm" align="baseline">
        <Title order={3} size="h4">
          {term.term}
        </Title>
        <Badge variant="light" color={term.source === 'rulebook' ? 'dune' : 'gray'} size="sm">
          {term.source === 'rulebook' ? 'Rulebook' : 'Dune Zone'}
        </Badge>
      </Group>
      <Text>{term.explanation}</Text>
      <Text c="dimmed" size="sm">
        {term.reason}
      </Text>
      {avoided.length > 0 ? (
        <Group gap="xs">
          <Text size="sm" fw={600}>
            Say {term.term.toLowerCase()} instead of
          </Text>
          {avoided.map((word) => (
            <Badge key={word} variant="outline" color="gray" size="sm" tt="none" className={styles.avoided}>
              {word}
            </Badge>
          ))}
        </Group>
      ) : null}
    </Stack>
  );
}

function GlossaryPage() {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const topics = GLOSSARY_TOPICS.map((topic) => ({
    ...topic,
    terms: GLOSSARY.filter((term) => term.topic === topic.id && matches(term, needle)),
  })).filter((topic) => topic.terms.length > 0);
  return (
    <PageLayout>
      <PageLayout.Header>
        <SimpleGrid cols={{ base: 1, sm: 2 }} maw="58rem" spacing="xl" w="100%">
          <Stack gap="sm" justify="center">
            <PageTitle eyebrow="Words we use" title="Glossary" />
            <Text size="lg">
              Every game idea on Dune Zone has one name. This page explains each one and why we chose it.
            </Text>
          </Stack>
          <Surface padding="lg">
            <Stack gap="sm">
              <Title order={2} size="h3">
                One word for one idea
              </Title>
              <Text>
                We follow the wording of the 2019 Dune rulebook wherever it has one, so what you read here matches the
                box on your table. The one exception is troops, which the rulebook calls forces.
              </Text>
              <Text c="dimmed" size="sm">
                When you write rules or answers on Dune Zone, we point out words from the &ldquo;instead of&rdquo;
                lists. You can always keep your own wording.
              </Text>
            </Stack>
          </Surface>
        </SimpleGrid>
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="xl">
          <Surface padding="lg">
            <Stack gap="sm">
              <TextInput
                leftSection={<Search size={16} />}
                placeholder="Search, for example forces or combat"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                aria-label="Search the glossary"
              />
              <Group gap="md">
                {topics.map((topic) => (
                  <Anchor key={topic.id} href={`#topic-${topic.id}`}>
                    {topic.label}
                  </Anchor>
                ))}
              </Group>
            </Stack>
          </Surface>
          {topics.length === 0 ? <Text c="dimmed">No term matches that search.</Text> : null}
          {topics.map((topic) => (
            <Surface key={topic.id} padding="xl">
              <Stack gap="lg" id={`topic-${topic.id}`} className={styles.topic}>
                <Stack gap={0}>
                  <Title order={2}>{topic.label}</Title>
                  <Text c="dimmed">{topic.summary}</Text>
                </Stack>
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" verticalSpacing="lg">
                  {topic.terms.map((term) => (
                    <TermEntry key={term.id} term={term} />
                  ))}
                </SimpleGrid>
              </Stack>
            </Surface>
          ))}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
