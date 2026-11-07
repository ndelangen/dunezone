import { Anchor, Group, Menu, Popover, Stack, Text, Tooltip } from '@mantine/core';
/* oxlint-disable-next-line no-restricted-imports -- A full-width disclosure toggle for the context panel, not an action. */
import { Button } from '@mantine/core';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, notFound, Link, useNavigate } from '@tanstack/react-router';
import { ActionError } from '@ui/block/ActionError';
import { FactionCard } from '@ui/block/FactionCard';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { formatStableDate } from '@ui/content/dates';
import { EmptyNote } from '@ui/content/EmptyNote';
import { Eyebrow } from '@ui/content/Eyebrow';
import { FAQ_TAG_LABELS } from '@ui/content/faqTagLabels';
import { FormattedTextSource } from '@ui/content/FormattedText';
import { GroupLink } from '@ui/content/GroupLink';
import { ProfileLink } from '@ui/content/ProfileLink';
import { RulesetLink } from '@ui/content/RulesetLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FaqTagFieldset } from '@ui/control/FaqTagFieldset';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { HoldAction } from '@ui/control/HoldAction';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { AddAction } from '@ui/control/ListLengthActions';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { SaveAction } from '@ui/control/SaveAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { ChipList } from '@ui/list/ChipList';
import { FaqList } from '@ui/list/FaqList';
import { TileGrid } from '@ui/list/TileGrid';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  ArrowLeft,
  BadgeCheck,
  BadgeMinus,
  ChevronDown,
  EllipsisVertical,
  MessageSquarePlus,
  Pencil,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { isPublicPageNotFound, loadPublicPage } from '@db/core/publicPage';
import { loadFaqQuestionPage, useFaqQuestionPage } from '@db/faq';
import type { FaqReferencePreview } from '@db/faq';
import { CataloguePicker } from '@app/pickers/CataloguePicker';
import { redirectFromFormerAddress } from '@app/routes/formerAddress';
import { publicPageHead, publicDescription, useLivePageTitle } from '@app/routes/publicPage';
import { RouteLoadError, RouteNotFound } from '@app/routes/routeStates';
import { AssetCatalogueTile } from '@app/widgets/asset-face/AssetCatalogueTile';
import { LoginGate } from '@app/widgets/page-message/LoginGate';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { RoutePending } from '@app/widgets/page-message/RoutePending';

import styles from './$questionSlug.module.css';
import { INITIAL_FAQ_EDITING_STATE, createFaqEditingSession, faqQuestionHasChanges } from './faqEditingSession';
import type { FaqEditingPorts, FaqEditingState } from './faqEditingSession';
import { questionTitle } from './questionTitle';

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/faq/$questionSlug')({
  ssr: true,
  loader: async ({ params, location }) => {
    const page = await loadPublicPage(loadFaqQuestionPage(params));
    if (!page) {
      await redirectFromFormerAddress(
        { kind: 'faq', ruleset_slug: params.rulesetSlug, question_slug: params.questionSlug },
        location
      );
      throw notFound();
    }
    return { page };
  },
  errorComponent: FaqDetailError,
  head: ({ loaderData, params, match }) =>
    publicPageHead({
      name: loaderData ? questionTitle(loaderData.page.question.text) : 'FAQ question',
      kind: loaderData ? 'FAQ' : undefined,
      pathname: `/rulesets/${encodeURIComponent(params.rulesetSlug)}/faq/${encodeURIComponent(params.questionSlug)}`,
      description: loaderData
        ? publicDescription(
            `${loaderData.page.ruleset.name}. ${loaderData.page.answers.some((answer) => answer.accepted) ? 'Accepted answer available.' : 'Open question.'} ${loaderData.page.question.text}`
          )
        : '',
      social: { kind: 'FAQ question', shape: 'portrait' },
      trail: [
        { name: 'Rulesets', pathname: '/rulesets' },
        ...(loaderData
          ? [
              {
                name: loaderData.page.ruleset.name,
                pathname: `/rulesets/${encodeURIComponent(loaderData.page.ruleset.slug)}`,
              },
            ]
          : []),
      ],
      match,
    }),
  component: FaqDetailPage,
});

