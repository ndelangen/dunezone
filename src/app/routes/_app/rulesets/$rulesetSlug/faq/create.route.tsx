import { Group, Stack } from '@mantine/core';
import type { FaqTag } from '@shared/faq/tags';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ActionError } from '@ui/block/ActionError';
import { PageState } from '@ui/block/PageState';
import { PageTitle } from '@ui/block/PageTitle';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FaqTagFieldset } from '@ui/control/FaqTagFieldset';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Send } from 'lucide-react';
import { useReducer } from 'react';

import { useAskFaqQuestion } from '@db/faq';
import { useCurrentProfile } from '@db/profiles';
import { loadRulesetBySlug, useRulesetBySlug } from '@db/rulesets';
import { pageHead } from '@app/routes/pageTitle';
import { RouteLoadError } from '@app/routes/routeStates';
import { BackToolbar } from '@app/widgets/back-toolbar/BackToolbar';
import { LoginGate } from '@app/widgets/page-message/LoginGate';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { RoutePending } from '@app/widgets/page-message/RoutePending';

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/faq/create')({
  loader: async ({ params }) => ({ ruleset: await loadRulesetBySlug(params.rulesetSlug) }),
  errorComponent: FaqCreateError,
  head: () => pageHead('Ask a question'),
  component: FaqCreatePage,
});

/**
 * The frame for a load that failed, which on this route is most often a slug naming no ruleset: the loader awaits `loadRulesetBySlug` unguarded and the query throws rather than returning nothing.
 * Without this the reader met the router's default, which is styled only for the stale-client case and otherwise renders the error raw.
 *
 * The way back is the catalogue rather than the ruleset, which is where this route's sibling points.
 * The distinction is which thing is missing: on the question page the ruleset exists and only the question is absent, so "back to ruleset" leads somewhere;
 * here the ruleset is the thing that is not there, so the same link would offer the reader the page that just failed.
 */
function FaqCreateError({ error }: ErrorComponentProps) {
  return (
    <RouteLoadError
      title="Ask a question"
      back={<PageMessage.Back to="/rulesets">Back to rulesets</PageMessage.Back>}
      what="This ruleset could not be loaded"
      error={error}
    />
  );
}

function FaqCreatePage() {
  const { rulesetSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate();
  const ruleset = useRulesetBySlug(rulesetSlug, { initialData: loaderData.ruleset });
  const profile = useCurrentProfile();
  const askQuestion = useAskFaqQuestion();
  /* One draft, one reducer (the state rule): the question and its optional first answer are one submission. */
  const [draft, dispatch] = useReducer(
    (
      state: { question: string; answer: string },
      event: { kind: 'patch'; update: Partial<typeof state> } | { kind: 'replace'; state: typeof state }
    ) => (event.kind === 'replace' ? event.state : { ...state, ...event.update }),
    { question: '', answer: '' }
  );
  const { question, answer } = draft;
  const rulesetRow = ruleset.data?.ruleset;

  /* The message frames (loading, missing ruleset) keep a boxed Back: they have no header band to carry the breadcrumb. */
  const backToRuleset = (
    <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug }}>
      Back to ruleset
    </PageMessage.Back>
  );

  if (!rulesetRow) {
    return (
      <RoutePending title="Ask a question" back={backToRuleset} loading="Loading ruleset">
        The ruleset this question belongs to is still loading.
      </RoutePending>
    );
  }

  /* The band is collapsed, as on the editors; the toolbar's back arrow is the way up, to the ruleset's FAQ, named after the ruleset. */
  const toolbar = (
    <BackToolbar
      label={`Back to ${rulesetRow.name} FAQ`}
      renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets/$rulesetSlug/faq" params={{ rulesetSlug }} />}
    />
  );
  const rulesetId = rulesetRow._id;

  if (!profile?.data?._id) {
    return (
      <PageMessage title="Ask a question" back={backToRuleset}>
        {profile.data === undefined ? (
          <PageState kind="pending" title="Loading your profile">
            Checking whether you are signed in.
          </PageState>
        ) : (
          <LoginGate action="ask a question" />
        )}
      </PageMessage>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header size="collapsed">
        <PageTitle title="Ask a question" />
      </PageLayout.Header>
      <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
      <PageLayout.Content>
        <Surface padding="lg">
          <Stack
            component="form"
            gap="sm"
            onSubmit={(e) => {
              e.preventDefault();
              const formEl = e.target as HTMLFormElement;
              const selectedTags = Array.from(
                formEl.querySelectorAll<HTMLInputElement>('input[name="tags"]:checked')
              ).map((input) => input.value as FaqTag);
              if (!question.trim()) {
                return;
              }
              if (selectedTags.length === 0) {
                return;
              }
              void askQuestion
                .run({
                  rulesetId,
                  question,
                  initialAnswer: answer.trim() ? answer : undefined,
                  tags: selectedTags,
                })
                .then((locator) => {
                  formEl.reset();
                  dispatch({ kind: 'replace', state: { question: '', answer: '' } });
                  void navigate({
                    to: '/rulesets/$rulesetSlug/faq/$questionSlug',
                    params: locator,
                  });
                })
                .catch(() => undefined);
            }}
          >
            <ControlBlock
              title="Ask a question"
              input={(fieldProps) => (
                <FormattedTextInput
                  {...fieldProps}
                  name="question"
                  profile="marks-only"
                  required
                  minLength={1}
                  placeholder="Your question..."
                  value={question}
                  onChange={(next) => dispatch({ kind: 'patch', update: { question: next } })}
                />
              )}
            />
            <ControlBlock
              title="Your answer (optional-you can add or edit it later)"
              input={(fieldProps) => (
                <FormattedTextInput
                  {...fieldProps}
                  name="answer"
                  rows={3}
                  placeholder="Optional answer..."
                  value={answer}
                  onChange={(next) => dispatch({ kind: 'patch', update: { answer: next } })}
                />
              )}
            />
            <FaqTagFieldset />
            <ActionError subject="Question" verb="ask" error={askQuestion.error} />
            <Group gap="xs" wrap="nowrap">
              <LabeledAction
                type="submit"
                intent="positive"
                emphasis="strong"
                icon={<Send size={16} />}
                busy={askQuestion.isPending}
              >
                Ask
              </LabeledAction>
            </Group>
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}
