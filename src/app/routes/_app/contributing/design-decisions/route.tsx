import { Anchor, Code, SimpleGrid, Stack, Text } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Code2, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

import { publicPageHead } from '@app/routes/publicPage';
import { ContributingGuide } from '@app/widgets/contributing-guide/ContributingGuide';

import { DECISION_GROUPS, DESIGN_DECISIONS } from './decisions';
import type { DecisionGuard, DesignDecision } from './decisions';
import styles from './route.module.css';

export const Route = createFileRoute('/_app/contributing/design-decisions')({
  ssr: true,
  head: () =>
    publicPageHead({
      name: 'Design decisions',
      pathname: '/contributing/design-decisions',
      description: 'The rules Dune Zone is built by, and why each one makes the product and the code better.',
      social: { kind: 'Dune Zone', shape: 'portrait' },
    }),
  component: DesignDecisionsPage,
});

const REPOSITORY_FILES = 'https://github.com/ndelangen/dunezone/blob/main';

const GUARD_LABELS: Record<DecisionGuard, string> = {
  lint: 'Lint rule',
  check: 'Check script',
  test: 'Test',
  warning: 'Warns in development',
  review: 'Held in review',
};

function Benefit({ icon, label, children }: Readonly<{ icon: ReactNode; label: string; children: string }>) {
  return (
    <Stack gap={2}>
      <Text size="sm" fw={700} className={styles.benefitLabel}>
        {icon}
        {label}
      </Text>
      <Text size="sm">{children}</Text>
    </Stack>
  );
}

function DecisionSection({ decision }: Readonly<{ decision: DesignDecision }>) {
  return (
    <Section
      id={decision.id}
      className={styles.decision}
      title={decision.title}
      action={
        <StatusBadge tone={decision.guard === 'review' ? 'neutral' : 'positive'}>
          {GUARD_LABELS[decision.guard]}
        </StatusBadge>
      }
    >
      <Stack gap="sm">
        <Text>{decision.rule}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Benefit icon={<Sparkles size={14} aria-hidden />} label="Better product">
            {decision.product}
          </Benefit>
          <Benefit icon={<Code2 size={14} aria-hidden />} label="Better code">
            {decision.code}
          </Benefit>
        </SimpleGrid>
        <Text size="sm" c="dimmed">
          {decision.guardName ? (
            <>
              Held by <Code>{decision.guardName}</Code>.{' '}
            </>
          ) : null}
          <Anchor href={`${REPOSITORY_FILES}/${decision.source}`} size="sm">
            Read the full decision
          </Anchor>
        </Text>
      </Stack>
    </Section>
  );
}

function DesignDecisionsPage() {
  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack gap="sm" maw="48rem">
          <PageTitle eyebrow="Contributing" title="Design decisions" />
          <Text size="lg">
            The rules we build by. Each one fixed a real problem, and each one makes the product better for players and
            the code easier to change. Where a machine can check a rule, it does.
          </Text>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <ContributingGuide
          current="decisions"
          sections={DECISION_GROUPS.map((group) => ({ id: `group-${group.id}`, label: group.label }))}
        >
          <Stack gap="xl">
            {DECISION_GROUPS.map((group) => (
              <Section
                key={group.id}
                id={`group-${group.id}`}
                className={styles.decision}
                title={group.label}
                description={group.summary}
              >
                <Surface padding="lg">
                  <Stack gap="xl">
                    {DESIGN_DECISIONS.filter((decision) => decision.group === group.id).map((decision) => (
                      <DecisionSection key={decision.id} decision={decision} />
                    ))}
                  </Stack>
                </Surface>
              </Section>
            ))}
          </Stack>
        </ContributingGuide>
      </PageLayout.Content>
    </PageLayout>
  );
}
