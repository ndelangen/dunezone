import {
  ActionIcon,
  Alert,
  Button,
  Drawer,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { ArrowDownAZ, Filter, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { loadFactionCataloguePage, useFactionCataloguePage } from '@db/factions';
import type {
  FactionCataloguePageData,
  FactionRulesetSummary,
} from '@db/factions';
import { CreateFactionCta } from '@app/components/factions/CreateFactionCta';
import { FactionCatalogueSpotlight } from '@app/components/factions/FactionCatalogueSpotlight';
import { FactionList } from '@app/components/factions/FactionList';
import { PageLayout } from '@app/components/shell';
import {
  factionCatalogueSearchParams,
  filterAndSortFactions,
  isFactionCatalogueSort,
  normalizeFactionCatalogueSearch,
  parseFactionCatalogueSearch,
} from '@app/factions/catalogue';
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
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const catalogue = useFactionCataloguePage({ initialData: loaderData });
  const data = catalogue.data;
  const [draftQuery, setDraftQuery] = useState(search.q ?? '');

  useEffect(() => setDraftQuery(search.q ?? ''), [search.q]);

  useEffect(() => {
    if (!data) {
      return;
    }
    const canonical = normalizeFactionCatalogueSearch(search, data.rulesets);
    const expected = factionCatalogueSearchParams(canonical).toString();
    const current = new URLSearchParams(window.location.search).toString();
    if (current !== expected) {
      navigate({ to: '.', search: canonical, replace: true });
    }
  }, [data, navigate, search]);

  if (!data) {
    return <FactionCataloguePending />;
  }

  const updateSearch = (patch: Partial<FactionCatalogueSearch>) => {
    navigate({
      to: '.',
      search: (previous) => parseFactionCatalogueSearch({ ...previous, ...patch }),
      replace: true,
    });
  };

  const visibleFactions = filterAndSortFactions(data.factions, search, draftQuery);
  const hasFactions = data.factions.length > 0;

  return (
    <PageLayout
      header={<CatalogueHeader spotlights={hasFactions ? data.spotlights : undefined} />}
      toolbar={
        hasFactions ? (
          <CatalogueToolbar
            draftQuery={draftQuery}
            onDraftQueryChange={setDraftQuery}
            onCommitQuery={() => updateSearch({ q: draftQuery.trim() || undefined })}
            search={search}
            rulesets={data.rulesets}
            visibleCount={visibleFactions.length}
            totalCount={data.factions.length}
            onSearchChange={updateSearch}
          />
        ) : undefined
      }
    >
      {hasFactions ? (
        visibleFactions.length > 0 ? (
          <FactionList factions={visibleFactions} selectedRulesetSlug={search.ruleset} />
        ) : (
          <FilteredEmptyState
            onReset={() => {
              setDraftQuery('');
              updateSearch({ q: undefined, ruleset: undefined });
            }}
          />
        )
      ) : (
        <Paper className={styles.stateCard} withBorder radius="md" p="xl">
          <Title order={2}>There are no factions</Title>
          <Text c="dimmed" mt="xs">
            Create the first faction to begin the collection.
          </Text>
        </Paper>
      )}
    </PageLayout>
  );
}

function FactionCataloguePending() {
  return (
    <PageLayout header={<CatalogueHeader />}>
      <Paper className={styles.stateCard} withBorder radius="md" p="xl" aria-live="polite">
        <Stack align="center" gap="sm">
          <Loader size="sm" />
          <Title order={2}>Loading factions</Title>
          <Text c="dimmed">The faction catalogue is still loading.</Text>
        </Stack>
      </Paper>
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
      <Group justify="space-between" align="end" wrap="wrap" gap="md">
        <Stack gap={4}>
          <Text tt="uppercase" size="xs" fw={800} lts="0.12em" c="dune.8">
            Explore the collection
          </Text>
          <Title order={1}>Faction catalogue</Title>
          <Text size="sm" c="dimmed">
            Browse the living collection of community factions.
          </Text>
        </Stack>
        <CreateFactionCta attention />
      </Group>

      {hasSpotlight ? (
        <div className={styles.spotlightRail}>
          {spotlights?.newArrival ? (
            <FactionCatalogueSpotlight
              faction={spotlights.newArrival}
              label="New arrival"
              meta={`Created ${formatDate(spotlights.newArrival.created_at)}`}
            />
          ) : null}
          {spotlights?.freshlyUpdated ? (
            <FactionCatalogueSpotlight
              faction={spotlights.freshlyUpdated}
              label="Freshly updated"
              meta={`Updated ${formatDate(spotlights.freshlyUpdated.updated_at)}`}
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
  onSearchChange: (patch: Partial<FactionCatalogueSearch>) => void;
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
      onChange={(value) =>
        onSearchChange({ sort: isFactionCatalogueSort(value) ? value : undefined })
      }
      aria-label="Sort factions"
      leftSection={<ArrowDownAZ size={15} aria-hidden />}
    />
  );

  return (
    <>
      <Paper className={styles.toolbar} withBorder radius="md" p="sm">
        <div className={styles.toolbarGrid}>
          <Text className={styles.resultCount} size="sm" c="dimmed">
            {visibleCount === totalCount
              ? `${totalCount} factions`
              : `${visibleCount} of ${totalCount} factions`}
          </Text>
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
          <Tooltip label="Create new faction">
            <ActionIcon
              className={styles.toolbarCreateButton}
              variant="filled"
              color="confirm"
              size="lg"
              aria-label="Create new faction"
              renderRoot={(rootProps) => <Link {...rootProps} to="/factions/create" />}
            >
              <Plus size={17} aria-hidden />
            </ActionIcon>
          </Tooltip>
        </div>
      </Paper>
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
    <Paper className={styles.stateCard} withBorder radius="md" p="xl">
      <Stack gap="sm" align="center">
        <Title order={2}>No factions found</Title>
        <Text c="dimmed">Try another search or reset the catalogue filters.</Text>
        <Button variant="light" color="gray" onClick={onReset}>
          Reset filters &amp; search
        </Button>
      </Stack>
    </Paper>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}
