import { Button, Group, Stack } from '@mantine/core';
import type { FaqTag } from '@shared/faq/tags';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { PageTitle } from '@ui/block/PageTitle';
import { RulesetLink } from '@ui/content/RulesetLink';
import { FaqTagFieldset } from '@ui/control/FaqTagFieldset';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { useState } from 'react';

import { useAskFaqQuestion } from '@db/faq';
import { useCurrentProfile } from '@db/profiles';
import { loadRulesetBySlug, useRulesetBySlug } from '@db/rulesets';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/faq/create')({
  loader: async ({ params }) => ({ ruleset: await loadRulesetBySlug(params.rulesetSlug) }),
  errorComponent: FaqCreateError,
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
    <PageMessage title="Ask a question" back={<PageMessage.Back to="/rulesets">Back to rulesets</PageMessage.Back>}>
      <LoadError title="This ruleset could not be loaded" stale={isStaleClientData(error)}>
        {error.message}
      </LoadError>
    </PageMessage>
  );
}

function FaqCreatePage() {
  const { rulesetSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate();
  const ruleset = useRulesetBySlug(rulesetSlug, { initialData: loaderData.ruleset });
  const profile = useCurrentProfile();
  const askQuestion = useAskFaqQuestion();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const rulesetRow = ruleset.data?.ruleset;

  const header = (
    <div>
      <PageTitle title="Ask a question" />
      <p>
        {rulesetRow ? (
          <>
            For <RulesetLink slug={rulesetSlug} name={rulesetRow.name} /> ·{' '}
          </>
        ) : null}
        <Link to="/rulesets/$rulesetSlug" params={{ rulesetSlug }}>
          Back to ruleset
        </Link>
        {' · '}
        <Link to="/rulesets">Back to rulesets</Link>
      </p>
    </div>
  );

  /* Only this page's message frames move to `PageMessage`. The loaded page keeps its hand-rolled
     `h1` header, which is a separate item of the same wave (#701 item 5, the FAQ pages' raw
     elements), so for now the two states spell the same words two ways. */
  const backToRuleset = (
    <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug }}>
      Back to ruleset
    </PageMessage.Back>
  );

  if (!rulesetRow) {
    return (
      <PageMessage title="Ask a question" back={backToRuleset}>
        <LoadPending title="Loading ruleset">The ruleset this question belongs to is still loading.</LoadPending>
      </PageMessage>
    );
  }
  const rulesetId = rulesetRow._id;

  if (!profile?.data?._id) {
    return (
      <PageMessage title="Ask a question" back={backToRuleset}>
        <LoginGate action="ask a question" />
      </PageMessage>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header>{header}</PageLayout.Header>
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
                  setQuestion('');
                  setAnswer('');
                  navigate({
                    to: '/rulesets/$rulesetSlug/faq/$questionSlug',
                    params: locator,
                  });
                })
                .catch(() => undefined);
            }}
          >
            <FormattedTextInput
              label="Ask a question"
              name="question"
              profile="marks-only"
              required
              minLength={1}
              placeholder="Your question..."
              value={question}
              onChange={setQuestion}
            />
            <FormattedTextInput
              label="Your answer (optional-you can add or edit it later)"
              name="answer"
              rows={3}
              placeholder="Optional answer..."
              value={answer}
              onChange={setAnswer}
            />
            <FaqTagFieldset />
            {askQuestion.error ? (
              <FormError title="Question could not be asked">{askQuestion.error.message}</FormError>
            ) : null}
            <Group gap="xs" wrap="nowrap">
              <Button variant="filled" color="confirm" type="submit" disabled={askQuestion.isPending}>
                {askQuestion.isPending ? 'Asking…' : 'Ask'}
              </Button>
            </Group>
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}
