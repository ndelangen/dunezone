/* Three public-history layouts for #1149 on the game's history sub-page.
 * Fixture data only; the accepted arrangement stays on the unmerged prototype branch.
 */
import { Badge, Button, Group, Stack, Text, Select, SegmentedControl, MantineProvider } from '@mantine/core';
import { ClientOnly, createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { BattlePlanFace } from '@ui/content/BattlePlanFace';
import { FactionLink } from '@ui/content/FactionLink';
import { LOG_CLASSIFICATIONS } from '@ui/content/logClassification';
import { ProfileLink } from '@ui/content/ProfileLink';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface/Surface';
import { appContentTheme } from '@ui/theme';
import { lazy, Suspense, useEffect } from 'react';

import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

import {
  HISTORY_ENTRIES,
  HISTORY_KINDS,
  HISTORY_NAMES,
  HISTORY_SCENARIOS,
  HISTORY_VARIANTS,
  KIND_NAMES,
  historyFaction,
  historyProfile,
} from './history.fixture';
import type { HistoryEntry, HistoryKind, HistoryScenario } from './history.fixture';
import styles from './route.module.css';

const TablePreview = lazy(() => import('./TablePreview'));
export const Route = createFileRoute('/_app/play/demo_/history')({
  validateSearch: (search: Record<string, unknown>) => ({
    variant: HISTORY_VARIANTS.find((value) => value === search.variant) ?? 'A',
    scenario: HISTORY_SCENARIOS.find((value) => value === search.scenario) ?? 'latest',
    kind: HISTORY_KINDS.find((value) => value === search.kind),
    entry:
      typeof search.entry === 'string' && HISTORY_ENTRIES.some((entry) => entry.id === search.entry)
        ? search.entry
        : undefined,
    count: typeof search.count === 'number' ? Math.max(8, Math.min(18, search.count)) : 8,
  }),
  head: () => ({ meta: [{ title: 'Game history prototype | Dune Zone' }, { name: 'robots', content: 'noindex' }] }),
  component: HistoryPage,
});

function EventMark({ entry }: { entry: HistoryEntry }) {
  return <Badge variant="light" color={LOG_CLASSIFICATIONS[entry.kind].color} size="sm" tt="none">{LOG_CLASSIFICATIONS[entry.kind].label}</Badge>;
}
function EntryMeta({ entry }: { entry: HistoryEntry }) {
  return (
    <Group gap="xs">
      <Text size="xs" c="dimmed">
        Turn {entry.turn} · {entry.phase}
      </Text>
      <Text component="time" dateTime={entry.at} size="xs" c="dimmed">
        {new Date(entry.at).toLocaleString('en-GB', {
          timeZone: 'Europe/Amsterdam',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </Group>
  );
}
function BattleRecord({ entry }: { entry: HistoryEntry }) {
  if (!entry.battle) {
    return null;
  }
  return (
    <div className={styles.battleRecord} aria-label="Revealed battle plans">
      {entry.battle.plans.map((plan) => (
        <div className={styles.plan} key={plan.faction}>
          <Text size="sm" fw={600}>
            {plan.face.name}
          </Text>
          <div className={styles.planArtwork}>
            <div className={styles.cards}>
              {plan.cards.map((id, i) => (
                <div
                  className={styles.card}
                  key={id}
                  style={{
                    transform: `translateX(${(i - (plan.cards.length - 1) / 2) * 42}px) rotate(${(i - (plan.cards.length - 1) / 2) * 22}deg)`,
                  }}
                  aria-label={treacheryCardFixtures[id].name}
                >
                  <div className={styles.cardFace}>
                    <TreacheryCard {...treacheryCardFixtures[id]} />
                  </div>
                </div>
              ))}
            </div>
            <BattlePlanFace {...plan.face} />
          </div>
          <Text size="xs" c="dimmed">
            {plan.face.troops} troops · {plan.face.spice} spice
          </Text>
        </div>
      ))}
    </div>
  );
}
function Attribution({ entry }: { entry: HistoryEntry }) {
  const profile = entry.actor ? historyProfile(entry.actor) : null;
  return (
    <Group gap="md" wrap="wrap">
      {profile ? <ProfileLink slug={profile.slug} name={profile.username} image={profile.avatarUrl} /> : null}
      {entry.factions?.map((slug) => {
        const faction = historyFaction(slug);
        return (
          <FactionLink key={slug} slug={slug} name={faction.name} logo={faction.logo} background={faction.background} />
        );
      })}
    </Group>
  );
}
function EntryDetail({ entry }: { entry: HistoryEntry }) {
  return (
    <Stack gap="lg" data-history-detail={entry.id}>
      <Group justify="space-between">
        <Group gap="sm">
          <EventMark entry={entry} />
          <Text fw={650} size="xl">
            {entry.title}
          </Text>
        </Group>
      </Group>
      <EntryMeta entry={entry} />
      {entry.battle ? <BattleRecord entry={entry} /> : null}
      <Text size="sm">{entry.detail}</Text>
      <Attribution entry={entry} />
    </Stack>
  );
}
function HistoryPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const variant = search.variant;
  const kind: HistoryKind = search.kind ?? (search.scenario === 'filtered' ? 'spice' : 'all');
  const count = search.scenario === 'older' ? 18 : search.count;
  const filtered =
    search.scenario === 'empty' ? [] : HISTORY_ENTRIES.filter((entry) => kind === 'all' || entry.kind === kind);
  const visible = filtered.slice(0, count);
  const chosen =
    visible.find((entry) => entry.id === search.entry) ??
    (search.scenario === 'older'
      ? visible.at(-1)
      : search.scenario === 'battle'
        ? visible.find((entry) => entry.kind === 'battle')
        : undefined) ??
    visible[0];
  const update = (patch: Partial<typeof search>) => void navigate({ search: { ...search, ...patch }, replace: true });
  const pick = (entry: HistoryEntry) => update({ entry: entry.id });
  const cycle = (delta: number) =>
    update({ variant: HISTORY_VARIANTS[(HISTORY_VARIANTS.indexOf(variant) + delta + 3) % 3] });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest('input, textarea, select, [role="combobox"], [contenteditable="true"]')
      ) {
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        cycle(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  useEffect(() => {
    if (variant !== 'A') {
      return;
    }
    const id = search.entry ?? (search.scenario === 'older' ? 'e1' : undefined);
    if (id) {
      document.querySelector(`[data-history-entry="${id}"]`)?.scrollIntoView({ block: 'start' });
    }
  }, [search.entry, search.scenario, variant, count]);
  const filters = (
    <Select
      aria-label="Filter history by kind"
      data={HISTORY_KINDS.map((value) => ({ value, label: KIND_NAMES[value] }))}
      value={kind}
      onChange={(value) => update({ kind: value as HistoryKind, entry: undefined })}
      w={180}
    />
  );
  const older =
    visible.length < filtered.length ? (
      <Button variant="light" color="gray" onClick={() => update({ count: 18 })}>
        Older entries
      </Button>
    ) : (
      <Text size="xs" c="dimmed">
        Beginning of this game
      </Text>
    );
  const index = (
    <Stack gap="xs">
      {visible.map((entry) => (
        <Button
          className={styles.indexEntry}
          styles={{ label: { width: '100%' } }}
          key={entry.id}
          variant={chosen?.id === entry.id ? 'light' : 'subtle'}
          color={chosen?.id === entry.id ? 'orange' : 'gray'}
          fullWidth
          onClick={() => pick(entry)}
          aria-pressed={chosen?.id === entry.id}
        >
          <span className={styles.indexContent}>
            <EntryMeta entry={entry} />
            <span>{entry.title}</span>
          </span>
        </Button>
      ))}
      {older}
    </Stack>
  );
  const noEntries = (
    <Text c="dimmed" py="xl">
      No events match this filter.
    </Text>
  );
  return (
    <PageLayout height="fullscreen">
      <PageLayout.Header size="compact">
        <PageTitle title="Game history" />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">
        <MantineProvider
          theme={appContentTheme}
          forceColorScheme="dark"
          cssVariablesSelector="#history-prototype"
          getRootElement={() => document.getElementById('history-prototype') ?? undefined}
        >
          <main
            id="history-prototype"
            data-mantine-color-scheme="dark"
            className={styles.page}
            data-history-variant={variant}
          >
            <header className={styles.header}>
              <img src="/web/logo.svg" alt="Dune" />
              <div>
                <Text size="xl" fw={650}>
                  Game history
                </Text>
                <Text size="xs" c="dimmed">
                  Demo game · Turn 3
                </Text>
              </div>
              <Button
                renderRoot={(props) => (
                  <Link
                    {...props}
                    to="/play/demo"
                    search={{ variant: 'play', battle: undefined, seats: 6, scenario: undefined }}
                  />
                )}
                variant="filled"
                color="gray"
              >
                Back to game
              </Button>
            </header>
            <div className={styles.toolbar}>
              <Group gap="md">
                {filters}
                <Text size="sm" c="dimmed">
                  {filtered.length} events
                </Text>
              </Group>
              {variant === 'A' ? (
                <SegmentedControl
                  aria-label="Jump to turn"
                  data={['3', '2', '1'].map((value) => ({ value, label: `Turn ${value}` }))}
                  value={chosen ? String(chosen.turn) : '3'}
                  onChange={(value) => {
                    update({ count: 18, entry: HISTORY_ENTRIES.find((entry) => entry.turn === Number(value))?.id });
                    requestAnimationFrame(() =>
                      document.getElementById(`history-turn-${value}`)?.scrollIntoView({ behavior: 'smooth' })
                    );
                  }}
                />
              ) : (
                <Text size="xs" c="dimmed">
                  Newest first
                </Text>
              )}
            </div>
            {variant === 'A' ? (
              <div className={styles.journal}>
                <Surface withBorder={false} padding="lg">
                  {visible.length ? (
                    <Stack gap="xl">
                      {[3, 2, 1]
                        .filter((turn) => visible.some((entry) => entry.turn === turn))
                        .map((turn) => (
                          <section id={`history-turn-${turn}`} key={turn}>
                            <Text fw={650} size="lg" mb="md">
                              Turn {turn}
                            </Text>
                            <Stack gap="lg">
                              {visible
                                .filter((entry) => entry.turn === turn)
                                .map((entry) => (
                                  <article className={styles.journalEntry} key={entry.id} data-history-entry={entry.id}>
                                    {entry.kind === 'battle' ? (
                                      <EntryDetail entry={entry} />
                                    ) : (
                                      <>
                                        <Group gap="sm">
                                          <EventMark entry={entry} />
                                          <Text fw={550}>{entry.title}</Text>
                                        </Group>
                                        <EntryMeta entry={entry} />
                                        <Text size="sm" c="dimmed">
                                          {entry.detail}
                                        </Text>
                                      </>
                                    )}
                                  </article>
                                ))}
                            </Stack>
                          </section>
                        ))}
                      {older}
                    </Stack>
                  ) : (
                    noEntries
                  )}
                </Surface>
              </div>
            ) : variant === 'B' ? (
              <div className={styles.split}>
                <Surface withBorder={false} padding="md" className={styles.index}>
                  {visible.length ? index : noEntries}
                </Surface>
                <Surface withBorder={false} padding="xl" className={styles.detail}>
                  {chosen ? <EntryDetail entry={chosen} /> : noEntries}
                </Surface>
              </div>
            ) : (
              <div className={styles.tableLayout}>
                <div className={styles.tableColumn}>
                  <Group justify="space-between">
                    <Text size="sm">Current table</Text>
                    <Text size="xs" c="dimmed">
                      Turn 3 · Spice collection
                    </Text>
                  </Group>
                  <div className={styles.tablePreview} inert>
                    <ClientOnly>
                      <Suspense fallback={<Text>Loading table...</Text>}>
                        <TablePreview />
                      </Suspense>
                    </ClientOnly>
                  </div>
                  <Surface withBorder={false} padding="lg">
                    {chosen ? <EntryDetail entry={chosen} /> : noEntries}
                  </Surface>
                </div>
                <Surface withBorder={false} padding="md" className={styles.index}>
                  {visible.length ? index : noEntries}
                </Surface>
              </div>
            )}
            {import.meta.env.DEV ? (
              <div className={styles.switcher} aria-label="History prototype controls">
                <Button size="compact-xs" color="gray" onClick={() => cycle(-1)} aria-label="Previous history variant">
                  ←
                </Button>
                <Text size="sm" fw={600}>
                  {variant} · {HISTORY_NAMES[variant]}
                </Text>
                <Button size="compact-xs" color="gray" onClick={() => cycle(1)} aria-label="Next history variant">
                  →
                </Button>
                <select
                  aria-label="History scenario"
                  value={search.scenario}
                  onChange={(event) =>
                    update({
                      scenario: event.target.value as HistoryScenario,
                      kind: undefined,
                      entry: undefined,
                      count: 8,
                    })
                  }
                >
                  {HISTORY_SCENARIOS.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <Text size="xs">Fixture</Text>
              </div>
            ) : null}
          </main>
        </MantineProvider>
      </PageLayout.Content>
    </PageLayout>
  );
}
