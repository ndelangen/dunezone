import { Button, Group, Stack, TextInput, Textarea } from '@mantine/core';
import type { FaqTag } from '@shared/faq/tags';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { FaqTagFieldset } from '@ui/control/FaqTagFieldset';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';

import { useAskFaqQuestion } from '@db/faq';
import { useCurrentProfile } from '@db/profiles';
import { loadRulesetBySlug, useRulesetBySlug } from '@db/rulesets';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import styles from './create.module.css';

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/faq/create')({
  loader: async ({ params }) => ({ ruleset: await loadRulesetBySlug(params.rulesetSlug) }),
  component: FaqCreatePage,
});

function FaqCreatePage() {
  const { rulesetSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate();
  const ruleset = useRulesetBySlug(rulesetSlug, { initialData: loaderData.ruleset });
  const profile = useCurrentProfile();
  const askQuestion = useAskFaqQuestion();
  const rulesetRow = ruleset.data?.ruleset;

  const header = (
    <div>
      <h1>Ask a question</h1>
      <p>
        {rulesetRow ? `For ${rulesetRow.name} · ` : null}
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
              const question = (formEl.elements.namedItem('question') as HTMLInputElement).value.trim();
              const answer = (formEl.elements.namedItem('answer') as HTMLTextAreaElement).value.trim();
              const selectedTags = Array.from(
                formEl.querySelectorAll<HTMLInputElement>('input[name="tags"]:checked')
              ).map((input) => input.value as FaqTag);
              if (!question) {
                return;
              }
              if (selectedTags.length === 0) {
                return;
              }
              void askQuestion
                .run({
                  rulesetId,
                  question,
                  initialAnswer: answer || undefined,
                  tags: selectedTags,
                })
                .then((locator) => {
                  formEl.reset();
                  navigate({
                    to: '/rulesets/$rulesetSlug/faq/$questionSlug',
                    params: locator,
                  });
                })
                .catch(() => undefined);
            }}
          >
            <TextInput
              label="Ask a question"
              type="text"
              name="question"
              required
              minLength={1}
              placeholder="Your question..."
            />
            <Textarea
              label="Your answer (optional-you can add or edit it later)"
              name="answer"
              rows={3}
              placeholder="Optional answer..."
            />
            <FaqTagFieldset />
            <Group gap="xs" wrap="nowrap">
              <Button variant="filled" color="confirm" type="submit" disabled={askQuestion.isPending}>
                {askQuestion.isPending ? 'Asking…' : 'Ask'}
              </Button>
              {askQuestion.isError && <span className={styles.error}>{askQuestion.error?.message}</span>}
            </Group>
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}
