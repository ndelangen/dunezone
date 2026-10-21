import { Anchor, Button, Divider, Group, Tabs, Stack, Text, Textarea } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { OpenableTile } from '@ui/block/OpenableTile';
import { Section } from '@ui/block/Section';
import { Eyebrow } from '@ui/content/Eyebrow';
import { GroupLink } from '@ui/content/GroupLink';
import { ProfileLink } from '@ui/content/ProfileLink';
import { RulesetLink } from '@ui/content/RulesetLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { PageLayout } from '@ui/layout/PageLayout';
import { FaqList } from '@ui/list/FaqList';
import { Card } from '@ui/surface/Card';
import { Surface } from '@ui/surface/Surface';
import { Check, ChevronDown, Pencil } from 'lucide-react';
import { useReducer, useState } from 'react';

import type { FaqItemWithDetails } from '@db/faq';
import { ApplicationChrome } from '@app/shell/ApplicationChrome';
import { ShellPageBackdrop } from '@app/shell/ShellStoryPage.stories.fixture';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { card } from '@game/data/sizes';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

import styles from './faqDetailPrototypes.module.css';

/* Three throwaway FAQ detail layouts. Thread, dates, identities and totals are illustrative.
 * Real game card fixtures and the shared FAQ list keep the comparison close to the application.
 */
export type FaqDetailVariant = 'A' | 'B' | 'C';
const variants = [
  { value: 'A', label: 'A · Reading rail' },
  { value: 'B', label: 'B · Forum' },
  { value: 'C', label: 'C · Field notes' },
];
const descriptions: Record<FaqDetailVariant, string> = {
  A: 'A quiet reading column, separate answers, and all context in the right rail.',
  B: 'A forum thread with a contributor beside each post and references in the right rail.',
  C: 'A left reference desk beside one continuous discussion, with contributor details beside each answer.',
};
const title = 'When should we declare a Karama card?';
const people = {
  len: { name: 'Len', slug: 'len', questions: 14, answers: 32, groups: ['Amsterdam Dune', 'Sunday table'] },
  mara: { name: 'Mara', slug: 'mara', questions: 8, answers: 57, groups: ['Sunday table'] },
  sana: { name: 'Sana', slug: 'sana', questions: 21, answers: 46, groups: ['Amsterdam Dune'] },
  idris: { name: 'Idris', slug: 'idris', questions: 6, answers: 108, groups: ['Amsterdam Dune', 'Rules workshop'] },
};
type Person = (typeof people)[keyof typeof people];
const initialReply =
  'We usually pause before resolving an advantage and give everyone a chance to play a Karama. That avoids having to undo an effect after the fact.';
