import { Badge, Group, Stack, Text } from '@mantine/core';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageIdentity } from '@ui/block/PageIdentity';
import { formatRelativeDate } from '@ui/content/dates';
import { FAQ_TAG_LABELS } from '@ui/content/faqTagLabels';
import { FormattedTextSource } from '@ui/content/FormattedText';
import { ProfileLink } from '@ui/content/ProfileLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { FaqTagFieldset } from '@ui/control/FaqTagFieldset';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Check, MessageCircleReply, MessageSquarePlus, Pencil, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { loadFaqQuestionPage, useFaqQuestionPage } from '@db/faq';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { pageHead } from '@app/routes/pageTitle';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import styles from './$questionSlug.module.css';
import { INITIAL_FAQ_EDITING_STATE, createFaqEditingSession } from './faqEditingSession';
import type { FaqEditingSession } from './faqEditingSession';
import { questionTitle } from './questionTitle';

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/faq/$questionSlug')({
  loader: async ({ params }) => {
    try {
      const page = await loadFaqQuestionPage({
        rulesetSlug: params.rulesetSlug,
        questionSlug: params.questionSlug,
      });
      return { notFound: false, page };
    } catch {
      return { notFound: true };
    }
  },
  errorComponent: FaqDetailError,
  /* A missing question comes back as `notFound: true`, not a thrown notFound, so the head names that page itself. */
  head: ({ loaderData }) =>
    pageHead(
      loaderData?.notFound
        ? 'Page not found'
        : loaderData?.page?.question
          ? questionTitle(loaderData.page.question.text)
          : 'FAQ question'
    ),
  component: FaqDetailPage,
});

/**
 * The frame for a load that failed.
 * Unlike its siblings this route's loader already catches, returning `notFound`;
 * what escapes is the live query, which throws after mount when the question is not there, so the reader met the router's unstyled default with a page half-built behind it.
 */
function FaqDetailError({ error }: ErrorComponentProps) {
  const { rulesetSlug } = Route.useParams();
  return (
    <PageMessage
      title="FAQ"
      back={
        <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug }}>
          Back to ruleset
        </PageMessage.Back>
      }
    >
      <LoadError title="This question could not be loaded" stale={isStaleClientData(error)}>
        {error.message}
      </LoadError>
    </PageMessage>
  );
}

/**
 * The absent case, decided before anything subscribes.
 *
 * It has to live above the body: the question page's hook calls `useQuery` unconditionally, and a
 * Convex query for a question that is not there throws while rendering, which the route's
 * `errorComponent` would catch before any guard further down the body could run.
 * So the guard that was written inside the body could never fire, and a missing question read as a failed load.
 * `AssetDetailPage` splits for the same reason: a guard that must run before a subscription cannot share a component with it.
 */
function FaqDetailPage() {
  const { rulesetSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();

  if (loaderData?.notFound) {
    return (
      <PageMessage
        title="FAQ"
        back={
          <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug }}>
            Back to ruleset
          </PageMessage.Back>
        }
      >
        <NotAvailable title="Question not found">This FAQ question does not exist in this ruleset.</NotAvailable>
      </PageMessage>
    );
  }

  return <LoadedFaqQuestion />;
}

type FaqQuestionCommands = ReturnType<typeof useFaqQuestionPage>;

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
      <FormattedTextInput
        description="Add your answer (1 per person-you can edit it later)"
        error={createAnswer.isError ? createAnswer.error?.message : undefined}
        name="answer"
        rows={3}
        required
        minLength={1}
        placeholder="Your answer..."
        value={answer}
        onChange={setAnswer}
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

