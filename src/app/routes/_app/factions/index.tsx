import {
  Badge,
  Button,
  Drawer,
  Group,
  InputBase,
  Popover,
  RangeSlider,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Link, createFileRoute } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { FactionCatalogueSpotlight } from '@ui/block/FactionCatalogueSpotlight';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { PageTitle } from '@ui/block/PageTitle';
import { complexityTierSliderMarks } from '@ui/content/ComplexityGlyph';
import { formatStableDate } from '@ui/content/dates';
import { CallToAction } from '@ui/control/CallToAction';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { FactionList } from '@ui/list/FactionList';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowDownAZ, ChevronsDown, Filter, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { loadFactionCataloguePage, useFactionCataloguePage } from '@db/factions';
import type { FactionCatalogueEntry, FactionCataloguePageData, FactionRulesetSummary } from '@db/factions';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import {
  complexityRangeSearchValue,
  parseComplexityRange,
  parseFactionCatalogueSearch,
  useFactionCatalogueSession,
} from './catalogue';
import type { FactionCatalogueSearch, FactionComplexityRange } from './catalogue';
import styles from './index.module.css';

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
    <PageLayout>
      <PageLayout.Header>
        <CatalogueHeader spotlights={hasFactions ? data.spotlights : undefined} />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        {hasFactions ? (
          <CatalogueToolbar
            draftQuery={session.query.value}
            onDraftQueryChange={session.query.change}
            onCommitQuery={session.query.commit}
            search={session.search}
            rulesets={data.rulesets}
            factions={data.factions}
            visibleCount={session.visibleFactions.length}
            totalCount={data.factions.length}
            onSearchChange={session.changeSearch}
          />
        ) : undefined}
      </PageLayout.Toolbar>
      <PageLayout.Content>
        {hasFactions ? (
          session.visibleFactions.length > 0 ? (
            <FactionList factions={session.visibleFactions} selectedRulesetSlug={session.search.ruleset} />
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
      </PageLayout.Content>
    </PageLayout>
  );
}

/*
 * No way back on either frame: the catalogue is the top of its own branch, so a link here would
 * point at the page the reader is already on.
 *
 * These two states lose the catalogue header's eyebrow, its description and its create-a-faction
 * call to action, which the frame does not carry. That is the one place in this slice where the
 * shared frame costs a reader something they could have used, and it is a deliberate trade for one
 * spelling of "still loading" and one of "did not load" across the tree.
 */
function FactionCataloguePending() {
  return (
    <PageMessage title="Faction catalogue">
      <LoadPending title="Loading factions">The faction catalogue is still loading.</LoadPending>
    </PageMessage>
  );
}

function FactionCatalogueError({ error }: ErrorComponentProps) {
  return (
    <PageMessage title="Faction catalogue">
      <LoadError title="Faction catalogue could not be loaded" stale={isStaleClientData(error)}>
        {error.message}
      </LoadError>
    </PageMessage>
  );
}

function CatalogueHeader({ spotlights }: { spotlights?: FactionCataloguePageData['spotlights'] }) {
  const hasSpotlight = Boolean(spotlights?.newArrival || spotlights?.freshlyUpdated);

  return (
    <Stack className={styles.catalogueHeader} gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Stack gap={4} align="flex-start" miw={0}>
          <PageTitle eyebrow="Explore the collection" title="Faction catalogue" />
          <Text size="sm" c="dimmed">
            Browse the living collection of community factions.
          </Text>
        </Stack>
        <CallToAction attention renderRoot={(rootProps) => <Link {...rootProps} to="/factions/create" />}>
          Create your own faction
        </CallToAction>
      </Group>

      {hasSpotlight ? (
        <div className={styles.spotlightRail}>
          {spotlights?.newArrival ? (
            <FactionCatalogueSpotlight
              faction={spotlights.newArrival}
              label="New arrival"
              meta={`Created ${formatStableDate(spotlights.newArrival.created_at)}`}
            />
          ) : null}
          {spotlights?.freshlyUpdated ? (
            <FactionCatalogueSpotlight
              faction={spotlights.freshlyUpdated}
              label="Freshly updated"
              meta={`Updated ${formatStableDate(spotlights.freshlyUpdated.updated_at)}`}
            />
          ) : null}
        </div>
      ) : null}
    </Stack>
  );
}

const COMPLEXITY_SLIDER_MARKS = complexityTierSliderMarks();

/** One controlled range control shared by the desktop popover and mobile drawer. */
function ComplexityRangeSlider({
  value,
  onCommit,
}: {
  value: string | undefined;
  onCommit: (value: FactionComplexityRange) => void;
}) {
  const [draft, setDraft] = useState<FactionComplexityRange>(() => parseComplexityRange(value));
  const [seeded, setSeeded] = useState(value);
  /* Reset during render, the search box's pattern. Compared on the raw prop rather than on the parsed
     range, because parsing allocates a new object every call and would reset on every render. */
  if (value !== seeded) {
    setSeeded(value);
    setDraft(parseComplexityRange(value));
  }

  return (
    <RangeSlider
      min={0}
      max={10}
      step={1}
      minRange={0}
      value={draft}
      onChange={setDraft}
      onChangeEnd={(next) => {
        setDraft(next);
        onCommit(next);
      }}
      label={(point) => `${point}/10`}
      marks={COMPLEXITY_SLIDER_MARKS}
      mb="md"
      thumbFromLabel="Minimum complexity"
      thumbToLabel="Maximum complexity"
    />
  );
}

/**
 * The band's filter field: one popover holding the ruleset chips and the complexity range, everything that narrows the grid, while sorting stays its own field.
 * The trigger reads exactly like the selects beside it.
 */
function CatalogueRefine({
  search,
  rulesetOptions,
  factions,
  visibleCount,
  totalCount,
  onSearchChange,
  className,
}: {
  search: FactionCatalogueSearch;
  rulesetOptions: { value: string; label: string }[];
  factions: FactionCatalogueEntry[];
  visibleCount: number;
  totalCount: number;
  onSearchChange: (patch: Partial<Record<keyof FactionCatalogueSearch, unknown>>) => void;
  className?: string;
}) {
  const rulesetActive = search.ruleset != null;
  const rangeActive = search.complexity != null;
  const activeCount = (rulesetActive ? 1 : 0) + (rangeActive ? 1 : 0);

  const rulesetCount = (slug: string) =>
    slug === 'all'
      ? factions.length
      : factions.filter((faction) => faction.rulesets.some((ruleset) => ruleset.slug === slug)).length;

  return (
    <Popover position="bottom" width={320} closeOnEscape trapFocus>
      <Popover.Target>
        <InputBase
          component="button"
          type="button"
          pointer
          variant="unstyled"
          className={className}
          leftSection={<Filter size={15} aria-hidden />}
          rightSection={<ChevronsDown size={15} aria-hidden opacity={0.6} />}
          aria-label="Refine factions by ruleset and complexity"
        >
          Refine{activeCount > 0 ? ` (${activeCount})` : ''}
        </InputBase>
      </Popover.Target>
      <Popover.Dropdown style={{ padding: 0, border: 0, boxShadow: 'none' }}>
        <Surface padding="md">
          <Stack gap="md">
            <Stack gap="xs">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                Ruleset
              </Text>
              <Group gap={6} role="group" aria-label="Filter factions by ruleset">
                {rulesetOptions.map((option) => {
                  const selected = (search.ruleset ?? 'all') === option.value;
                  return (
                    <Badge
                      key={option.value}
                      component="button"
                      type="button"
                      aria-pressed={selected}
                      variant={selected ? 'filled' : 'light'}
                      color={selected ? 'selected' : 'gray'}
                      style={{ cursor: 'pointer' }}
                      onClick={() =>
                        onSearchChange({
                          ruleset: option.value === 'all' ? undefined : option.value,
                        })
                      }
                      rightSection={
                        <Text size="xs" span opacity={0.75}>
                          {rulesetCount(option.value)}
                        </Text>
                      }
                    >
                      {option.label}
                    </Badge>
                  );
                })}
              </Group>
            </Stack>

            <Stack gap="xs">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                Complexity range
              </Text>
              <ComplexityRangeSlider
                value={search.complexity}
                onCommit={(value) => onSearchChange({ complexity: complexityRangeSearchValue(value) })}
              />
            </Stack>

            <Group gap="xs" justify="space-between">
              <Text size="xs" c="dimmed">
                {visibleCount === totalCount ? `${totalCount} factions` : `${visibleCount} of ${totalCount} factions`}
              </Text>
              {activeCount > 0 ? (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => onSearchChange({ ruleset: undefined, complexity: undefined })}
                >
                  Clear filters
                </Button>
              ) : null}
            </Group>
          </Stack>
        </Surface>
      </Popover.Dropdown>
    </Popover>
  );
}