const answers = [
  {
    key: 'idris',
    author: people.idris,
    posted: '16 Oct 2026, 09:40',
    accepted: true,
    text: 'Declare the card before resolving the effect you want to stop. In this ruleset, the cancelled advantage remains unavailable for the rest of the phase.\n\nThe Richese card also has its own special effect. Say which use you are declaring so the table can resolve the right effect.',
  },
  {
    key: 'mara',
    author: people.mara,
    posted: '14 Oct 2026, 19:12',
    accepted: false,
    text: 'I read the timing as being before the advantage takes effect. We should make that explicit in our table rules, especially when two people want to play a card at once.',
  },
  { key: 'sana', author: people.sana, posted: '15 Oct 2026, 10:06', accepted: false, text: initialReply },
];
const references = [
  { slug: 'karama', data: treacheryCardFixtures.karama },
  { slug: 'richese-karama', data: treacheryCardFixtures.richeseKarama },
];
const relatedSource = [
  {
    question: 'Can we play both Karama effects in the same phase?',
    slug: 'both-karama-effects',
    date: '2026-10-18',
    refs: references,
    excerpt: 'Declare each use separately, following the timing of the effect you choose.',
    ruleset: 'Dreamrules',
  },
  {
    question: 'Which Karama effect takes priority when two cards are played?',
    slug: 'karama-priority',
    date: '2026-10-13',
    refs: references,
    excerpt: null,
    ruleset: 'Dreamrules',
  },
  {
    question: 'Does a cancelled advantage return next phase?',
    slug: 'karama-next-phase',
    date: '2026-10-20',
    refs: [references[0]!],
    excerpt: 'The cancellation lasts for the phase in which the card was played.',
    ruleset: 'Dreamrules',
  },
  {
    question: 'Can a Karama card be used during an ally’s turn?',
    slug: 'karama-ally-turn',
    date: '2026-10-19',
    refs: [references[0]!],
    excerpt: null,
    ruleset: 'Classic rules',
  },
  {
    question: 'When is the Richese special effect discarded?',
    slug: 'richese-discard',
    date: '2026-10-11',
    refs: [references[1]!],
    excerpt: 'Discard it after resolving the declared effect.',
    ruleset: 'Dreamrules',
  },
];
const related = [...relatedSource]
  .sort((left, right) => right.refs.length - left.refs.length || right.date.localeCompare(left.date))
  .slice(0, 5)
  .map((item, index) => ({
    _id: `related-${index}`,
    _creationTime: Date.parse(item.date),
    ruleset_id: 'ruleset-dreamrules',
    slug: item.slug,
    question: item.question,
    tags: ['rules'],
    asked_by: 'len',
    created_at: `${item.date}T12:00:00Z`,
    updated_at: `${item.date}T12:00:00Z`,
    accepted_answer_id: item.excerpt ? `accepted-${index}` : null,
    faq_answers: [{ _id: `accepted-${index}` }],
    asker_profile: { id: 'len', slug: 'len', username: 'Len', avatar_url: null },
    list_details: {
      accepted_answer: item.excerpt ? { excerpt: item.excerpt } : null,
      answerers: [{ id: 'idris', slug: 'idris', username: 'Idris', avatar_url: null }],
      references: item.refs.map((ref) => ({
        kind: 'asset',
        name: ref.data.name,
        type: 'card-treachery',
        slug: ref.slug,
      })),
      has_more_references: false,
      has_more_answers: false,
    },
    ruleset: { name: item.ruleset, slug: item.ruleset === 'Dreamrules' ? 'dreamrules' : 'classicrules' },
  })) as unknown as (FaqItemWithDetails & { ruleset: { name: string; slug: string } })[];

function Contributor({ person, label }: { person: Person; label?: string }) {
  return (
    <Stack gap="xs" className={styles.contributor}>
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      <ProfileLink name={person.name} slug={person.slug} underline="never" />
      <Text size="xs" c="dimmed">
        {person.questions} questions · {person.answers} answers
      </Text>
      <Group gap="xs" className={styles.memberships}>
        {person.groups.map((name) => (
          <GroupLink key={name} name={name} slug={name.toLowerCase().replaceAll(' ', '-')} />
        ))}
      </Group>
    </Stack>
  );
}

function ReferenceDesk() {
  return (
    <Stack gap="lg">
      <Section title="Ruleset">
        <RulesetLink name="Dreamrules" slug="dreamrules" />
        <Text size="sm" c="dimmed">
          This discussion follows Dreamrules. Other rulesets may interpret these cards differently.
        </Text>
      </Section>
      <Section title="Relates to">
        <div className={styles.previews}>
          {references.map(({ slug, data }) => (
            <OpenableTile
              key={slug}
              caption={data.name}
              renderRoot={(props) => (
                <Link {...props} to="/assets/$type/$slug" params={{ type: 'card-treachery', slug }} />
              )}
            >
              <CanvasScale canvasWidth={card.width} canvasHeight={card.height} rounded>
                <TreacheryCard {...data} />
              </CanvasScale>
            </OpenableTile>
          ))}
        </div>
      </Section>
    </Stack>
  );
}

