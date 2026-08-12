import { ActionIcon, Group, Input, Stack, Textarea, Tooltip } from '@mantine/core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Surface } from '@ui/surface';
import { Check, MessageSquarePlus, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { loadFaqQuestionPage, useFaqQuestionPage } from '@db/faq';
import { ProfileLink } from '@app/components/content/ProfileLink';
import { PageLayout } from '@app/components/layout/PageLayout';
import { INITIAL_FAQ_EDITING_STATE, createFaqEditingSession } from '@app/faq/faqEditingSession';
import type { FaqEditingSession } from '@app/faq/faqEditingSession';
import { FAQ_TAG_LABELS, FAQ_TAG_VALUES } from '@app/faq/tags';

import styles from './$questionSlug.module.css';

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
  component: FaqDetailPage,
});

function FaqDetailPage() {
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

  const header = (
    <div>
      <h1>FAQ</h1>
      <p>
        {item ? (
          <>
            <Link
              to="/rulesets/$rulesetSlug"
              params={{ rulesetSlug: page?.ruleset.slug ?? rulesetSlug }}
            >
              Back to ruleset
            </Link>
            {' · '}
          </>
        ) : null}
        <Link to="/rulesets">Back to rulesets</Link>
      </p>
    </div>
  );

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

  if (loaderData?.notFound) {
    return (
      <PageLayout header={header}>
        <Surface padding="lg">
          <h2>Question not found</h2>
          <p>This FAQ question does not exist in this ruleset.</p>
        </Surface>
      </PageLayout>
    );
  }

  if (!item) {
    return <PageLayout header={header}>Loading question…</PageLayout>;
  }

  const showAddAnswerForm = page.viewer.answerQuestion;
  const hasUserAnswered = !showAddAnswerForm && answers.some((a) => a.capabilities.editAnswer);

  const handleDeleteQuestion = () => {
    if (!window.confirm('Delete this question and all its answers? This cannot be undone.')) {
      return;
    }
    void faq.deleteQuestion
      .run()
      .then(() => navigate({ to: '/rulesets/$rulesetSlug', params: { rulesetSlug } }))
      .catch(() => undefined);
  };

  const startEditQuestion = () => editingSession.startEditQuestion(item);
  const saveQuestion = () => void editingSession.saveQuestion(item);
  const startEditAnswer = (a: (typeof answers)[0]) => editingSession.startEditAnswer(a);
  const saveAnswer = (answerId: string) =>
    void editingSession.saveAnswer(answers.find((x) => x.id === answerId));

  const handleDeleteAnswer = (answerId: string) => {
    if (!window.confirm('Delete this answer?')) {
      return;
    }
    void faq.deleteAnswer.run({ answerId }).catch(() => undefined);
  };

  return (
    <PageLayout header={header}>
      <Surface padding="lg">
        <Stack gap="md">
          <Stack gap="sm">
            {editing.editingQuestion ? (
              <Stack gap="sm">
                <Textarea
                  label="Edit question"
                  value={editing.questionValue}
                  onChange={(e) => editingSession.setQuestionValue(e.target.value)}
                  rows={2}
                />
                <Input.Wrapper label="Tags">
                  <Stack component="fieldset" gap="xs" className={styles.tagFieldset}>
                    <legend className={styles.visuallyHidden}>FAQ tags</legend>
                    {FAQ_TAG_VALUES.map((tag) => (
                      <label key={tag} className={styles.tagOption}>
                        <input
                          type="checkbox"
                          checked={editing.tagValues.includes(tag)}
                          onChange={(e) => editingSession.toggleTag(tag, e.target.checked)}
                        />
                        <span>{FAQ_TAG_LABELS[tag]}</span>
                      </label>
                    ))}
                  </Stack>
                </Input.Wrapper>
                <Group gap="xs" wrap="nowrap">
                  <Tooltip label="Save question">
                    <ActionIcon
                      variant="filled"
                      color="confirm"
                      size="lg"
                      type="button"
                      aria-label="Save question"
                      onClick={() => saveQuestion()}
                      disabled={faq.editQuestion.isPending}
                    >
                      <Check size={16} aria-hidden />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Cancel editing question">
                    <ActionIcon
                      variant="light"
                      color="dune"
                      size="lg"
                      type="button"
                      aria-label="Cancel editing question"
                      onClick={() => editingSession.cancelQuestion()}
                    >
                      <X size={16} aria-hidden />
                    </ActionIcon>
                  </Tooltip>
                  {faq.editQuestion.isError && (
                    <span className={styles.error}>{faq.editQuestion.error?.message}</span>
                  )}
                </Group>
              </Stack>
            ) : (
              <>
                <div className={styles.questionHeader}>
                  {item.author && (
                    <ProfileLink
                      slug={item.author.slug}
                      username={item.author.username}
                      avatar_url={item.author.avatarUrl}
                      className={styles.questionAskerLink}
                    />
                  )}
                  <div>
                    <h2 className={styles.questionTitle}>{item.text}</h2>
                  </div>
                </div>
                {item.capabilities.editQuestion && (
                  <Group gap="xs" wrap="nowrap">
                    <Tooltip label="Edit question">
                      <ActionIcon
                        variant="filled"
                        color="confirm"
                        size="lg"
                        type="button"
                        aria-label="Edit question"
                        onClick={startEditQuestion}
                      >
                        <Pencil size={16} aria-hidden />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Delete question">
                      <ActionIcon
                        variant="light"
                        color="red"
                        size="lg"
                        type="button"
                        aria-label="Delete question"
                        onClick={handleDeleteQuestion}
                        disabled={faq.deleteQuestion.isPending}
                      >
                        <Trash2 size={16} aria-hidden />
                      </ActionIcon>
                    </Tooltip>
                    {faq.deleteQuestion.isError && (
                      <span className={styles.error}>{faq.deleteQuestion.error?.message}</span>
                    )}
                  </Group>
                )}
              </>
            )}
          </Stack>

          {showAddAnswerForm && (
            <Stack
              component="form"
              gap="sm"
              onSubmit={(e) => {
                e.preventDefault();
                const formEl = e.target as HTMLFormElement;
                const answer = (
                  formEl.elements.namedItem('answer') as HTMLTextAreaElement
                ).value.trim();
                if (!answer) {
                  return;
                }
                void faq.createAnswer
                  .run({ answer })
                  .then(() => formEl.reset())
                  .catch(() => undefined);
              }}
            >
              <Textarea
                description="Add your answer (1 per person-you can edit it later)"
                error={faq.createAnswer.isError ? faq.createAnswer.error?.message : undefined}
                name="answer"
                rows={3}
                required
                minLength={1}
                placeholder="Your answer..."
              />
              <Group gap="xs" wrap="nowrap">
                <Tooltip label="Add answer">
                  <ActionIcon
                    variant="filled"
                    color="confirm"
                    size="lg"
                    type="submit"
                    aria-label="Add answer"
                    disabled={faq.createAnswer.isPending}
                  >
                    <MessageSquarePlus size={16} aria-hidden />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Stack>
          )}

          {hasUserAnswered && !showAddAnswerForm && (
            <p className={styles.hintBlock}>
              You&apos;ve answered. You can edit your answer below.
            </p>
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
                        <Textarea
                          label="Edit your answer"
                          value={editing.answerValue}
                          onChange={(e) => editingSession.setAnswerValue(e.target.value)}
                          rows={3}
                        />
                        <Group gap="xs" wrap="nowrap">
                          <Tooltip label="Save answer">
                            <ActionIcon
                              variant="filled"
                              color="confirm"
                              size="lg"
                              type="button"
                              aria-label="Save answer"
                              onClick={() => saveAnswer(a.id)}
                              disabled={faq.editAnswer.isPending}
                            >
                              <Check size={16} aria-hidden />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Cancel editing answer">
                            <ActionIcon
                              variant="light"
                              color="dune"
                              size="lg"
                              type="button"
                              aria-label="Cancel editing answer"
                              onClick={() => editingSession.cancelAnswer()}
                            >
                              <X size={16} aria-hidden />
                            </ActionIcon>
                          </Tooltip>
                          {faq.editAnswer.isError && (
                            <span className={styles.error}>{faq.editAnswer.error?.message}</span>
                          )}
                        </Group>
                      </Stack>
                    ) : (
                      <Stack gap="xs">
                        {(isAccepted || isUserAnswer || a.author) && (
                          <div className={styles.answerMetaRow}>
                            {isAccepted && <span>Accepted answer</span>}
                            {isUserAnswer && <span>Your answer-you can edit or delete it</span>}
                            {a.author && (
                              <ProfileLink
                                slug={a.author.slug}
                                username={a.author.username}
                                avatar_url={a.author.avatarUrl}
                              />
                            )}
                          </div>
                        )}
                        <div className={styles.answerContent}>{a.text}</div>
                        <Group gap="xs" wrap="nowrap">
                          {a.capabilities.acceptAnswer && (
                            <Tooltip label="Mark as accepted answer">
                              <ActionIcon
                                variant="filled"
                                color="confirm"
                                size="lg"
                                type="button"
                                aria-label="Mark as accepted answer"
                                onClick={() =>
                                  void faq.setAcceptedAnswer
                                    .run({ answerId: a.id })
                                    .catch(() => undefined)
                                }
                                disabled={faq.setAcceptedAnswer.isPending}
                              >
                                <Check size={16} aria-hidden />
                              </ActionIcon>
                            </Tooltip>
                          )}
                          {a.capabilities.unacceptAnswer && (
                            <Tooltip label="Unmark accepted answer">
                              <ActionIcon
                                variant="light"
                                color="dune"
                                size="lg"
                                type="button"
                                aria-label="Unmark accepted answer"
                                onClick={() =>
                                  void faq.setAcceptedAnswer
                                    .run({ answerId: null })
                                    .catch(() => undefined)
                                }
                                disabled={faq.setAcceptedAnswer.isPending}
                              >
                                <X size={16} aria-hidden />
                              </ActionIcon>
                            </Tooltip>
                          )}
                          {a.capabilities.editAnswer && (
                            <Tooltip label="Edit your answer">
                              <ActionIcon
                                variant="filled"
                                color="confirm"
                                size="lg"
                                type="button"
                                aria-label="Edit your answer"
                                onClick={() => startEditAnswer(a)}
                              >
                                <Pencil size={16} aria-hidden />
                              </ActionIcon>
                            </Tooltip>
                          )}
                          {a.capabilities.deleteAnswer && (
                            <Tooltip label="Delete answer">
                              <ActionIcon
                                variant="light"
                                color="red"
                                size="lg"
                                type="button"
                                aria-label="Delete answer"
                                onClick={() => handleDeleteAnswer(a.id)}
                                disabled={faq.deleteAnswer.isPending}
                              >
                                <Trash2 size={16} aria-hidden />
                              </ActionIcon>
                            </Tooltip>
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
    </PageLayout>
  );
}