function CatalogueToolbar({
  draftQuery,
  onDraftQueryChange,
  onCommitQuery,
  search,
  rulesets,
  factions,
  visibleCount,
  totalCount,
  onSearchChange,
}: {
  draftQuery: string;
  onDraftQueryChange: (value: string) => void;
  onCommitQuery: () => void;
  search: FactionCatalogueSearch;
  rulesets: FactionRulesetSummary[];
  factions: FactionCatalogueEntry[];
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

  const rulesetSelect = (label?: string) => (
    <Select
      label={label}
      value={search.ruleset ?? 'all'}
      data={rulesetOptions}
      allowDeselect={false}
      onChange={(value) => onSearchChange({ ruleset: value === 'all' ? undefined : (value ?? undefined) })}
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
        { value: 'complexity-asc', label: 'Complexity (low → high)' },
        { value: 'complexity-desc', label: 'Complexity (high → low)' },
      ]}
      allowDeselect={false}
      onChange={(value) => onSearchChange({ sort: value === 'name' ? undefined : value })}
      aria-label="Sort factions"
      leftSection={<ArrowDownAZ size={15} aria-hidden />}
    />
  );
  const complexitySlider = (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        Complexity range
      </Text>
      <ComplexityRangeSlider
        value={search.complexity}
        onCommit={(value) => onSearchChange({ complexity: complexityRangeSearchValue(value) })}
      />
    </Stack>
  );

  return (
    <>
      <Toolbar>
        <Toolbar.Left>
          <Text size="sm" c="dimmed" className={styles.resultCount}>
            {visibleCount === totalCount ? `${totalCount} factions` : `${visibleCount} of ${totalCount} factions`}
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
            <CatalogueRefine
              className={styles.rulesetField}
              search={search}
              rulesetOptions={rulesetOptions}
              factions={factions}
              visibleCount={visibleCount}
              totalCount={totalCount}
              onSearchChange={onSearchChange}
            />
            {sortSelect(undefined, true)}
            <IconAction
              label="Refine factions"
              className={styles.mobileRefineButton}
              emphasis="quiet"
              intent="neutral"
              size="lg"
              onClick={() => setOpened(true)}
              icon={<SlidersHorizontal size={17} aria-hidden />}
            />
          </fieldset>
        </Toolbar.Center>
        <Toolbar.Right>
          <IconAction
            label="Create new faction"
            emphasis="strong"
            intent="positive"
            size="lg"
            renderRoot={(rootProps) => <Link {...rootProps} to="/factions/create" />}
            icon={<Plus size={17} aria-hidden />}
          />
        </Toolbar.Right>
      </Toolbar>
      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        position="bottom"
        title="Refine factions"
        size="26rem"
        padding="lg"
      >
        <Stack gap="md" pb="md">
          {rulesetSelect('Ruleset')}
          {complexitySlider}
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
        <Button variant="default" onClick={onReset}>
          Reset filters &amp; search
        </Button>
      </Stack>
    </Surface>
  );
}
