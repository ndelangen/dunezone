import { Anchor, Button, Group, Menu, Stack, Text, Tooltip } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { OpenableTile } from '@ui/block/OpenableTile';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { Eyebrow } from '@ui/content/Eyebrow';
import { FormattedTextSource } from '@ui/content/FormattedText';
import { GroupLink } from '@ui/content/GroupLink';
import { ProfileLink } from '@ui/content/ProfileLink';
import { RulesetLink } from '@ui/content/RulesetLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { ConfirmDeleteMenuItem } from '@ui/control/ConfirmDeleteMenuItem';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { IconAction } from '@ui/control/IconAction';
import { SaveAction } from '@ui/control/SaveAction';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { PageLayout } from '@ui/layout/PageLayout';
import { TileGrid } from '@ui/list/TileGrid';
import { Card } from '@ui/surface/Card';
import { Surface } from '@ui/surface/Surface';
import { BadgeCheck, BadgeMinus, EllipsisVertical, Pencil, RotateCcw, X } from 'lucide-react';
import { useReducer } from 'react';

import { ApplicationChrome } from '@app/shell/ApplicationChrome';
import { ShellPageBackdrop } from '@app/shell/ShellStoryPage.stories.fixture';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { card } from '@game/data/sizes';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

import styles from './faqControlsPrototype.module.css';

/* Throwaway controls on the approved forum layout. All actions change memory only. */
const people = {
  leonard: { name: 'Leonard van der Meer', slug: 'leonard', questions: 14, answers: 32 },
  idris: { name: 'IdrisTheKeeperOfDuneTraditions', slug: 'idris', questions: 6, answers: 108 },
  mara: { name: 'Mara N.', slug: 'mara', questions: 8, answers: 57 },
};
const initialPosts = [
  {
    id: 'leonard',
    author: people.leonard,
    own: true,
    date: 'Oct 19, 2026',
    text: 'Declare the card before resolving the effect you want to stop. We pause before resolving an advantage so everyone has a chance to play a Karama.',
  },
  {
    id: 'idris',
    author: people.idris,
    own: false,
    date: 'Oct 17, 2026',
    text: 'I read the timing as being before the advantage takes effect. We should make that explicit in our table rules.',
  },
  {
    id: 'mara',
    author: people.mara,
    own: false,
    date: 'Oct 18, 2026',
    text: 'That matches our table. Say which use you are declaring before resolving the card.',
  },
];
type Post = (typeof initialPosts)[number];
type DemoState = {
  question: string;
  posts: Post[];
  accepted: string | null;
  editing: string | null;
  draft: string;
  questionDeleted: boolean;
  event: string;
};
const initialState: DemoState = {
  question: 'When should we declare a Karama card?',
  posts: initialPosts,
  accepted: 'leonard',
  editing: null,
  draft: '',
  questionDeleted: false,
  event: "Open the accepted answer's menu to unmark it.",
};
type DemoEvent =
  | { type: 'reset' }
  | { type: 'edit'; id: string }
  | { type: 'draft'; value: string }
  | { type: 'cancel' }
  | { type: 'save' }
  | { type: 'accept'; id: string }
  | { type: 'unmark' }
  | { type: 'delete'; id: string };
function reducer(state: DemoState, event: DemoEvent): DemoState {
  switch (event.type) {
    case 'reset':
      return initialState;
    case 'edit':
      return {
        ...state,
        editing: event.id,
        draft: event.id === 'question' ? state.question : state.posts.find((post) => post.id === event.id)!.text,
        event: 'Editing inline. Save keeps the change; Cancel discards the draft.',
      };
    case 'draft':
      return { ...state, draft: event.value };
    case 'cancel':
      return { ...state, editing: null, draft: '', event: 'Draft discarded. The post is unchanged.' };
    case 'save':
      return {
        ...state,
        question: state.editing === 'question' ? state.draft : state.question,
        posts: state.posts.map((post) => (post.id === state.editing ? { ...post, text: state.draft } : post)),
        editing: null,
        draft: '',
        event: 'Saved in this preview.',
      };
    case 'accept':
      if (state.accepted !== null) {
        return state;
      }
      return {
        ...state,
        accepted: event.id,
        event: 'Answer accepted and moved to the top. Unmark it through its menu to choose another.',
      };
    case 'delete':
      return {
        ...state,
        questionDeleted: event.id === 'question',
        posts: state.posts.filter((post) => post.id !== event.id),
        accepted: state.accepted === event.id ? null : state.accepted,
        event: event.id === 'question' ? 'Question deleted in this preview.' : 'Answer deleted in this preview.',
      };
    case 'unmark':
      return { ...state, accepted: null, event: 'Acceptance removed. You can now accept any answer.' };
  }
}

function Contributor({ person, label }: { person: (typeof people)[keyof typeof people]; label?: string }) {
  return (
    <Stack gap="xs">
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      <ProfileLink name={person.name} slug={person.slug} presentation="contributor" underline="never" />
      <Text size="xs" c="dimmed">
        {person.questions} questions · {person.answers} answers
      </Text>
      <GroupLink name="Arrakeen Rules Council" slug="arrakeen-rules-council" />
    </Stack>
  );
}