function Context({ variant }: { variant: FaqDetailVariant }) {
  const [open, setOpen] = useState(false);
  return (
    <aside className={styles.aside} aria-label="Question context">
      <Button
        className={styles.contextToggle}
        fullWidth
        variant="default"
        rightSection={<ChevronDown size={16} />}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide question context' : 'Ruleset, references & people'}
      </Button>
      <div className={styles.asideContent} data-open={open}>
        <ReferenceDesk />
        {variant !== 'B' ? (
          <Card title="Asked by" padding="md">
            <Contributor person={people.len} />
            <Text size="xs" c="dimmed">
              Asked 14 Oct 2026, 18:30
            </Text>
          </Card>
        ) : null}
        {variant === 'A' ? (
          <Card title="In this thread" padding="md">
            <Stack gap="lg">
              {[people.idris, people.mara, people.sana].map((person, index) => (
                <div key={person.slug}>
                  <Contributor person={person} label={index === 0 ? 'Accepted answer' : undefined} />
                </div>
              ))}
            </Stack>
          </Card>
        ) : null}
      </div>
    </aside>
  );
}

type ReplyState = { text: string; draft: string; editing: boolean; saved: boolean };
type ReplyEvent = { type: 'edit' } | { type: 'change'; text: string } | { type: 'save' } | { type: 'cancel' };
function replyReducer(state: ReplyState, event: ReplyEvent): ReplyState {
  switch (event.type) {
    case 'edit':
      return { ...state, draft: state.text, editing: true, saved: false };
    case 'change':
      return { ...state, draft: event.text };
    case 'save':
      return { text: state.draft, draft: state.draft, editing: false, saved: true };
    case 'cancel':
      return { ...state, editing: false };
  }
}

function ReplyBody({ answer }: { answer: (typeof answers)[number] }) {
  const [state, dispatch] = useReducer(replyReducer, {
    text: answer.text,
    draft: answer.text,
    editing: false,
    saved: false,
  });
  return (
    <Stack gap="md">
      <Group justify="space-between" align="start" gap="xs">
        <Group gap="xs">
          {answer.accepted ? (
            <StatusBadge tone="positive" icon={<Check size={12} />}>
              Accepted answer
            </StatusBadge>
          ) : (
            <Text size="xs" fw={700}>
              Answer
            </Text>
          )}
          <Text size="xs" c="dimmed">
            {answer.posted}
          </Text>
        </Group>
        {answer.key === 'sana' && !state.editing ? (
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<Pencil size={12} />}
            onClick={() => dispatch({ type: 'edit' })}
          >
            Edit your answer
          </Button>
        ) : null}
      </Group>
      {answer.accepted ? (
        <Text size="xs" c="dimmed">
          Accepted by Len on <time dateTime="2026-10-17T11:24:00Z">17 Oct 2026, 11:24</time>
        </Text>
      ) : null}
      {state.editing ? (
        <>
          <Textarea
            label="Your answer"
            description="You have one answer in this discussion. Saving updates it in place."
            value={state.draft}
            minRows={4}
            autosize
            onChange={(event) => dispatch({ type: 'change', text: event.currentTarget.value })}
          />
          <Group gap="xs">
            <Button size="xs" disabled={!state.draft.trim()} onClick={() => dispatch({ type: 'save' })}>
              Save changes
            </Button>
            <Button size="xs" variant="subtle" onClick={() => dispatch({ type: 'cancel' })}>
              Cancel
            </Button>
          </Group>
        </>
      ) : (
        <Text className={styles.prose}>{state.text}</Text>
      )}
      {state.saved ? (
        <Text size="xs" c="dimmed" role="status">
          Your answer was updated. Changes stay in this prototype.
        </Text>
      ) : null}
    </Stack>
  );
}

function Question({ forum }: { forum: boolean }) {
  const body = (
    <Card title={title} padding="lg">
      <Stack gap="md">
        <Group gap="xs">
          <StatusBadge tone="positive" icon={<Check size={12} />}>
            Answered
          </StatusBadge>
          <Text size="xs" c="dimmed">
            Asked 14 Oct 2026 · 3 answers
          </Text>
        </Group>
        <Text className={styles.prose}>
          Our table paused when a Karama was played after an advantage had already started resolving. Should it be
          declared before the effect, or can it undo what just happened?
        </Text>
        <Text className={styles.prose}>
          We also have the Richese Karama in the deck. Does choosing the special effect change when we announce it?
        </Text>
        <Group gap="xs">
          <Anchor component="a" href="#discussion" size="sm" underline="never">
            Read the answers ↓
          </Anchor>
          <Text size="xs" c="dimmed">
            Rules · Timing
          </Text>
        </Group>
      </Stack>
    </Card>
  );
  return (
    <div className={styles.question}>
      {forum ? (
        <div className={styles.post}>
          <div className={styles.postAuthor}>
            <Contributor person={people.len} label="Asked by" />
          </div>
          {body}
        </div>
      ) : (
        body
      )}
    </div>
  );
}