/** Backend failures remain errors; a live deletion has its own absence message. */
function FaqDetailError({ error }: ErrorComponentProps) {
  const { rulesetSlug } = Route.useParams();
  if (isPublicPageNotFound(error)) {
    return (
      <RouteNotFound
        title="FAQ"
        back={
          <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug }}>
            Back to ruleset
          </PageMessage.Back>
        }
        noun="FAQ question"
      />
    );
  }
  return (
    <RouteLoadError
      title="FAQ"
      back={
        <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug }}>
          Back to ruleset
        </PageMessage.Back>
      }
      what="This question could not be loaded"
      error={error}
    />
  );
}

type FaqQuestionCommands = ReturnType<typeof useFaqQuestionPage>;
type FaqAnswer = NonNullable<FaqQuestionCommands['page']>['answers'][number];
type FaqPostEditing = {
  faq: FaqQuestionCommands;
  editing: FaqEditingState;
  editingSession: ReturnType<typeof createFaqEditingSession>;
};

function AddAnswerForm({ createAnswer }: { createAnswer: FaqQuestionCommands['createAnswer'] }) {
  const [answer, setAnswer] = useState('');

  return (
    <Stack
      component="form"
      gap="sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (!answer.trim()) {
          return;
        }
        void createAnswer
          .run({ answer })
          .then(() => setAnswer(''))
          .catch(() => undefined);
      }}
    >
      <ControlBlock
        title="Your answer"
        description="Post one answer. You can update it later."
        input={(fieldProps) => (
          <FormattedTextInput
            {...fieldProps}
            error={createAnswer.isError ? createAnswer.error?.message : undefined}
            name="answer"
            rows={3}
            required
            minLength={1}
            placeholder="Your answer..."
            value={answer}
            onChange={setAnswer}
          />
        )}
      />
      <Group gap="xs" wrap="nowrap">
        <IconAction
          label="Add answer"
          emphasis="strong"
          intent="positive"
          size="lg"
          type="submit"
          disabled={createAnswer.isPending}
          icon={<MessageSquarePlus size={16} aria-hidden />}
        />
      </Group>
    </Stack>
  );
}

function createPageEditingSession(initial: ReturnType<typeof useFaqQuestionPage>, onState: FaqEditingPorts['onState']) {
  let commands = initial;
  return {
    session: createFaqEditingSession({
      editQuestion: (input) => commands.editQuestion.run(input),
      editAnswer: (input) => commands.editAnswer.run(input),
      onState,
    }),
    update(next: typeof initial) {
      commands = next;
    },
  };
}

/** The question's frame while it and its answers load. */
function FaqQuestionPending() {
  const { rulesetSlug } = Route.useParams();
  return (
    <RoutePending
      title="FAQ"
      back={
        <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug }}>
          Back to ruleset
        </PageMessage.Back>
      }
      loading="Loading question"
    >
      This question and its answers are still loading.
    </RoutePending>
  );
}

