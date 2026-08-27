import { Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';

import { loadRulesetsAll, useRulesetsAll } from '@db/rulesets';

import styles from './RulesetsIndex.module.css';

export const Route = createFileRoute('/_app/rulesets/')({
  loader: async () => ({ rulesets: await loadRulesetsAll() }),
  component: RulesetsPage,
});

function RulesetsPage() {
  const loaderData = Route.useLoaderData();
  const rulesets = useRulesetsAll({ initialData: loaderData.rulesets });

  return (
    <PageLayout>
      <PageLayout.Header>
        <div>
          <h1>Rulesets</h1>
          <p>
            <Link to="/rulesets/create" activeProps={{ style: { fontWeight: 'bold' } }}>
              Create a new ruleset
            </Link>
          </p>
        </div>
      </PageLayout.Header>
      <PageLayout.Content>
        {rulesets.data && rulesets.data.length > 0 ? (
          <div className={styles.grid}>
            {rulesets.data.map((r) => (
              <Surface
                key={r.id}
                interactive
                padding="sm"
                className={styles.card}
                renderRoot={({ className, children }) => (
                  <Link to="/rulesets/$rulesetSlug" params={{ rulesetSlug: r.slug }} className={className}>
                    {children}
                  </Link>
                )}
              >
                <div className={styles.cover}>
                  {r.coverThumbUrl ? (
                    <img src={r.coverThumbUrl} alt="" className={styles.coverImage} />
                  ) : (
                    <span className={styles.coverPlaceholder}>No cover</span>
                  )}
                </div>
                <span className={styles.name}>{r.name}</span>
              </Surface>
            ))}
          </div>
        ) : (
          <Text size="sm" c="dimmed">
            No rulesets yet.
          </Text>
        )}
      </PageLayout.Content>
    </PageLayout>
  );
}