function LoadedFaqQuestion() {
  const { rulesetSlug, questionSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate();
  const faq = useFaqQuestionPage(
    { rulesetSlug, questionSlug },
    {
      initialPage: 'page' in loaderData ? loaderData.page : undefined,
    }
  );

  const [editing, setEditing] = useState(INITIAL_FAQ_EDITING_STATE);
  const editingSessionRef = useRef<FaqEditingSession>(undefined);
  const commandsRef = useRef({ faq });
  commandsRef.current = { faq };
  editingSessionRef.current ??= createFaqEditingSession({
    editQuestion: (input) => commandsRef.current.faq.editQuestion.run(input),
    editAnswer: (input) => commandsRef.current.faq.editAnswer.run(input),
    onState: setEditing,
  });
  const editingSession = editingSessionRef.current;

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
    return (
      <PageMessage
        title="FAQ"
        back={
          <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug }}>
            Back to ruleset
          </PageMessage.Back>
        }
      >
        <LoadPending title="Loading question">This question and its answers are still loading.</LoadPending>
      </PageMessage>
    );
  }

  const showAddAnswerForm = page.viewer.answerQuestion;
  const hasUserAnswered = !showAddAnswerForm && answers.some((a) => a.capabilities.editAnswer);

  const handleDeleteQuestion = () => {
    void faq.deleteQuestion
      .run()
      .then(() => navigate({ to: '/rulesets/$rulesetSlug', params: { rulesetSlug } }))
      .catch(() => undefined);
  };

  const startEditQuestion = () => editingSession.startEditQuestion(item);
  const saveQuestion = () => void editingSession.saveQuestion(item);
  const startEditAnswer = (a: (typeof answers)[0]) => editingSession.startEditAnswer(a);
  const saveAnswer = (answerId: string) => void editingSession.saveAnswer(answers.find((x) => x.id === answerId));

  const handleDeleteAnswer = (answerId: string) => {
    void faq.deleteAnswer.run({ answerId }).catch(() => undefined);
  };

  const hasAcceptedAnswer = answers.some((a) => a.accepted);
  const headerStats = [
    {
      key: 'answers',
      icon: <MessageCircleReply size={17} aria-hidden />,
      value: answers.length,
      label: `${answers.length} ${answers.length === 1 ? 'answer' : 'answers'}`,
    },
  ];

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageIdentity
          title={questionTitle(item.text)}
          breadcrumb={
            <PageIdentity.Breadcrumb to="/rulesets/$rulesetSlug" params={{ rulesetSlug: page.ruleset.slug }} hash="faq">
              {page.ruleset.name} FAQ
            </PageIdentity.Breadcrumb>
          }
          maintainers={{
            label: 'Asked by',
            owner: item.author
              ? { slug: item.author.slug, name: item.author.username, image: item.author.avatarUrl }
              : null,
          }}
          stats={headerStats}
        >
          <Text size="sm" c="dimmed">
            <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()}>
              {formatRelativeDate(item.createdAt)}
            </time>
          </Text>
          {hasAcceptedAnswer ? <StatusBadge tone="positive">Answered</StatusBadge> : null}
          {(item.tags ?? []).map((tag) => (
            <Badge key={tag} size="sm" variant="outline" color="dune">
              {FAQ_TAG_LABELS[tag]}
            </Badge>
          ))}
        </PageIdentity>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left label="Navigation">
            <IconAction
              label="Back to ruleset"
              emphasis="standard"
              intent="neutral"
              size="lg"
              renderRoot={(rootProps) => (
                <Link {...rootProps} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: page.ruleset.slug }} />
              )}
              icon={<ArrowLeft size={17} aria-hidden />}
            />
            {item.capabilities.editQuestion ? (
              <IconAction
                label="Edit question"
                emphasis="standard"
                intent="neutral"
                size="lg"
                disabled={editing.editingQuestion}
                onClick={startEditQuestion}
                icon={<Pencil size={17} aria-hidden />}
              />
            ) : null}
          </Toolbar.Left>
          <Toolbar.Right label="Question actions">
            <Toolbar.Cluster kind="discard">
              {item.capabilities.deleteQuestion ? (
                <ConfirmDeleteAction
                  label="Delete question"
                  pending={faq.deleteQuestion.isPending}
                  onConfirm={handleDeleteQuestion}
                />
              ) : null}
            </Toolbar.Cluster>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Surface padding="lg">
          <Stack gap="md">
            {faq.deleteQuestion.error ? (
              <FormError title="Question could not be deleted">{faq.deleteQuestion.error.message}</FormError>
            ) : null}
            {editing.editingQuestion ? (
              <Stack gap="sm">
                <FormattedTextInput
                  label="Edit question"
                  value={editing.questionValue}
                  onChange={(value) => editingSession.setQuestionValue(value)}
                  profile="marks-only"
                  rows={2}
                />
                <FaqTagFieldset
                  value={editing.tagValues}
                  onToggle={(tag, checked) => editingSession.toggleTag(tag, checked)}
                />
                {faq.editQuestion.error ? (
                  <FormError title="Question could not be saved">{faq.editQuestion.error.message}</FormError>
                ) : null}
                <Group gap="xs" wrap="nowrap">
                  <IconAction
                    label="Save question"
                    emphasis="strong"
                    intent="positive"
                    size="lg"
                    onClick={() => saveQuestion()}
                    disabled={faq.editQuestion.isPending}
                    icon={<Check size={16} aria-hidden />}
                  />
                  <IconAction
                    label="Cancel editing question"
                    emphasis="standard"
                    intent="neutral"
                    size="lg"
                    onClick={() => editingSession.cancelQuestion()}
                    icon={<X size={16} aria-hidden />}
                  />
                </Group>
              </Stack>
            ) : null}

            {showAddAnswerForm ? <AddAnswerForm createAnswer={faq.createAnswer} /> : null}

            {hasUserAnswered && !showAddAnswerForm && (
              <p className={styles.hintBlock}>You&apos;ve answered. You can edit your answer below.</p>
            )}

            {answers.length > 0 ? (
              <ul className={styles.answerList}>
                {answers.map((a) => {
                  const isEditing = editing.editingAnswerId === a.id;
                  const isUserAnswer = a.capabilities.editAnswer;
                  const isAccepted = a.accepted;
                  return (
                    <li
                      key={a.id}
                      id={`faq-answer-${a.id}`}
                      className={styles.answerItem}
                      data-accepted={isAccepted ? 'true' : 'false'}
                    >
                      {isEditing ? (
                        <Stack gap="sm">
                          <FormattedTextInput
                            label="Edit your answer"
                            value={editing.answerValue}
                            onChange={(value) => editingSession.setAnswerValue(value)}
                            rows={3}
                          />
                          {faq.editAnswer.error ? (
                            <FormError title="Answer could not be saved">{faq.editAnswer.error.message}</FormError>
                          ) : null}
                          <Group gap="xs" wrap="nowrap">
                            <IconAction
                              label="Save answer"
                              emphasis="strong"
                              intent="positive"
                              size="lg"
                              onClick={() => saveAnswer(a.id)}
                              disabled={faq.editAnswer.isPending}
                              icon={<Check size={16} aria-hidden />}
                            />
                            <IconAction
                              label="Cancel editing answer"
                              emphasis="standard"
                              intent="neutral"
                              size="lg"
                              onClick={() => editingSession.cancelAnswer()}
                              icon={<X size={16} aria-hidden />}
                            />
                          </Group>
                        </Stack>
                      ) : (
                        <Stack gap="xs">
                          {(isAccepted || isUserAnswer || a.author) && (
                            <div className={styles.answerMetaRow}>
                              {isAccepted && <StatusBadge tone="positive">Accepted answer</StatusBadge>}
                              {isUserAnswer && <span>Your answer-you can edit or delete it</span>}
                              {a.author && (
                                <ProfileLink slug={a.author.slug} name={a.author.username} image={a.author.avatarUrl} />
                              )}
                            </div>
                          )}
                          <div className={styles.answerContent}>
                            <FormattedTextSource source={a.text} />
                          </div>
                          <Group gap="xs" wrap="nowrap">
                            {a.capabilities.acceptAnswer && (
                              <IconAction
                                label="Mark as accepted answer"
                                emphasis="strong"
                                intent="positive"
                                size="lg"
                                onClick={() =>
                                  void faq.setAcceptedAnswer.run({ answerId: a.id }).catch(() => undefined)
                                }
                                disabled={faq.setAcceptedAnswer.isPending}
                                icon={<Check size={16} aria-hidden />}
                              />
                            )}
                            {a.capabilities.unacceptAnswer && (
                              <IconAction
                                label="Unmark accepted answer"
                                emphasis="standard"
                                intent="neutral"
                                size="lg"
                                onClick={() =>
                                  void faq.setAcceptedAnswer.run({ answerId: null }).catch(() => undefined)
                                }
                                disabled={faq.setAcceptedAnswer.isPending}
                                icon={<X size={16} aria-hidden />}
                              />
                            )}
                            {a.capabilities.editAnswer && (
                              <IconAction
                                label="Edit your answer"
                                emphasis="strong"
                                intent="positive"
                                size="lg"
                                onClick={() => startEditAnswer(a)}
                                icon={<Pencil size={16} aria-hidden />}
                              />
                            )}
                            {a.capabilities.deleteAnswer && (
                              <ConfirmDeleteAction
                                label="Delete answer"
                                pending={faq.deleteAnswer.isPending}
                                onConfirm={() => handleDeleteAnswer(a.id)}
                              />
                            )}
                          </Group>
                        </Stack>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>No answers yet.</p>
            )}
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}
