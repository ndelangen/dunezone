import {
  ActionIcon,
  Alert,
  Button,
  Drawer,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { CallToAction } from '@ui/control/CallToAction';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowDownAZ, Filter, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { loadFactionCataloguePage, useFactionCataloguePage } from '@db/factions';
import type { FactionCataloguePageData, FactionRulesetSummary } from '@db/factions';
import { formatFactionCatalogueDate } from '@app/components/factions/factionCatalogueDate';
import { FactionCatalogueSpotlight } from '@app/components/factions/FactionCatalogueSpotlight';
import { FactionList } from '@app/components/factions/FactionList';
import { PageLayout } from '@app/components/shell';
import { parseFactionCatalogueSearch, useFactionCatalogueSession } from '@app/factions/catalogue';
import type { FactionCatalogueSearch } from '@app/factions/catalogue';

import styles from './FactionCatalogue.module.css';

export const Route = createFileRoute('/_app/factions/')({
  codeSplitGroupings: [['component', 'pendingComponent', 'errorComponent']],
  validateSearch: parseFactionCatalogueSearch,
  loader: loadFactionCataloguePage,
  pendingComponent: FactionCataloguePending,
  errorComponent: FactionCatalogueError,
  component: FactionsPage,
});

function FactionsPage() {
  const loaderData = Route.useLoaderData();
  const catalogue = useFactionCataloguePage({ initialData: loaderData });
  const data = catalogue.data;
  const session = useFactionCatalogueSession(data);

  if (!data) {
    return <FactionCataloguePending />;
  }
  const hasFactions = data.factions.length > 0;

  return (
    <PageLayout
      header={<CatalogueHeader spotlights={hasFactions ? data.spotlights : undefined} />}
      toolbar={
        hasFactions ? (
          <CatalogueToolbar
            draftQuery={session.query.value}
            onDraftQueryChange={session.query.change}
            onCommitQuery={session.query.commit}
            search={session.search}
            rulesets={data.rulesets}
            visibleCount={session.visibleFactions.length}
            totalCount={data.factions.length}
            onSearchChange={session.changeSearch}
          />
        ) : undefined
      }
    >
      {hasFactions ? (
        session.visibleFactions.length > 0 ? (
          <FactionList
            factions={session.visibleFactions}
            selectedRulesetSlug={session.search.ruleset}
          />
        ) : (
          <FilteredEmptyState onReset={session.reset} />
        )
      ) : (
        <Surface padding="xl">
          <Title order={2}>There are no factions</Title>
          <Text c="dimmed" mt="xs">
            Create the first faction to begin the collection.
          </Text>
        </Surface>
      )}
    </PageLayout>
  );
}

function FactionCataloguePending() {
  return (
    <PageLayout header={<CatalogueHeader />}>
      <Surface padding="xl">
        <Stack align="center" gap="sm">
          <Loader size="sm" />
          <Title order={2}>Loading factions</Title>
          <Text c="dimmed">The faction catalogue is still loading.</Text>
        </Stack>
      </Surface>
    </PageLayout>
  );
}

function FactionCatalogueError({ error }: ErrorComponentProps) {
  return (
    <PageLayout header={<CatalogueHeader />}>
      <Alert color="red" title="Faction catalogue could not be loaded" role="alert">
        <Text size="sm">{error.message || 'An unexpected error occurred.'}</Text>
      </Alert>
    </PageLayout>
  );
}

function CatalogueHeader({ spotlights }: { spotlights?: FactionCataloguePageData['spotlights'] }) {
  const hasSpotlight = Boolean(spotlights?.newArrival || spotlights?.freshlyUpdated);

  return (
    <Stack className={styles.catalogueHeader} gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Stack gap={4} align="flex-start" miw={0}>
          <Eyebrow tone="accent">Explore the collection</Eyebrow>
          <Title order={1}>Faction catalogue</Title>
          <Text size="sm" c="dimmed">
            Browse the living collection of community factions.
          </Text>
        </Stack>
        <CallToAction
          attention
          renderRoot={(rootProps) => <Link {...rootProps} to="/factions/create" />}
        >
          Create your own faction
        </CallToAction>
      </Group>

      {hasSpotlight ? (
        <div className={styles.spotlightRail}>
          {spotlights?.newArrival ? (
            <FactionCatalogueSpotlight
              faction={spotlights.newArrival}
              label="New arrival"
              meta={`Created ${formatFactionCatalogueDate(spotlights.newArrival.created_at)}`}
            />
          ) : null}
          {spotlights?.freshlyUpdated ? (
            <FactionCatalogueSpotlight
              faction={spotlights.freshlyUpdated}
              label="Freshly updated"
              meta={`Updated ${formatFactionCatalogueDate(spotlights.freshlyUpdated.updated_at)}`}
            />
          ) : null}
        </div>
      ) : null}
    </Stack>
  );
}

function CatalogueToolbar({
  draftQuery,
  onDraftQueryChange,
  onCommitQuery,
  search,
  rulesets,
  visibleCount,
  totalCount,
  onSearchChange,
}: {
  draftQuery: string;
  onDraftQueryChange: (value: string) => void;
  onCommitQuery: () => void;
  search: FactionCatalogueSearch;
  rulesets: FactionRulesetSummary[];
  visibleCount: number;
  totalCount: number;
  onSearchChange: (patch: Partial<Record<keyof FactionCatalogueSearch, unknown>>) => void;
}) {
  const [opened, setOpened] = useState(false);
  const rulesetOptions = useMemo(
    () => [
      { value: 'all', label: 'All rulesets' },
      ...rulesets.map((ruleset) => ({ value: ruleset.slug, label: ruleset.name })),
    ],
    [rulesets]
  );
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return;
    }
    onCommitQuery();
    event.currentTarget.blur();
  };

  const rulesetSelect = (label?: string, joined = false) => (
    <Select
      className={joined ? styles.rulesetField : undefined}
      variant={joined ? 'unstyled' : 'default'}
      label={label}
      value={search.ruleset ?? 'all'}
      data={rulesetOptions}
      allowDeselect={false}
      onChange={(value) =>
        onSearchChange({ ruleset: value === 'all' ? undefined : (value ?? undefined) })
      }
      aria-label="Filter factions by ruleset"
      leftSection={<Filter size={15} aria-hidden />}
    />
  );
  const sortSelect = (label?: string, joined = false) => (
    <Select
      className={joined ? styles.sortField : undefined}
      variant={joined ? 'unstyled' : 'default'}
      label={label}
      value={search.sort ?? 'name'}
      data={[
        { value: 'name', label: 'Alphabetical (A–Z)' },
        { value: 'created', label: 'Chronological (created)' },
        { value: 'updated', label: 'Chronological (updated)' },
      ]}
      allowDeselect={false}
      onChange={(value) => onSearchChange({ sort: value === 'name' ? undefined : value })}
      aria-label="Sort factions"
      leftSection={<ArrowDownAZ size={15} aria-hidden />}
    />
  );

  return (
    <>
      <Toolbar>
        <Toolbar.Left>
          <Text size="sm" c="dimmed" className={styles.resultCount}>
            {visibleCount === totalCount
              ? `${totalCount} factions`
              : `${visibleCount} of ${totalCount} factions`}
          </Text>
        </Toolbar.Left>
        <Toolbar.Center>
          {/* The band's centre width comes from this field, not from the toolbar. */}
          <fieldset className={styles.joinedFilters} aria-label="Faction catalogue filters">
            <TextInput
              className={styles.searchField}
              variant="unstyled"
              value={draftQuery}
              onChange={(event) => onDraftQueryChange(event.currentTarget.value)}
              onBlur={onCommitQuery}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search factions…"
              aria-label="Search factions"
              leftSection={<Search size={16} aria-hidden />}
            />
            {rulesetSelect(undefined, true)}
            {sortSelect(undefined, true)}
            <Tooltip label="Refine factions">
              <ActionIcon
                className={styles.mobileRefineButton}
                variant="subtle"
                color="gray"
                size="lg"
                aria-label="Refine factions"
                onClick={() => setOpened(true)}
              >
                <SlidersHorizontal size={17} aria-hidden />
              </ActionIcon>
            </Tooltip>
          </fieldset>
        </Toolbar.Center>
        <Toolbar.Right>
          <Tooltip label="Create new faction">
            <ActionIcon
              variant="filled"
              color="confirm"
              size="lg"
              aria-label="Create new faction"
              renderRoot={(rootProps) => <Link {...rootProps} to="/factions/create" />}
            >
              <Plus size={17} aria-hidden />
            </ActionIcon>
          </Tooltip>
        </Toolbar.Right>
      </Toolbar>
      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        position="bottom"
        title="Refine factions"
        size="22rem"
        padding="lg"
      >
        <Stack gap="md" pb="md">
          {rulesetSelect('Ruleset')}
          {sortSelect('Sort by')}
        </Stack>
      </Drawer>
    </>
  );
}

function FilteredEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <Surface padding="xl">
      <Stack gap="sm" align="center">
        <Title order={2}>No factions found</Title>
        <Text c="dimmed">Try another search or reset the catalogue filters.</Text>
        <Button variant="light" color="gray" onClick={onReset}>
          Reset filters &amp; search
        </Button>
      </Stack>
    </Surface>
  );
}
