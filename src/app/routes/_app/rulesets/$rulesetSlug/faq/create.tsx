import { Button, Group, Input, Stack, TextInput, Textarea } from '@mantine/core';
import type { FaqTag } from '@shared/faq/tags';
import { FAQ_TAG_VALUES } from '@shared/faq/tags';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FAQ_TAG_LABELS } from '@ui/content/faqTagLabels';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';

import { useAskFaqQuestion } from '@db/faq';
import { useCurrentProfile } from '@db/profiles';
import { loadRulesetBySlug, useRulesetBySlug } from '@db/rulesets';

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

  if (!rulesetRow) {
    return (
      <PageLayout>
        <PageLayout.Header>{header}</PageLayout.Header>
        <PageLayout.Content>Loading ruleset…</PageLayout.Content>
      </PageLayout>
    );
  }
  const rulesetId = rulesetRow._id;

  if (!profile?.data?._id) {
    return (
      <PageLayout>
        <PageLayout.Header>{header}</PageLayout.Header>
        <PageLayout.Content>
          <Surface padding="lg">
            <p>
              <Link to="/auth/login">Log in</Link> to ask a question.
            </p>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
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
            <Input.Wrapper label="Tags">
              <Stack component="fieldset" gap="xs" className={styles.tagFieldset}>
                <legend className={styles.visuallyHidden}>FAQ tags</legend>
                {FAQ_TAG_VALUES.map((tag) => (
                  <label key={tag} className={styles.tagOption}>
                    <input type="checkbox" name="tags" value={tag} defaultChecked={tag === 'other'} />
                    <span>{FAQ_TAG_LABELS[tag]}</span>
                  </label>
                ))}
              </Stack>
            </Input.Wrapper>
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