function FaqDetailPage() {
  const { rulesetSlug, questionSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate();
  const faq = useFaqQuestionPage(
    { rulesetSlug, questionSlug },
    {
      initialPage: loaderData.page,
    }
  );

  useLivePageTitle(faq.page ? questionTitle(faq.page.question.text) : undefined, 'FAQ');

  const [editing, setEditing] = useState(INITIAL_FAQ_EDITING_STATE);
  const [binding] = useState(() => createPageEditingSession(faq, setEditing));
  useLayoutEffect(() => binding.update(faq), [binding, faq]);
  const editingSession = binding.session;

  const page = faq.page;
  const item = page?.question;
  const answers = useMemo(() => page?.answers ?? [], [page?.answers]);

  useEffect(() => {
    if (!item) {
      return;
    }
    const scrollToHash = () => {
      const targetSlug = window.location.hash.slice(1).trim();
      if (!targetSlug) {
        return;
      }
      const answer = answers.find((row) => row.author?.slug === targetSlug);
      if (!answer) {
        return;
      }
      const node = document.getElementById(`faq-answer-${answer.id}`);
      node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
  }, [item, answers]);

  if (!item) {
    return <FaqQuestionPending />;
  }

  /* The page is the same for everyone; its controls follow the viewer, whose capabilities are the signed-out ones until the session settles. */
  const showAddAnswerForm = page.viewer.answerQuestion;

  const handleDeleteQuestion = () => {
    void faq.deleteQuestion
      .run()
      .then(() => navigate({ to: '/rulesets/$rulesetSlug', params: { rulesetSlug } }))
      .catch(() => undefined);
  };

  const hasAcceptedAnswer = answers.some((answer) => answer.accepted);

  return (
    <PageLayout>
      <PageLayout.Header size="collapsed">
        <PageTitle title="FAQ discussion" />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <FaqNavigation rulesetSlug={page.ruleset.slug} />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <div className={styles.container}>
          <div className={styles.discussion}>
            <FaqQuestionPost
              faq={faq}
              editing={editing}
              editingSession={editingSession}
              onDelete={handleDeleteQuestion}
            />
            <FaqContext faq={faq} />
            <div className={styles.answers}>
              <Section title={`${answers.length} ${answers.length === 1 ? 'answer' : 'answers'}`} id="discussion">
                <Text size="sm" c="dimmed">
                  {hasAcceptedAnswer
                    ? 'Accepted answer first. Other answers run from oldest to newest.'
                    : 'Answers run from oldest to newest.'}
                </Text>
                <ActionError
                  subject="Answer"
                  verb="update"
                  error={faq.setAcceptedAnswer.error ?? faq.deleteAnswer.error}
                />
                {answers.length ? (
                  <ul className={styles.answerList}>
                    {answers.map((answer) => (
                      <li
                        key={answer.id}
                        id={`faq-answer-${answer.id}`}
                        className={styles.post}
                        data-accepted={answer.accepted}
                      >
                        <FaqAnswerPost
                          faq={faq}
                          answer={answer}
                          editing={editing}
                          editingSession={editingSession}
                          hasAcceptedAnswer={hasAcceptedAnswer}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyNote>No answers yet. Be the first to answer.</EmptyNote>
                )}
                {showAddAnswerForm ? (
                  <Card title="Your answer">
                    <AddAnswerForm createAnswer={faq.createAnswer} />
                  </Card>
                ) : faq.hasAnswered ? (
                  <Text c="dimmed" size="sm">
                    You have already answered. You can update your answer above.
                  </Text>
                ) : page.viewerResolved ? (
                  <LoginGate action="answer this question" />
                ) : null}
              </Section>
            </div>
            {/* Left out while nothing relates, as Related FAQ is on detail pages: an empty heading says nothing a reader can act on. */}
            {page.relatedQuestions.length > 0 ? (
              <div className={styles.related}>
                <Section title="Related questions" help="More questions about the same factions and assets.">
                  <FaqList
                    items={page.relatedQuestions}
                    emptyLabel="No related questions yet."
                    onOpenQuestion={(questionSlug, rulesetSlug) =>
                      void navigate({
                        to: '/rulesets/$rulesetSlug/faq/$questionSlug',
                        params: { rulesetSlug, questionSlug },
                      })
                    }
                  />
                </Section>
              </div>
            ) : null}
          </div>
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}

function FaqNavigation({ rulesetSlug }: { rulesetSlug: string }) {
  return (
    <Toolbar>
      <Toolbar.Left label="Navigation">
        <IconAction
          label="Back to FAQ"
          emphasis="standard"
          intent="neutral"
          size="lg"
          icon={<ArrowLeft size={17} aria-hidden />}
          renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets/$rulesetSlug/faq" params={{ rulesetSlug }} />}
        />
      </Toolbar.Left>
    </Toolbar>
  );
}

function FaqAnswerPost({
  faq,
  answer,
  editing,
  editingSession,
  hasAcceptedAnswer,
}: FaqPostEditing & { answer: FaqAnswer; hasAcceptedAnswer: boolean }) {
  return (
    <>
      <div className={styles.author}>
        <FaqContributor author={answer.author} label={answer.capabilities.editAnswer ? 'You' : undefined} />
      </div>
      <Surface as="article" aria-label={`${answer.author?.username ?? 'Former contributor'}'s answer`} padding="lg">
        <Stack gap="md">
          <FaqAnswerHeading faq={faq} answer={answer} editing={editing} editingSession={editingSession} />
          {editing.editingAnswerId === answer.id ? (
            <Stack gap="sm">
              <ControlBlock
                title="Edit your answer"
                input={(fieldProps) => (
                  <FormattedTextInput
                    {...fieldProps}
                    value={editing.answerValue}
                    onChange={(value) => editingSession.setAnswerValue(value)}
                    rows={3}
                  />
                )}
              />
              <ActionError subject="Answer" verb="save" error={faq.editAnswer.error} />
              <FaqEditorActions
                name="answer"
                dirty={editing.answerValue.trim() !== answer.text}
                pending={faq.editAnswer.isPending}
                failed={faq.editAnswer.isError}
                disabledReason={!editing.answerValue.trim() ? 'Enter an answer to save.' : undefined}
                onSave={() => void editingSession.saveAnswer(answer)}
                onCancel={() => editingSession.cancelAnswer()}
              />
            </Stack>
          ) : (
            <>
              <div className={styles.prose}>
                <FormattedTextSource source={answer.text} />
              </div>
              {!hasAcceptedAnswer && answer.capabilities.acceptAnswer ? (
                <Group justify="flex-end">
                  <LabeledAction
                    intent="positive"
                    emphasis="strong"
                    size="sm"
                    icon={<BadgeCheck size={17} />}
                    busy={faq.setAcceptedAnswer.isPending}
                    onClick={() => void faq.setAcceptedAnswer.run({ answerId: answer.id }).catch(() => undefined)}
                  >
                    Accept answer
                  </LabeledAction>
                </Group>
              ) : null}
            </>
          )}
        </Stack>
      </Surface>
    </>
  );
}

function FaqAnswerHeading({ faq, answer, editing, editingSession }: FaqPostEditing & { answer: FaqAnswer }) {
  return (
    <>
      <Group justify="space-between" align="start" wrap="nowrap">
        <Group gap="xs">
          {answer.accepted ? (
            <StatusBadge tone="positive">Accepted answer</StatusBadge>
          ) : (
            <Text size="xs" fw={700}>
              Answer
            </Text>
          )}
          <Text size="xs" c="dimmed">
            <Tooltip label={answer.createdAt}>
              <time dateTime={answer.createdAt}>{formatStableDate(answer.createdAt)}</time>
            </Tooltip>
          </Text>
        </Group>
        {editing.editingAnswerId !== answer.id ? (
          <FaqPostActions
            name="answer"
            onEdit={answer.capabilities.editAnswer ? () => editingSession.startEditAnswer(answer) : undefined}
            onDelete={
              answer.capabilities.deleteAnswer
                ? () => void faq.deleteAnswer.run({ answerId: answer.id }).catch(() => undefined)
                : undefined
            }
            onUnmark={
              answer.capabilities.unacceptAnswer
                ? () => void faq.setAcceptedAnswer.run({ answerId: null }).catch(() => undefined)
                : undefined
            }
            deletePending={faq.deleteAnswer.isPending}
            acceptPending={faq.setAcceptedAnswer.isPending}
          />
        ) : null}
      </Group>
      {answer.acceptedAt ? (
        <Text size="xs" c="dimmed" className={styles.metadata}>
          Accepted by {faq.page!.question.author?.username ?? 'the asker'} on{' '}
          <Tooltip label={answer.acceptedAt}>
            <time dateTime={answer.acceptedAt}>{formatStableDate(answer.acceptedAt)}</time>
          </Tooltip>
        </Text>
      ) : null}
    </>
  );
}

function FaqPostActions({
  name,
  onEdit,
  onDelete,
  onUnmark,
  deletePending = false,
  acceptPending = false,
}: {
  name: 'question' | 'answer';
  onEdit?: () => void;
  onDelete?: () => void;
  onUnmark?: () => void;
  deletePending?: boolean;
  acceptPending?: boolean;
}) {
  if (![onEdit, onDelete, onUnmark].some(Boolean)) {
    return null;
  }
  return (
    <Menu position="bottom-end" withinPortal shadow="md">
      <Menu.Target>
        <IconAction
          label={`Actions for ${name}`}
          icon={<EllipsisVertical size={17} aria-hidden />}
          intent="neutral"
          emphasis="standard"
          size="lg"
        />
      </Menu.Target>
      <Menu.Dropdown>
        {onEdit ? (
          <Menu.Item leftSection={<Pencil size={17} aria-hidden />} onClick={onEdit}>
            Edit {name}
          </Menu.Item>
        ) : null}
        {onUnmark ? (
          <Menu.Item leftSection={<BadgeMinus size={17} aria-hidden />} disabled={acceptPending} onClick={onUnmark}>
            Unmark accepted answer
          </Menu.Item>
        ) : null}
        {onDelete ? (
          <>
            {onEdit || onUnmark ? <Menu.Divider /> : null}
            <HoldAction
              shape="menu-item"
              label={`Hold to delete ${name}`}
              pending={deletePending}
              onConfirm={onDelete}
            />
          </>
        ) : null}
      </Menu.Dropdown>
    </Menu>
  );
}

function FaqEditorActions({
  name,
  dirty,
  pending,
  failed,
  disabledReason,
  onSave,
  onCancel,
}: {
  name: 'question' | 'answer';
  dirty: boolean;
  pending: boolean;
  failed: boolean;
  disabledReason?: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const state = pending ? 'saving' : failed ? 'failed' : dirty ? 'dirty' : 'clean';
  const description = pending
    ? 'Saving changes'
    : failed
      ? 'Could not save. Try again.'
      : dirty
        ? 'Unsaved changes'
        : 'No changes to save';
  return (
    <Group justify="flex-end" gap="xs" wrap="nowrap">
      <IconAction
        label={`Cancel editing ${name}`}
        tooltip={dirty ? 'Discard unsaved changes' : 'Close editor'}
        intent={dirty ? 'negative' : 'neutral'}
        emphasis="standard"
        size="lg"
        icon={<X size={17} aria-hidden />}
        disabled={pending}
        onClick={onCancel}
      />
      <SaveAction
        label={`Save ${name}`}
        state={state}
        lines={[description]}
        disabledReason={disabledReason}
        disabled={!dirty}
        onSave={onSave}
      />
    </Group>
  );
}

function FaqQuestionPost({
  faq,
  editing,
  editingSession,
  onDelete,
}: {
  faq: FaqQuestionCommands;
  editing: FaqEditingState;
  editingSession: ReturnType<typeof createFaqEditingSession>;
  onDelete: () => void;
}) {
  const { question: item, answers } = faq.page!;
  const hasAcceptedAnswer = answers.some((answer) => answer.accepted);
  const questionHeading = questionTitle(item.text);
  const startEditQuestion = () => editingSession.startEditQuestion(item);
  return (
    <div className={styles.question}>
      <div className={styles.post}>
        <div className={styles.author}>
          <FaqContributor author={item.author} label="Asked by" />
        </div>
        <Card
          title={questionHeading}
          action={
            editing.editingQuestion ? null : (
              <FaqPostActions
                name="question"
                onEdit={item.capabilities.editQuestion ? startEditQuestion : undefined}
                onDelete={item.capabilities.deleteQuestion ? onDelete : undefined}
                deletePending={faq.deleteQuestion.isPending}
              />
            )
          }
        >
          <Stack gap="md">
            <Group gap="xs">
              <StatusBadge tone={hasAcceptedAnswer ? 'positive' : 'neutral'}>
                {hasAcceptedAnswer ? 'Answered' : 'Open question'}
              </StatusBadge>
              <Text size="xs" c="dimmed">
                <Tooltip label={item.createdAt}>
                  <time dateTime={item.createdAt}>Asked {formatStableDate(item.createdAt)}</time>
                </Tooltip>{' '}
                · {answers.length} {answers.length === 1 ? 'answer' : 'answers'}
              </Text>
            </Group>
            <ActionError subject="Question" verb="delete" error={faq.deleteQuestion.error} />
            {editing.editingQuestion ? (
              <FaqQuestionEditor faq={faq} editing={editing} editingSession={editingSession} />
            ) : item.text.trim() !== questionHeading ? (
              <div className={styles.prose}>
                <FormattedTextSource source={item.text} />
              </div>
            ) : null}
            <Group gap="xs">
              <Anchor href="#discussion" size="sm" underline="never">
                Read the answers
              </Anchor>
              <ChipList items={(item.tags ?? []).map((tag) => ({ key: tag, label: FAQ_TAG_LABELS[tag] }))} />
            </Group>
          </Stack>
        </Card>
      </div>
    </div>
  );
}

function FaqQuestionEditor({ faq, editing, editingSession }: FaqPostEditing) {
  const item = faq.page!.question;
  return (
    <Stack gap="sm">
      <ControlBlock
        title="Edit question"
        input={(fieldProps) => (
          <FormattedTextInput
            {...fieldProps}
            value={editing.questionValue}
            onChange={(value) => editingSession.setQuestionValue(value)}
            profile="marks-only"
            rows={2}
          />
        )}
      />
      <FaqTagFieldset value={editing.tagValues} onToggle={(tag, checked) => editingSession.toggleTag(tag, checked)} />
      <ActionError subject="Question" verb="save" error={faq.editQuestion.error} />
      <FaqEditorActions
        name="question"
        dirty={faqQuestionHasChanges(item, editing)}
        pending={faq.editQuestion.isPending}
        failed={faq.editQuestion.isError}
        disabledReason={
          !editing.questionValue.trim()
            ? 'Enter a question to save.'
            : editing.tagValues.length === 0
              ? 'Choose at least one tag.'
              : undefined
        }
        onSave={() => void editingSession.saveQuestion(item)}
        onCancel={() => editingSession.cancelQuestion()}
      />
    </Stack>
  );
}

type FaqAuthor = NonNullable<NonNullable<FaqQuestionCommands['page']>['question']['author']>;

function FaqContributor({ author, label }: { author: FaqAuthor | null; label?: string }) {
  return (
    <Stack gap="xs" className={styles.contributor}>
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      {author ? (
        <>
          <ProfileLink
            slug={author.slug}
            name={author.username ?? 'Contributor'}
            image={author.avatarUrl}
            underline="never"
            presentation="contributor"
          />
          <Text size="xs" c="dimmed" className={styles.counts}>
            <span>
              {author.questionCount} {author.questionCount === 1 ? 'question' : 'questions'}
            </span>
            <span>
              {author.answerCount} {author.answerCount === 1 ? 'answer' : 'answers'}
            </span>
          </Text>
          {author.groups.length ? (
            <div className={styles.memberships}>
              {author.groups.map((group) => (
                <GroupLink key={group.id} slug={group.slug} name={group.name} />
              ))}
            </div>
          ) : null}
          {author.hasMoreGroups ? (
            <Anchor
              size="xs"
              renderRoot={(rootProps) => (
                <Link {...rootProps} to="/profiles/$profileSlug" params={{ profileSlug: author.slug }} />
              )}
            >
              All groups
            </Anchor>
          ) : null}
        </>
      ) : (
        <Text size="sm" c="dimmed">
          Former contributor
        </Text>
      )}
    </Stack>
  );
}

function FaqContext({ faq }: { faq: FaqQuestionCommands }) {
  const [open, setOpen] = useState(false);
  return (
    <aside className={styles.aside} aria-label="Question context">
      <Button
        fullWidth
        variant="default"
        className={styles.contextToggle}
        aria-expanded={open}
        rightSection={<ChevronDown size={16} aria-hidden />}
        onClick={() => setOpen(!open)}
      >
        Ruleset and references
      </Button>
      <div className={styles.contextContent} data-open={open}>
        <Section title="Ruleset">
          <RulesetLink name={faq.page!.ruleset.name} slug={faq.page!.ruleset.slug} />
          <Text size="sm" c="dimmed">
            This discussion follows {faq.page!.ruleset.name}.
          </Text>
        </Section>
        <FaqReferencesSection faq={faq} />
      </div>
    </aside>
  );
}

function FaqReferenceTile({ reference, action }: { reference: FaqReferencePreview; action?: ReactNode }) {
  return (
    <Stack gap="xs">
      {reference.kind === 'faction' ? (
        <FactionCard faction={reference.faction} />
      ) : (
        <AssetCatalogueTile entry={reference.asset} />
      )}
      {action ? <Group justify="center">{action}</Group> : null}
    </Stack>
  );
}

function FaqReferencesSection({ faq }: { faq: FaqQuestionCommands }) {
  const hasMore = faq.referencesStatus === 'CanLoadMore' || faq.referencesStatus === 'LoadingMore';
  /* A reader who cannot add references meets the section only once there is one, or a later page may hold one
     (a page whose targets were all deleted comes back empty); a maintainer keeps it for its Add action. */
  if (faq.references.length === 0 && !hasMore && !faq.canManageReferences) {
    return null;
  }
  return (
    <Section title="Relates to" action={faq.canManageReferences ? <FaqReferenceAdd faq={faq} /> : undefined}>
      <Stack gap="md">
        <FaqReferenceError faq={faq} />
        <FaqReferenceList faq={faq} />
        {hasMore ? (
          <LoadMoreButton loading={faq.referencesStatus === 'LoadingMore'} onLoadMore={faq.loadMoreReferences} />
        ) : null}
      </Stack>
    </Section>
  );
}

function FaqReferenceAdd({ faq }: { readonly faq: FaqQuestionCommands }) {
  const [opened, setOpened] = useState(false);
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      width={400}
      shadow="md"
      withArrow
      arrowPosition="center"
      trapFocus
      returnFocus
      preventPositionChangeWhenVisible={false}
      middlewares={{
        shift: { crossAxis: true },
        size: {
          apply: ({ availableHeight, elements }) => {
            elements.floating.style.setProperty('--catalogue-picker-height', `${Math.max(160, availableHeight)}px`);
          },
        },
      }}
      styles={{ dropdown: { maxWidth: 'calc(100vw - var(--space-md) * 2)' } }}
    >
      <Popover.Target>
        <AddAction label="Add references" onClick={() => setOpened((value) => !value)} />
      </Popover.Target>
      <Popover.Dropdown className={styles.referencePicker} role="dialog" aria-label="Add references">
        {opened ? (
          <Stack gap="sm" mih={0} flex={1}>
            <Group justify="space-between" wrap="nowrap">
              <Text fw={700}>Add references</Text>
              <IconAction
                label="Close reference picker"
                emphasis="quiet"
                intent="neutral"
                size="sm"
                icon={<X size={15} aria-hidden />}
                onClick={() => setOpened(false)}
              />
            </Group>
            <CataloguePicker
              selection={{ faqQuestionId: faq.page!.question.id }}
              pending={faq.addReference.isPending}
              onPick={(target) => {
                void faq.addReference.run(target).catch(() => undefined);
              }}
            />
            <ActionError subject="reference" verb="add" error={faq.addReference.error} />
          </Stack>
        ) : null}
      </Popover.Dropdown>
    </Popover>
  );
}

function FaqReferenceList({ faq }: { faq: FaqQuestionCommands }) {
  return faq.references.length > 0 ? (
    <TileGrid size="compact">
      {faq.references.map((reference) => (
        <FaqReferenceTile
          key={reference.id}
          reference={reference}
          action={
            faq.canManageReferences ? (
              <IconAction
                label={`Remove reference to ${reference.kind === 'faction' ? reference.faction.data.name : reference.asset.name}`}
                intent="negative"
                emphasis="quiet"
                size="sm"
                icon={<X size={14} aria-hidden />}
                loading={faq.removeReference.isPending}
                onClick={() => {
                  void faq.removeReference.run(reference).catch(() => undefined);
                }}
              />
            ) : undefined
          }
        />
      ))}
    </TileGrid>
  ) : (
    <EmptyNote>No references yet.</EmptyNote>
  );
}

function FaqReferenceError({ faq }: { faq: FaqQuestionCommands }) {
  return <ActionError subject="references" verb="update" error={faq.addReference.error ?? faq.removeReference.error} />;
}
