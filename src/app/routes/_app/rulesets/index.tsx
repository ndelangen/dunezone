import { Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Surface } from '@ui/surface';

import { loadRulesetsAll, useRulesetsAll } from '@db/rulesets';
import { PageLayout } from '@app/components/layout/PageLayout';

import styles from './RulesetsIndex.module.css';

export const Route = createFileRoute('/_app/rulesets/')({
  loader: async () => ({ rulesets: await loadRulesetsAll() }),
  component: RulesetsPage,
});

function RulesetsPage() {
  const loaderData = Route.useLoaderData();
  const rulesets = useRulesetsAll({ initialData: loaderData.rulesets });

  return (
    <PageLayout
      header={
        <div>
          <h1>Rulesets</h1>
          <p>
            <Link to="/rulesets/create" activeProps={{ style: { fontWeight: 'bold' } }}>
              Create a new ruleset
            </Link>
          </p>
        </div>
      }
    >
      {rulesets.data && rulesets.data.length > 0 ? (
        <div className={styles.grid}>
          {rulesets.data.map((r) => (
            <Surface
              key={r.id}
              interactive
              padding="sm"
              className={styles.card}
              renderRoot={({ className, children }) => (
                <Link
                  to="/rulesets/$rulesetSlug"
                  params={{ rulesetSlug: r.slug }}
                  className={className}
                >
                  {children}
                </Link>
              )}
            >
              <div className={styles.cover}>
                {r.image_cover ? (
                  <img src={r.image_cover} alt="" className={styles.coverImage} />
                ) : null}
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
    </PageLayout>
  );
}
