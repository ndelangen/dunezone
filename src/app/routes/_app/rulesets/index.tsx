import { Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { OpenableTile } from '@ui/block/OpenableTile';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { TileGrid } from '@ui/list/TileGrid';

import { loadRulesetsAll, useRulesetsAll } from '@db/rulesets';

import styles from './index.module.css';

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
          <PageTitle title="Rulesets" />
          <p>
            <Link to="/rulesets/create" activeProps={{ style: { fontWeight: 'bold' } }}>
              Create a new ruleset
            </Link>
          </p>
        </div>
      </PageLayout.Header>
      <PageLayout.Content>
        {rulesets.data && rulesets.data.length > 0 ? (
          <TileGrid>
            {rulesets.data.map((r) => (
              <OpenableTile
                key={r.id}
                caption={r.name}
                renderRoot={(rootProps) => (
                  <Link {...rootProps} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: r.slug }} />
                )}
              >
                <div className={styles.cover}>
                  {r.coverThumbUrl ? (
                    <img src={r.coverThumbUrl} alt="" className={styles.coverImage} />
                  ) : (
                    <span className={styles.coverPlaceholder}>No cover</span>
                  )}
                </div>
              </OpenableTile>
            ))}
          </TileGrid>
        ) : (
          <Text size="sm" c="dimmed">
            No rulesets yet.
          </Text>
        )}
      </PageLayout.Content>
    </PageLayout>
  );
}
