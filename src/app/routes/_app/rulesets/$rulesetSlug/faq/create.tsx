import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';

import { useCreateFaqItem } from '@db/faq';
import { useCurrentProfile } from '@db/profiles';
import { loadRulesetBySlug, useRulesetBySlug } from '@db/rulesets';
import { FormField } from '@app/components/form/FormField';
import { MultilineTextField } from '@app/components/form/MultilineTextField';
import { TextField } from '@app/components/form/TextField';
import { ButtonGroup, Stack } from '@app/components/generic/layout';
import { Card } from '@app/components/generic/surfaces/Card';
import { UIButton } from '@app/components/generic/ui/UIButton';
import { PageLayout } from '@app/components/shell';
import type { FaqTag } from '@app/faq/tags';
import { FAQ_TAG_LABELS, FAQ_TAG_VALUES } from '@app/faq/tags';

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
  const createFaqItem = useCreateFaqItem();
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
    return <PageLayout header={header}>Loading ruleset…</PageLayout>;
  }
  const rulesetId = rulesetRow._id;

  if (!profile?.data?._id) {
    return (
      <PageLayout header={header}>
        <Card>
          <p>
            <Link to="/auth/login">Log in</Link> to ask a question.
          </p>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout header={header}>
      <Card>
        <Stack
          as="form"
          gap={3}
          onSubmit={(e) => {
            e.preventDefault();
            const formEl = e.target as HTMLFormElement;
            const question = (
              formEl.elements.namedItem('question') as HTMLInputElement
            ).value.trim();
            const answer = (
              formEl.elements.namedItem('answer') as HTMLTextAreaElement
            ).value.trim();
            const selectedTags = Array.from(
              formEl.querySelectorAll<HTMLInputElement>('input[name="tags"]:checked')
            ).map((input) => input.value as FaqTag);
            if (!question) return;
            if (selectedTags.length === 0) return;
            createFaqItem.mutate(
              { rulesetId, question, answer: answer || undefined, tags: selectedTags },
              {
                onSuccess: (entry) => {
                  formEl.reset();
                  navigate({
                    to: '/rulesets/$rulesetSlug/faq/$questionSlug',
                    params: {
                      rulesetSlug,
                      questionSlug: entry.slug,
                    },
                  });
                },
              }
            );
          }}
        >
          <FormField label="Ask a question">
            <TextField
              type="text"
              name="question"
              required
              minLength={1}
              placeholder="Your question..."
            />
          </FormField>
          <FormField label="Your answer (optional-you can add or edit it later)">
            <MultilineTextField name="answer" rows={3} placeholder="Optional answer..." />
          </FormField>
          <FormField label="Tags">
            <Stack as="fieldset" gap={2} className={styles.tagFieldset}>
              <legend className={styles.visuallyHidden}>FAQ tags</legend>
              {FAQ_TAG_VALUES.map((tag) => (
                <label key={tag} className={styles.tagOption}>
                  <input type="checkbox" name="tags" value={tag} defaultChecked={tag === 'other'} />
                  <span>{FAQ_TAG_LABELS[tag]}</span>
                </label>
              ))}
            </Stack>
          </FormField>
          <ButtonGroup>
            <UIButton type="submit" iconOnly={false} disabled={createFaqItem.isPending}>
              {createFaqItem.isPending ? 'Asking…' : 'Ask'}
            </UIButton>
            {createFaqItem.isError && (
              <span className={styles.error}>{createFaqItem.error?.message}</span>
            )}
          </ButtonGroup>
        </Stack>
      </Card>
    </PageLayout>
  );
}
