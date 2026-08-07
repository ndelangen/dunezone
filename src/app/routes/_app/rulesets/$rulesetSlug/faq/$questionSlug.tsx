import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Check, MessageSquarePlus, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { loadFaqQuestionPage, useFaqQuestionPage } from '@db/faq';
import { Answer } from '@app/components/faq/Answer';
import { FormField } from '@app/components/form/FormField';
import { FormTooltip } from '@app/components/form/FormTooltip';
import { MultilineTextField } from '@app/components/form/MultilineTextField';
import { ButtonGroup, Stack } from '@app/components/generic/layout';
import { Card } from '@app/components/generic/surfaces/Card';
import { UIButton } from '@app/components/generic/ui/UIButton';
import { ProfileLink } from '@app/components/profile/ProfileLink';
import { PageLayout } from '@app/components/shell';
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
        <Card>
          <h2>Question not found</h2>
          <p>This FAQ question does not exist in this ruleset.</p>
        </Card>
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
      <Card>
        <Stack gap={4}>
          <Stack gap={3}>
            {editing.editingQuestion ? (
              <Stack gap={3}>
                <FormField label="Edit question">
                  <MultilineTextField
                    value={editing.questionValue}
                    onChange={(e) => editingSession.setQuestionValue(e.target.value)}
                    rows={2}
                  />
                </FormField>
                <FormField label="Tags">
                  <Stack as="fieldset" gap={2} className={styles.tagFieldset}>
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
                </FormField>
                <ButtonGroup>
                  <FormTooltip content="Save question">
                    <UIButton
                      type="button"
                      iconOnly
                      aria-label="Save question"
                      onClick={() => saveQuestion()}
                      disabled={faq.editQuestion.isPending}
                    >
                      <Check size={16} aria-hidden />
                    </UIButton>
                  </FormTooltip>
                  <FormTooltip content="Cancel editing question">
                    <UIButton
                      variant="secondary"
                      type="button"
                      iconOnly
                      aria-label="Cancel editing question"
                      onClick={() => editingSession.cancelQuestion()}
                    >
                      <X size={16} aria-hidden />
                    </UIButton>
                  </FormTooltip>
                  {faq.editQuestion.isError && (
                    <span className={styles.error}>{faq.editQuestion.error?.message}</span>
                  )}
                </ButtonGroup>
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
                  <ButtonGroup>
                    <FormTooltip content="Edit question">
                      <UIButton
                        type="button"
                        iconOnly
                        aria-label="Edit question"
                        onClick={startEditQuestion}
                      >
                        <Pencil size={16} aria-hidden />
                      </UIButton>
                    </FormTooltip>
                    <FormTooltip content="Delete question">
                      <UIButton
                        variant="critical"
                        type="button"
                        iconOnly
                        aria-label="Delete question"
                        onClick={handleDeleteQuestion}
                        disabled={faq.deleteQuestion.isPending}
                      >
                        <Trash2 size={16} aria-hidden />
                      </UIButton>
                    </FormTooltip>
                    {faq.deleteQuestion.isError && (
                      <span className={styles.error}>{faq.deleteQuestion.error?.message}</span>
                    )}
                  </ButtonGroup>
                )}
              </>
            )}
          </Stack>

          {showAddAnswerForm && (
            <Stack
              as="form"
              gap={3}
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
              <FormField
                hint="Add your answer (1 per person-you can edit it later)"
                error={faq.createAnswer.isError ? faq.createAnswer.error?.message : undefined}
              >
                <MultilineTextField
                  name="answer"
                  rows={3}
                  required
                  minLength={1}
                  placeholder="Your answer..."
                />
              </FormField>
              <ButtonGroup>
                <FormTooltip content="Add answer">
                  <UIButton
                    type="submit"
                    iconOnly
                    aria-label="Add answer"
                    disabled={faq.createAnswer.isPending}
                  >
                    <MessageSquarePlus size={16} aria-hidden />
                  </UIButton>
                </FormTooltip>
              </ButtonGroup>
            </Stack>
          )}

          {hasUserAnswered && !showAddAnswerForm && (
            <p className={styles.hintBlock}>
              You&apos;ve answered. You can edit your answer below.
            </p>
          )}

          {answers.length > 0 ? (
            <Answer.List className={styles.answerList}>
              {answers.map((a) => {
                const isEditing = editing.editingAnswerId === a.id;
                const isUserAnswer = a.capabilities.editAnswer;
                const isAccepted = a.accepted;
                return (
                  <Answer.Item
                    key={a.id}
                    id={`faq-answer-${a.id}`}
                    className={styles.answerItem}
                    isAccepted={isAccepted}
                  >
                    {isEditing ? (
                      <Stack gap={3}>
                        <FormField label="Edit your answer">
                          <MultilineTextField
                            value={editing.answerValue}
                            onChange={(e) => editingSession.setAnswerValue(e.target.value)}
                            rows={3}
                          />
                        </FormField>
                        <ButtonGroup>
                          <FormTooltip content="Save answer">
                            <UIButton
                              type="button"
                              iconOnly
                              aria-label="Save answer"
                              onClick={() => saveAnswer(a.id)}
                              disabled={faq.editAnswer.isPending}
                            >
                              <Check size={16} aria-hidden />
                            </UIButton>
                          </FormTooltip>
                          <FormTooltip content="Cancel editing answer">
                            <UIButton
                              variant="secondary"
                              type="button"
                              iconOnly
                              aria-label="Cancel editing answer"
                              onClick={() => editingSession.cancelAnswer()}
                            >
                              <X size={16} aria-hidden />
                            </UIButton>
                          </FormTooltip>
                          {faq.editAnswer.isError && (
                            <span className={styles.error}>{faq.editAnswer.error?.message}</span>
                          )}
                        </ButtonGroup>
                      </Stack>
                    ) : (
                      <Stack gap={2}>
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
                        <ButtonGroup>
                          {a.capabilities.acceptAnswer && (
                            <FormTooltip content="Mark as accepted answer">
                              <UIButton
                                type="button"
                                iconOnly
                                aria-label="Mark as accepted answer"
                                onClick={() =>
                                  void faq.setAcceptedAnswer
                                    .run({ answerId: a.id })
                                    .catch(() => undefined)
                                }
                                disabled={faq.setAcceptedAnswer.isPending}
                              >
                                <Check size={16} aria-hidden />
                              </UIButton>
                            </FormTooltip>
                          )}
                          {a.capabilities.unacceptAnswer && (
                            <FormTooltip content="Unmark accepted answer">
                              <UIButton
                                type="button"
                                variant="secondary"
                                iconOnly
                                aria-label="Unmark accepted answer"
                                onClick={() =>
                                  void faq.setAcceptedAnswer
                                    .run({ answerId: null })
                                    .catch(() => undefined)
                                }
                                disabled={faq.setAcceptedAnswer.isPending}
                              >
                                <X size={16} aria-hidden />
                              </UIButton>
                            </FormTooltip>
                          )}
                          {a.capabilities.editAnswer && (
                            <FormTooltip content="Edit your answer">
                              <UIButton
                                type="button"
                                iconOnly
                                aria-label="Edit your answer"
                                onClick={() => startEditAnswer(a)}
                              >
                                <Pencil size={16} aria-hidden />
                              </UIButton>
                            </FormTooltip>
                          )}
                          {a.capabilities.deleteAnswer && (
                            <FormTooltip content="Delete answer">
                              <UIButton
                                variant="critical"
                                type="button"
                                iconOnly
                                aria-label="Delete answer"
                                onClick={() => handleDeleteAnswer(a.id)}
                                disabled={faq.deleteAnswer.isPending}
                              >
                                <Trash2 size={16} aria-hidden />
                              </UIButton>
                            </FormTooltip>
                          )}
                        </ButtonGroup>
                      </Stack>
                    )}
                  </Answer.Item>
                );
              })}
            </Answer.List>
          ) : (
            <p>No answers yet.</p>
          )}
        </Stack>
      </Card>
    </PageLayout>
  );
}