function Controls({
  id,
  own,
  accepted,
  onEdit,
  onUnmark,
  onDelete,
}: {
  id: string;
  own: boolean;
  accepted: boolean;
  onEdit: () => void;
  onUnmark: () => void;
  onDelete: () => void;
}) {
  const name = id === 'question' ? 'question' : 'answer';
  return (
    <Menu position="bottom-end" withinPortal shadow="md">
      <Menu.Target>
        <IconAction
          label={`Actions for ${name}`}
          icon={<EllipsisVertical size={17} />}
          intent="neutral"
          emphasis="standard"
          size="lg"
        />
      </Menu.Target>
      <Menu.Dropdown>
        {own ? (
          <Menu.Item leftSection={<Pencil size={17} />} onClick={onEdit}>
            Edit {name}
          </Menu.Item>
        ) : null}
        {accepted ? (
          <Menu.Item leftSection={<BadgeMinus size={17} />} onClick={onUnmark}>
            Unmark accepted answer
          </Menu.Item>
        ) : null}
        {own || accepted ? <Menu.Divider /> : null}
        <ConfirmDeleteMenuItem label={`Hold to delete ${name}`} onConfirm={onDelete} />
      </Menu.Dropdown>
    </Menu>
  );
}

function Editor({
  name,
  value,
  original,
  onChange,
  onCancel,
  onSave,
}: {
  name: string;
  value: string;
  original: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const dirty = value !== original;
  return (
    <Stack gap="md">
      <FormattedTextInput
        label={`Edit ${name}`}
        value={value}
        onChange={onChange}
        rows={3}
        profile={name === 'question' ? 'marks-only' : undefined}
      />
      <Group justify="flex-end" gap="xs" wrap="nowrap">
        <IconAction
          label={`Cancel editing ${name}`}
          tooltip={dirty ? 'Discard unsaved changes' : 'Close editor'}
          intent={dirty ? 'negative' : 'neutral'}
          emphasis="standard"
          size="lg"
          icon={<X size={17} />}
          onClick={onCancel}
        />
        <SaveAction
          label={`Save ${name}`}
          state={dirty ? 'dirty' : 'clean'}
          lines={[dirty ? 'Unsaved changes' : 'No changes to save']}
          disabled={!dirty || !value.trim()}
          onSave={onSave}
        />
      </Group>
    </Stack>
  );
}

function Context() {
  return (
    <aside className={styles.aside} aria-label="Question context">
      <Stack gap="xl">
        <Section title="Ruleset">
          <RulesetLink name="ClassicRules" slug="classicrules" />
          <Text size="sm" c="dimmed">
            This discussion follows ClassicRules.
          </Text>
        </Section>
        <Section title="Relates to">
          <TileGrid density="compact">
            {[
              { slug: 'karama', data: treacheryCardFixtures.karama },
              { slug: 'richese-karama', data: treacheryCardFixtures.richeseKarama },
            ].map((reference) => (
              <OpenableTile
                key={reference.slug}
                caption={reference.data.name}
                renderRoot={(props) => (
                  <Link {...props} to="/assets/$type/$slug" params={{ type: 'card-treachery', slug: reference.slug }} />
                )}
              >
                <CanvasScale canvasWidth={card.width} canvasHeight={card.height}>
                  <TreacheryCard {...reference.data} />
                </CanvasScale>
              </OpenableTile>
            ))}
          </TileGrid>
        </Section>
      </Stack>
    </aside>
  );
}

export function FaqControlsPrototype() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const actions = (id: string, own: boolean) => (
    <Controls
      id={id}
      own={own}
      accepted={state.accepted === id}
      onEdit={() => dispatch({ type: 'edit', id })}
      onUnmark={() => dispatch({ type: 'unmark' })}
      onDelete={() => dispatch({ type: 'delete', id })}
    />
  );
  const editor = (id: string, original: string) => (
    <Editor
      name={id === 'question' ? 'question' : 'your answer'}
      value={state.draft}
      original={original}
      onChange={(value) => dispatch({ type: 'draft', value })}
      onCancel={() => dispatch({ type: 'cancel' })}
      onSave={() => dispatch({ type: 'save' })}
    />
  );
  const visible = [...state.posts].sort(
    (left, right) =>
      Number(right.id === state.accepted) - Number(left.id === state.accepted) ||
      Date.parse(left.date) - Date.parse(right.date)
  );
  return (
    <ShellPageBackdrop>
      <ApplicationChrome>
        <PageLayout>
          <PageLayout.Header size="collapsed">
            <PageTitle title="FAQ controls prototype" />
          </PageLayout.Header>
          <PageLayout.Toolbar>
            <Stack gap="md">
              <Surface padding="sm">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Eyebrow>FAQ controls · Prototype</Eyebrow>
                    <Text size="xs" c="dimmed">
                      You are Leonard, the asker. Preview changes only.
                    </Text>
                  </Group>
                  <Text fw={700}>Accept + menu</Text>
                  <Text size="sm" c="dimmed">
                    Accept an answer while the question is open. To change it, unmark the accepted answer through its
                    menu first. Edit and delete stay in each post's menu. Delete uses the app's five-second hold.
                  </Text>
                </Stack>
              </Surface>
              <Anchor href="#" underline="never" size="sm">
                Back to FAQ
              </Anchor>
            </Stack>
          </PageLayout.Toolbar>
          <PageLayout.Content>
            <div className={styles.container}>
              {state.questionDeleted ? (
                <Card title="Question deleted">
                  <Text>The thread is removed in this preview.</Text>
                  <Button mt="md" variant="default" onClick={() => dispatch({ type: 'reset' })}>
                    Restore preview
                  </Button>
                </Card>
              ) : (
                <div className={styles.discussion}>
                  <div className={styles.question}>
                    <div className={styles.post}>
                      <div className={styles.author}>
                        <Contributor person={people.leonard} label="Asked by" />
                      </div>
                      <Card
                        title={state.question}
                        action={state.editing === 'question' ? undefined : actions('question', true)}
                      >
                        <Stack gap="md">
                          <Group gap="xs">
                            <StatusBadge tone={state.accepted ? 'positive' : 'neutral'}>
                              {state.accepted ? 'Answered' : 'Open question'}
                            </StatusBadge>
                            <Text size="xs" c="dimmed">
                              Asked Oct 16, 2026 · {state.posts.length} answers
                            </Text>
                          </Group>
                          {state.editing === 'question' ? (
                            editor('question', state.question)
                          ) : (
                            <Text size="sm" c="dimmed">
                              One answer per member. You can update your own.
                            </Text>
                          )}
                        </Stack>
                      </Card>
                    </div>
                  </div>
                  <Context />
                  <div className={styles.answers}>
                    <Section
                      title={`${state.posts.length} answers`}
                      id="discussion"
                      description={
                        state.accepted
                          ? 'Accepted answer first. Other answers run from oldest to newest.'
                          : 'Answers run from oldest to newest.'
                      }
                    >
                      <ul className={styles.answerList}>
                        {visible.map((post) => {
                          const accepted = state.accepted === post.id;
                          const editing = state.editing === post.id;
                          return (
                            <li key={post.id} className={styles.post}>
                              <div className={styles.author}>
                                <Contributor person={post.author} label={post.own ? 'You' : undefined} />
                              </div>
                              <Surface as="article" aria-label={`${post.author.name}'s answer`} padding="lg">
                                <Stack gap="md">
                                  <Group justify="space-between" align="start" wrap="nowrap">
                                    <Group gap="xs">
                                      {accepted ? (
                                        <StatusBadge tone="positive">Accepted answer</StatusBadge>
                                      ) : (
                                        <Text size="xs" fw={700}>
                                          Answer
                                        </Text>
                                      )}
                                      <Text size="xs" c="dimmed">
                                        {post.date}
                                      </Text>
                                    </Group>
                                    {!editing ? actions(post.id, post.own) : null}
                                  </Group>
                                  {accepted ? (
                                    <Text size="xs" c="dimmed">
                                      Accepted by Leonard van der Meer on Oct 20, 2026
                                    </Text>
                                  ) : null}
                                  {editing ? (
                                    editor(post.id, post.text)
                                  ) : (
                                    <>
                                      <div className={styles.prose}>
                                        <FormattedTextSource source={post.text} />
                                      </div>
                                      {state.accepted === null ? (
                                        <Group justify="flex-end">
                                          <Tooltip label="Mark as accepted answer">
                                            <Button
                                              color="confirm"
                                              variant="filled"
                                              size="sm"
                                              leftSection={<BadgeCheck size={17} />}
                                              aria-label="Accept answer"
                                              onClick={() => dispatch({ type: 'accept', id: post.id })}
                                            >
                                              Accept answer
                                            </Button>
                                          </Tooltip>
                                        </Group>
                                      ) : null}
                                    </>
                                  )}
                                </Stack>
                              </Surface>
                            </li>
                          );
                        })}
                      </ul>
                      <Text size="sm" c="dimmed">
                        {state.posts.some((post) => post.own)
                          ? 'You have already answered. You can update your answer above.'
                          : 'Your answer was removed in this preview. Reset to try the controls again.'}
                      </Text>
                    </Section>
                  </div>
                </div>
              )}
            </div>
          </PageLayout.Content>
        </PageLayout>
      </ApplicationChrome>
      <div className={styles.previewStatus}>
        <Surface padding="sm">
          <Stack gap="xs">
            <Group gap="xs" wrap="nowrap">
              <Text size="sm" fw={700} className={styles.previewLabel}>
                Accept + menu
              </Text>
              <IconAction
                label="Reset prototype"
                icon={<RotateCcw size={17} />}
                intent="neutral"
                emphasis="standard"
                size="lg"
                onClick={() => dispatch({ type: 'reset' })}
              />
            </Group>
            <Text size="xs" c="dimmed" aria-live="polite">
              {state.event}
            </Text>
          </Stack>
        </Surface>
      </div>
    </ShellPageBackdrop>
  );
}