function Answers({ variant }: { variant: FaqDetailVariant }) {
  const posts = answers.map((answer) => (
    <div key={answer.key} data-answer={answer.key} className={variant === 'A' ? styles.readingPost : styles.post}>
      {variant !== 'A' ? (
        <div className={styles.postAuthor}>
          <Contributor person={answer.author} label={answer.key === 'sana' ? 'You' : undefined} />
        </div>
      ) : null}
      {variant === 'C' ? (
        <ReplyBody answer={answer} />
      ) : (
        <Surface as="article" aria-label={`${answer.author.name}'s answer`} padding="lg">
          <Stack gap="md">
            {variant === 'A' ? (
              <ProfileLink name={answer.author.name} slug={answer.author.slug} density="compact" underline="never" />
            ) : null}
            <ReplyBody answer={answer} />
          </Stack>
        </Surface>
      )}
    </div>
  ));
  return (
    <div className={styles.answers}>
      <Section
        title="3 answers"
        id="discussion"
        description="Accepted answer first. Other answers run from oldest to newest."
      >
        {variant === 'C' ? (
          <Surface padding="lg">
            <Stack gap="lg">
              {posts.map((post, index) => (
                <div key={answers[index]!.key}>
                  {index > 0 ? <Divider mb="lg" /> : null}
                  {post}
                </div>
              ))}
            </Stack>
          </Surface>
        ) : (
          <Stack gap="md">{posts}</Stack>
        )}
        <Text size="sm" c="dimmed">
          You have already answered. You can update your answer above.
        </Text>
      </Section>
    </div>
  );
}

function Related() {
  return (
    <div className={styles.related}>
      <Section
        title="Related questions"
        description="More shared references first, then newest. These five discussions share Karama or Richese Karama."
      >
        <FaqList items={related} emptyLabel="No related questions yet." onOpenQuestion={() => {}} />
      </Section>
    </div>
  );
}

export function FaqDetailPrototype({
  variant = 'A',
  switcher = false,
}: {
  variant?: FaqDetailVariant;
  switcher?: boolean;
}) {
  const [selection, setSelection] = useState<FaqDetailVariant>(variant);
  const current = switcher ? selection : variant;
  return (
    <ShellPageBackdrop>
      <ApplicationChrome>
        <PageLayout>
          <PageLayout.Toolbar>
            <Stack gap="sm">
              {switcher ? (
                <Surface padding="sm">
                  <Stack gap="xs">
                    <Group justify="space-between" gap="sm">
                      <Eyebrow>FAQ detail · Layout prototypes</Eyebrow>
                      <Text size="xs" c="dimmed">
                        Illustrative discussion
                      </Text>
                    </Group>
                    <Tabs value={current} onChange={(value) => setSelection(value as FaqDetailVariant)}>
                      <Tabs.List grow>
                        {variants.map(({ value, label }) => (
                          <Tabs.Tab key={value} value={value}>
                            {label}
                          </Tabs.Tab>
                        ))}
                      </Tabs.List>
                    </Tabs>
                    <Text size="sm" c="dimmed">
                      {descriptions[current]}
                    </Text>
                  </Stack>
                </Surface>
              ) : null}
              <Anchor component="a" href="#" size="sm" underline="never">
                ← FAQ
              </Anchor>
            </Stack>
          </PageLayout.Toolbar>
          <PageLayout.Content>
            <div className={styles.container}>
              <div className={styles.layout} data-variant={current}>
                <Question forum={current === 'B'} />
                <Context key={current} variant={current} />
                <Answers key={`answers-${current}`} variant={current} />
                <Related />
              </div>
            </div>
          </PageLayout.Content>
        </PageLayout>
      </ApplicationChrome>
    </ShellPageBackdrop>
  );
}
