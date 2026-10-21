/* Throwaway comparison of the shipped narrow list, a compact discussion, and a lean reading list. */
import { Anchor, Group, Select, Stack, Switch, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';
import { ProfileLink } from '@ui/content/ProfileLink';
import { SectionedSurface } from '@ui/surface/SectionedSurface';
import { Box, Check, MessageCircle, Quote } from 'lucide-react';
import { useReducer } from 'react';
import { fn } from 'storybook/test';

import type { FaqItemWithDetails } from '@db/faq';

import { FaqList } from './FaqList';
import styles from './FaqListNarrowPrototypes.module.css';

const openQuestion = fn();
const chani = { id: 'profile-chani', slug: 'chani', username: 'Chani', avatar_url: null };
const stilgar = { id: 'profile-stilgar', slug: 'stilgar', username: 'Stilgar', avatar_url: null };
const references = [
  { kind: 'asset', name: 'Lasgun', slug: 'lasgun', type: 'card-treachery' },
  { kind: 'faction', name: 'Atreides', slug: 'atreides' },
  { kind: 'asset', name: 'Shield', slug: 'shield', type: 'card-treachery' },
  { kind: 'faction', name: 'Fremen', slug: 'fremen' },
] as const;

const examples = [
  {
    slug: 'storm-movement',
    question: 'Can leaders move through the storm?',
    excerpt:
      'Only when the ruleset explicitly allows it. The usual movement restrictions still apply to troops accompanying them.',
    count: 3,
    references,
  },
  {
    slug: 'reserve-forces',
    question: 'When do reserve forces enter play?',
    excerpt: null,
    count: 0,
    references: [],
  },
  {
    slug: 'shield-lasgun',
    question:
      'What happens when a Lasgun and a Shield are revealed in the same battle, and can either player still use a faction advantage?',
    excerpt:
      'Resolve the Lasgun and Shield interaction before applying any advantage that depends on surviving the battle. Follow the exceptions stated by the ruleset.',
    count: 8,
    references,
  },
  {
    slug: 'storm-timing',
    question: 'Which player resolves movement first when two faction abilities happen at the same time?',
    excerpt: null,
    count: 5,
    references: references.slice(1, 2),
  },
];

const items = examples.map((example, index) => ({
  _id: `prototype-question-${index}`,
  _creationTime: Date.parse('2026-07-18T10:00:00.000Z'),
  ruleset_id: 'prototype-ruleset',
  slug: example.slug,
  question: example.question,
  tags: index === 1 ? ['strategy', 'army_list'] : ['rules'],
  asked_by: 'prototype-asker',
  created_at: '2026-07-18T10:00:00.000Z',
  updated_at: '2026-07-18T10:00:00.000Z',
  accepted_answer_id: example.excerpt ? 'prototype-answer' : null,
  faq_answers: Array.from({ length: example.count }, (_, answer) => ({
    _id: `prototype-answer-${index}-${answer}`,
    _creationTime: Date.parse('2026-07-18T11:00:00.000Z'),
    faq_item_id: `prototype-question-${index}`,
    answer: example.excerpt ?? 'An open discussion without an accepted answer.',
    answered_by: 'prototype-answerer',
    created_at: '2026-07-18T11:00:00.000Z',
  })),
  asker_profile: stilgar,
  list_details: {
    accepted_answer: example.excerpt ? { excerpt: example.excerpt } : null,
    answerers: example.count ? (example.excerpt ? [chani] : [chani, stilgar]) : [],
    references: example.references,
    has_more_references: false,
    has_more_answers: false,
  },
  ruleset: index % 2 ? { name: 'Classic Rules', slug: 'classicrules' } : { name: 'Dreamrules', slug: 'dreamrules' },
})) as unknown as (FaqItemWithDetails & { ruleset: { name: string; slug: string } })[];

type Settings = { width: string; mixed: boolean };
type SettingChange = { kind: 'width'; value: string } | { kind: 'mixed'; value: boolean };

export function NarrowPrototypeComparison({ initialWidth = '320' }: { initialWidth?: string }) {
  const [settings, change] = useReducer(
    (state: Settings, event: SettingChange): Settings =>
      event.kind === 'width' ? { ...state, width: event.value } : { ...state, mixed: event.value },
    { width: initialWidth, mixed: false }
  );
  return (
    <Stack gap="lg">
      <Section
        title="Narrow FAQ list"
        description="Prototype comparison. Same questions and typography in every column."
      >
        <Group gap="lg" align="end">
          <Select
            label="Container width"
            value={settings.width}
            data={['320', '400', '560'].map((width) => ({ value: width, label: `${width} px` }))}
            onChange={(value) => value && change({ kind: 'width', value })}
            allowDeselect={false}
            w={160}
          />
          <Switch
            label="Mixed rulesets"
            checked={settings.mixed}
            onChange={(event) => change({ kind: 'mixed', value: event.currentTarget.checked })}
          />
        </Group>
      </Section>
      <div className={styles.comparison}>
        <div style={{ width: Number(settings.width) }}>
          <Section title="Current" description="All contributor names and related links, plus tags and date.">
            {settings.mixed ? (
              <FaqList items={items} emptyLabel="No questions." onOpenQuestion={openQuestion} />
            ) : (
              <FaqList
                items={items}
                rulesetSlug="dreamrules"
                emptyLabel="No questions."
                onOpenQuestion={openQuestion}
              />
            )}
          </Section>
        </div>
        <div style={{ width: Number(settings.width) }}>
          <Section title="Compact" description="Two-line excerpt, accepted author and two related links.">
            <CompactPrototype mixed={settings.mixed} lean={false} />
          </Section>
        </div>
        <div style={{ width: Number(settings.width) }}>
          <Section title="Lean" description="One-line excerpt and relationship count. No contributor names.">
            <CompactPrototype mixed={settings.mixed} lean />
          </Section>
        </div>
      </div>
    </Stack>
  );
}

function CompactPrototype({ mixed, lean }: { mixed: boolean; lean: boolean }) {
  return (
    <SectionedSurface>
      {items.map((item) => {
        const rulesetSlug = mixed ? item.ruleset.slug : 'dreamrules';
        const details = item.list_details!;
        const accepted = details.accepted_answer;
        const count = item.faq_answers.length;
        const label = `${count} ${count === 1 ? 'answer' : 'answers'}`;
        const questionLink = (props: Record<string, unknown>) => (
          <Link
            {...props}
            to="/rulesets/$rulesetSlug/faq/$questionSlug"
            params={{ rulesetSlug, questionSlug: item.slug }}
          />
        );
        const shownReferences = details.references.slice(0, 2);
        const more = details.references.length - shownReferences.length;
        const author = details.answerers[0];
        return (
          <SectionedSurface.Row
            key={item._id}
            ariaLabel={`Open question: ${item.question}`}
            onActivate={() => openQuestion(item.slug, rulesetSlug)}
          >
            <div className={styles.row}>
              <Anchor className={styles.question} fw={700} fz="md" underline="never" renderRoot={questionLink}>
                {item.question}
              </Anchor>
              {accepted ? (
                <div className={styles.excerpt}>
                  <Quote size={15} aria-hidden />
                  <Text size="sm" lineClamp={lean ? 1 : 2}>
                    {accepted.excerpt}
                  </Text>
                </div>
              ) : null}
              <div className={styles.summary}>
                <Text component="span" size="xs" className={styles.count}>
                  {accepted ? (
                    <Check size={13} aria-label="Accepted answer" />
                  ) : (
                    <MessageCircle size={13} aria-hidden />
                  )}
                  {label}
                </Text>
                {!lean && accepted && author ? (
                  <ProfileLink
                    slug={author.slug}
                    name={author.username}
                    image={author.avatar_url}
                    density="compact"
                    underline="never"
                    title="Accepted answer by Chani"
                  />
                ) : null}
                {mixed ? (
                  <Anchor
                    size="xs"
                    underline="never"
                    className={styles.ruleset}
                    renderRoot={(props) => <Link {...props} to="/rulesets/$rulesetSlug/faq" params={{ rulesetSlug }} />}
                  >
                    {item.ruleset.name}
                  </Anchor>
                ) : null}
                {lean && details.references.length ? (
                  <Anchor size="xs" underline="never" className={styles.count} renderRoot={questionLink}>
                    <Box size={13} aria-hidden />
                    {details.references.length} related
                  </Anchor>
                ) : null}
              </div>
              {!lean && shownReferences.length ? (
                <div className={styles.references}>
                  <Text component="span" size="xs" c="dimmed" className={styles.relationLabel}>
                    Relates to:
                  </Text>
                  {shownReferences.map((reference) => (
                    <Anchor
                      key={`${reference.kind}:${reference.slug}`}
                      size="xs"
                      underline="never"
                      className={styles.reference}
                      renderRoot={(props) =>
                        reference.kind === 'faction' ? (
                          <Link {...props} to="/factions/$factionId" params={{ factionId: reference.slug }} />
                        ) : (
                          <Link
                            {...props}
                            to="/assets/$type/$slug"
                            params={{ type: reference.type, slug: reference.slug }}
                          />
                        )
                      }
                    >
                      <span className={styles.referenceName}>{reference.name}</span>
                    </Anchor>
                  ))}
                  {more ? (
                    <Anchor
                      size="xs"
                      underline="never"
                      renderRoot={questionLink}
                      aria-label={`${more} more related items`}
                    >
                      +{more}
                    </Anchor>
                  ) : null}
                </div>
              ) : null}
            </div>
          </SectionedSurface.Row>
        );
      })}
    </SectionedSurface>
  );
}
