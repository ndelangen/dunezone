import { Anchor, Badge, Button, Group, Stack, Text } from '@mantine/core';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, notFound, Link, useNavigate } from '@tanstack/react-router';
import { FactionCard } from '@ui/block/FactionCard';
import { FormError } from '@ui/block/FormError';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { formatStableDate } from '@ui/content/dates';
import { errorMessage } from '@ui/content/errorMessage';
import { Eyebrow } from '@ui/content/Eyebrow';
import { FAQ_TAG_LABELS } from '@ui/content/faqTagLabels';
import { FormattedTextSource } from '@ui/content/FormattedText';
import { GroupLink } from '@ui/content/GroupLink';
import { ProfileLink } from '@ui/content/ProfileLink';
import { RulesetLink } from '@ui/content/RulesetLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { FaqTagFieldset } from '@ui/control/FaqTagFieldset';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { IconAction } from '@ui/control/IconAction';
import { LoadMoreButton } from '@ui/control/LoadMoreButton';
import { PageLayout } from '@ui/layout/PageLayout';
import { FaqList } from '@ui/list/FaqList';
import { TileGrid } from '@ui/list/TileGrid';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Check, ChevronDown, MessageSquarePlus, Pencil, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { isPublicPageNotFound, loadPublicPage } from '@db/core/publicPage';
import { loadFaqQuestionPage, useFaqQuestionPage } from '@db/faq';
import type { FaqReferencePreview } from '@db/faq';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { FaqReferencePicker } from '@app/pickers/FaqReferencePicker';
import { redirectFromFormerAddress } from '@app/routes/formerAddress';
import { publicPageHead, publicDescription, useLivePageTitle } from '@app/routes/publicPage';
import { AssetCatalogueTile } from '@app/widgets/asset-face/AssetCatalogueTile';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import styles from './$questionSlug.module.css';
import { INITIAL_FAQ_EDITING_STATE, createFaqEditingSession } from './faqEditingSession';
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
        {errorMessage(error)}
      </LoadError>
    </PageMessage>
  );
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
        label="Your answer"
        description="Post one answer. You can update it later."
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

  /* The page is the same for everyone; its controls follow the viewer, whose capabilities are the signed-out ones until the session settles. */
  const showAddAnswerForm = page.viewer.answerQuestion;

  const handleDeleteQuestion = () => {
    void faq.deleteQuestion
      .run()
      .then(() => navigate({ to: '/rulesets/$rulesetSlug', params: { rulesetSlug } }))
      .catch(() => undefined);
  };

  const startEditAnswer = (a: (typeof answers)[0]) => editingSession.startEditAnswer(a);
  const saveAnswer = (answerId: string) => void editingSession.saveAnswer(answers.find((x) => x.id === answerId));

  const handleDeleteAnswer = (answerId: string) => {
    void faq.deleteAnswer.run({ answerId }).catch(() => undefined);
  };

  const hasAcceptedAnswer = answers.some((answer) => answer.accepted);

  return (
    <PageLayout>
      <PageLayout.Header size="collapsed">
        <PageTitle title="FAQ discussion" />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Group role="group" aria-label="Navigation">
          <Anchor
            underline="never"
            size="sm"
            renderRoot={(rootProps) => (
              <Link {...rootProps} to="/rulesets/$rulesetSlug/faq" params={{ rulesetSlug: page.ruleset.slug }} />
            )}
          >
            Back to FAQ
          </Anchor>
        </Group>
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
              <Section
                title={`${answers.length} ${answers.length === 1 ? 'answer' : 'answers'}`}
                id="discussion"
                description={
                  hasAcceptedAnswer
                    ? 'Accepted answer first. Other answers run from oldest to newest.'
                    : 'Answers run from oldest to newest.'
                }
              >
                {faq.setAcceptedAnswer.error || faq.deleteAnswer.error ? (
                  <FormError title="Could not update the answer">
                    {errorMessage(faq.setAcceptedAnswer.error ?? faq.deleteAnswer.error)}
                  </FormError>
                ) : null}
                {answers.length ? (
                  <ul className={styles.answerList}>
                    {answers.map((answer) => (
                      <li
                        key={answer.id}
                        id={`faq-answer-${answer.id}`}
                        className={styles.post}
                        data-accepted={answer.accepted}
                      >
                        <div className={styles.author}>
                          <FaqContributor
                            author={answer.author}
                            label={answer.capabilities.editAnswer ? 'You' : undefined}
                          />
                        </div>
                        <Surface
                          as="article"
                          aria-label={`${answer.author?.username ?? 'Former contributor'}'s answer`}
                          padding="lg"
                        >
                          <Stack gap="md">
                            <Group gap="xs">
                              {answer.accepted ? (
                                <StatusBadge tone="positive">Accepted answer</StatusBadge>
                              ) : (
                                <Text size="xs" fw={700}>
                                  Answer
                                </Text>
                              )}
                              <Text size="xs" c="dimmed">
                                <time dateTime={answer.createdAt} title={answer.createdAt}>
                                  {formatStableDate(answer.createdAt)}
                                </time>
                              </Text>
                            </Group>
                            {answer.acceptedAt ? (
                              <Text size="xs" c="dimmed" className={styles.metadata}>
                                Accepted by {item.author?.username ?? 'the asker'} on{' '}
                                <time dateTime={answer.acceptedAt} title={answer.acceptedAt}>
                                  {formatStableDate(answer.acceptedAt)}
                                </time>
                              </Text>
                            ) : null}
                            {editing.editingAnswerId === answer.id ? (
                              <Stack gap="sm">
                                <FormattedTextInput
                                  label="Edit your answer"
                                  value={editing.answerValue}
                                  onChange={(value) => editingSession.setAnswerValue(value)}
                                  rows={3}
                                />
                                {faq.editAnswer.error ? (
                                  <FormError title="Answer could not be saved">
                                    {faq.editAnswer.error.message}
                                  </FormError>
                                ) : null}
                                <Group gap="xs">
                                  <IconAction
                                    label="Save answer"
                                    emphasis="strong"
                                    intent="positive"
                                    onClick={() => saveAnswer(answer.id)}
                                    disabled={faq.editAnswer.isPending}
                                    icon={<Check size={16} aria-hidden />}
                                  />
                                  <IconAction
                                    label="Cancel editing answer"
                                    emphasis="standard"
                                    intent="neutral"
                                    onClick={() => editingSession.cancelAnswer()}
                                    icon={<X size={16} aria-hidden />}
                                  />
                                </Group>
                              </Stack>
                            ) : (
                              <>
                                <div className={styles.prose}>
                                  <FormattedTextSource source={answer.text} />
                                </div>
                                <Group gap="xs">
                                  {answer.capabilities.acceptAnswer ? (
                                    <IconAction
                                      label="Mark as accepted answer"
                                      emphasis="strong"
                                      intent="positive"
                                      disabled={faq.setAcceptedAnswer.isPending}
                                      onClick={() =>
                                        void faq.setAcceptedAnswer.run({ answerId: answer.id }).catch(() => undefined)
                                      }
                                      icon={<Check size={16} aria-hidden />}
                                    />
                                  ) : null}
                                  {answer.capabilities.unacceptAnswer ? (
                                    <IconAction
                                      label="Unmark accepted answer"
                                      emphasis="standard"
                                      intent="neutral"
                                      disabled={faq.setAcceptedAnswer.isPending}
                                      onClick={() =>
                                        void faq.setAcceptedAnswer.run({ answerId: null }).catch(() => undefined)
                                      }
                                      icon={<X size={16} aria-hidden />}
                                    />
                                  ) : null}
                                  {answer.capabilities.editAnswer ? (
                                    <IconAction
                                      label="Edit your answer"
                                      emphasis="standard"
                                      intent="neutral"
                                      onClick={() => startEditAnswer(answer)}
                                      icon={<Pencil size={16} aria-hidden />}
                                    />
                                  ) : null}
                                  {answer.capabilities.deleteAnswer ? (
                                    <ConfirmDeleteAction
                                      label="Delete answer"
                                      pending={faq.deleteAnswer.isPending}
                                      onConfirm={() => handleDeleteAnswer(answer.id)}
                                    />
                                  ) : null}
                                </Group>
                              </>
                            )}
                          </Stack>
                        </Surface>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Text c="dimmed" size="sm">
                    No answers yet. Be the first to answer.
                  </Text>
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
                  <Anchor
                    size="sm"
                    renderRoot={(rootProps) => (
                      <Link
                        {...rootProps}
                        to="/auth/login"
                        search={{ redirect: `/rulesets/${page.ruleset.slug}/faq/${item.slug}` }}
                      />
                    )}
                  >
                    Sign in to answer
                  </Anchor>
                ) : null}
              </Section>
            </div>
            <div className={styles.related}>
              <Section title="Related questions" description="More questions about the same factions and assets.">
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
          </div>
        </div>
      </PageLayout.Content>
    </PageLayout>
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
  const saveQuestion = () => void editingSession.saveQuestion(item);
  return (
    <div className={styles.question}>
      <div className={styles.post}>
        <div className={styles.author}>
          <FaqContributor author={item.author} label="Asked by" />
        </div>
        <Card
          title={questionHeading}
          action={
            <Group role="group" aria-label="Question actions" gap="xs">
              {item.capabilities.editQuestion ? (
                <IconAction
                  label="Edit question"
                  emphasis="standard"
                  intent="neutral"
                  disabled={editing.editingQuestion}
                  onClick={startEditQuestion}
                  icon={<Pencil size={16} aria-hidden />}
                />
              ) : null}
              {item.capabilities.deleteQuestion ? (
                <ConfirmDeleteAction
                  label="Delete question"
                  pending={faq.deleteQuestion.isPending}
                  onConfirm={onDelete}
                />
              ) : null}
            </Group>
          }
        >
          <Stack gap="md">
            <Group gap="xs">
              <StatusBadge tone={hasAcceptedAnswer ? 'positive' : 'neutral'}>
                {hasAcceptedAnswer ? 'Answered' : 'Open question'}
              </StatusBadge>
              <Text size="xs" c="dimmed">
                <time dateTime={item.createdAt} title={item.createdAt}>
                  Asked {formatStableDate(item.createdAt)}
                </time>{' '}
                · {answers.length} {answers.length === 1 ? 'answer' : 'answers'}
              </Text>
            </Group>
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
                <Group gap="xs">
                  <IconAction
                    label="Save question"
                    emphasis="strong"
                    intent="positive"
                    onClick={saveQuestion}
                    disabled={faq.editQuestion.isPending}
                    icon={<Check size={16} aria-hidden />}
                  />
                  <IconAction
                    label="Cancel editing question"
                    emphasis="standard"
                    intent="neutral"
                    onClick={() => editingSession.cancelQuestion()}
                    icon={<X size={16} aria-hidden />}
                  />
                </Group>
              </Stack>
            ) : item.text.trim() !== questionHeading ? (
              <div className={styles.prose}>
                <FormattedTextSource source={item.text} />
              </div>
            ) : null}
            <Group gap="xs">
              <Anchor href="#discussion" size="sm" underline="never">
                Read the answers
              </Anchor>
              {(item.tags ?? []).map((tag) => (
                <Badge key={tag} size="xs" variant="outline" color="dune">
                  {FAQ_TAG_LABELS[tag]}
                </Badge>
              ))}
            </Group>
          </Stack>
        </Card>
      </div>
    </div>
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
            className={styles.identity}
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
  const [addingReferences, setAddingReferences] = useState(false);
  return (
    <Section
      title="Relates to"
      action={
        faq.canManageReferences && !addingReferences ? (
          <Button size="compact-xs" variant="default" onClick={() => setAddingReferences(true)}>
            Add references
          </Button>
        ) : undefined
      }
    >
      <Stack gap="md">
        {addingReferences && faq.canManageReferences ? (
          <FaqReferencePicker
            selectedIds={faq.references.map((reference) => reference.id)}
            pending={faq.addReference.isPending}
            onPick={(target) => {
              void faq.addReference.run(target).catch(() => undefined);
            }}
            onCancel={() => setAddingReferences(false)}
          />
        ) : null}
        <FaqReferenceError faq={faq} />
        <FaqReferenceList faq={faq} />
        {faq.referencesStatus === 'CanLoadMore' || faq.referencesStatus === 'LoadingMore' ? (
          <LoadMoreButton loading={faq.referencesStatus === 'LoadingMore'} onLoadMore={faq.loadMoreReferences} />
        ) : null}
      </Stack>
    </Section>
  );
}

function FaqReferenceList({ faq }: { faq: FaqQuestionCommands }) {
  return faq.references.length > 0 ? (
    <TileGrid density="compact">
      {faq.references.map((reference) => (
        <FaqReferenceTile
          key={reference.id}
          reference={reference}
          action={
            faq.canManageReferences ? (
              <Button
                variant="subtle"
                size="compact-xs"
                disabled={faq.removeReference.isPending}
                aria-label={`Remove reference to ${reference.kind === 'faction' ? reference.faction.data.name : reference.asset.name}`}
                onClick={() => {
                  void faq.removeReference.run(reference).catch(() => undefined);
                }}
              >
                Remove
              </Button>
            ) : undefined
          }
        />
      ))}
    </TileGrid>
  ) : (
    <Text size="sm" c="dimmed">
      No references yet.
    </Text>
  );
}

function FaqReferenceError({ faq }: { faq: FaqQuestionCommands }) {
  return faq.addReference.error || faq.removeReference.error ? (
    <FormError title="Could not update references">
      {errorMessage(faq.addReference.error ?? faq.removeReference.error)}
    </FormError>
  ) : null;
}
