/* Three conversation arrangements on the real game sub-page, using in-memory messages only. */
import { Badge, Button, Group, MantineProvider, Select, Stack, Text, Textarea } from '@mantine/core';
import { ClientOnly, createFileRoute, Link, notFound } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { FactionLink } from '@ui/content/FactionLink';
import { ProfileLink } from '@ui/content/ProfileLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface/Surface';
import { appContentTheme } from '@ui/theme';
import { lazy, Suspense, useEffect, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';

import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token } from '@game/assets/faction/token/Token';
import { TraitorCard } from '@game/assets/faction/traitor/Traitor';

import { leadersOf } from '../drafting-prototype/leaders.fixture';
import {
  PARTNERS,
  SCENARIOS,
  VARIANTS,
  VARIANT_NAMES,
  factionOf,
  profileOf,
  makeConversation,
  reduceConversation,
} from './conversation.fixture';
import type { Action, ConversationState, Message } from './conversation.fixture';
import styles from './route.module.css';

const TablePreview = lazy(() => import('./TablePreview'));
export const Route = createFileRoute('/_app/play/demo_/conversation/$faction')({
  validateSearch: (search: Record<string, unknown>) => ({
    variant: VARIANTS.find((value) => value === search.variant) ?? 'A',
    scenario: SCENARIOS.find((value) => value === search.scenario) ?? 'unread',
  }),
  beforeLoad: ({ params }) => {
    if (!PARTNERS.some((item) => item.slug === params.faction)) {
      throw notFound();
    }
  },
  head: () => ({
    meta: [{ title: 'Faction conversation prototype | Dune Zone' }, { name: 'robots', content: 'noindex' }],
  }),
  component: ConversationPage,
});
type Props = { state: ConversationState; dispatch: (action: Action) => void; partner: string };
function Person({ slug }: { slug: string }) {
  const person = profileOf(slug);
  return <ProfileLink slug={person.slug} name={person.username} image={person.avatarUrl} />;
}
function PairIdentity({ state, partner }: Props) {
  const other = PARTNERS.find((item) => item.slug === partner)!;
  return (
    <Group gap="lg" className={styles.identity}>
      <Stack gap={4}>
        <FactionLink {...factionOf('fremen')} />
        <Person slug={state.author} />
      </Stack>
      <Text c="dimmed" aria-hidden>
        ↔
      </Text>
      <Stack gap={4}>
        <FactionLink {...factionOf(partner)} />
        <Person slug={other.profile} />
      </Stack>
    </Group>
  );
}
function Inventory({ compact = false }: { compact?: boolean }) {
  const own = factionOf('fremen');
  return (
    <section aria-label="Your inventory" className={`${styles.inventory} ${compact ? styles.compactInventory : ''}`}>
      <Text size="xs" c="dimmed">
        Your inventory
      </Text>
      <div className={styles.inventoryPieces}>
        {['house-harkonnen', 'emperor'].map((slug) => {
          const faction = factionOf(slug);
          const leader = leadersOf(slug)[0];
          return (
            <div key={slug} className={styles.card} aria-label={`${leader.name} traitor card`}>
              <div>
                <TraitorCard {...leader} logo={faction.logo} background={faction.background} owner={faction.name} />
              </div>
            </div>
          );
        })}
        <div className={styles.inventoryLeader} aria-label="Fremen leader">
          <LeaderToken {...leadersOf('fremen')[0]} logo={own.logo} background={own.background} />
        </div>
        <Text size="sm">11 spice</Text>
      </div>
    </section>
  );
}
function PartnerSelect({ partner }: { partner: string }) {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  return (
    <Select
      aria-label="Conversation"
      w={220}
      value={partner}
      data={PARTNERS.map(({ slug }) => ({ value: slug, label: factionOf(slug).name }))}
      onChange={(value) => {
        if (value) {
          void navigate({ params: { faction: value }, search });
        }
      }}
    />
  );
}
function PartnerList({ partner }: { partner: string }) {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  return (
    <Stack gap={6} aria-label="Faction conversations">
      {PARTNERS.map(({ slug }) => {
        const faction = factionOf(slug);
        return (
          <Button
            key={slug}
            h="auto"
            py="sm"
            px="xs"
            fullWidth
            variant={slug === partner ? 'light' : 'subtle'}
            color="gray"
            justify="start"
            aria-pressed={slug === partner}
            onClick={() => {
              void navigate({ params: { faction: slug }, search });
            }}
            leftSection={
              <span className={styles.factionToken}>
                <Token logo={faction.logo} background={faction.background} />
              </span>
            }
          >
            {faction.name}
          </Button>
        );
      })}
    </Stack>
  );
}
function Delivery({ message, last, dispatch }: { message: Message; last: boolean; dispatch: Props['dispatch'] }) {
  if (!message.mine) {
    return null;
  }
  if (message.state === 'sent') {
    return last ? (
      <Text size="xs" c="dimmed">
        Sent
      </Text>
    ) : null;
  }
  return (
    <Group gap="xs">
      <StatusBadge
        tone={message.state === 'failed' ? 'negative' : message.state === 'pending' ? 'pending' : 'progress'}
      >
        {message.state === 'failed' ? 'Failed' : message.state === 'pending' ? 'Pending' : 'Sending'}
      </StatusBadge>
      {message.state === 'failed' ? (
        <Button size="compact-xs" variant="light" onClick={() => dispatch({ type: 'retry', id: message.id })}>
          Retry
        </Button>
      ) : null}
    </Group>
  );
}
function Transcript({ state, dispatch, bubbles = false }: Props & { bubbles?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) {
      return;
    }
    const unread = element.querySelector<HTMLElement>('[data-unread]');
    const latest = state.messages.at(-1);
    const sentLocally = latest?.id.startsWith('new') || latest?.id.startsWith('retry-');
    element.scrollTop =
      unread && state.unreadFrom && !sentLocally
        ? element.scrollTop + unread.getBoundingClientRect().top - element.getBoundingClientRect().top - 16
        : element.scrollHeight;
  }, [state.key, state.messages, state.unreadFrom]);
  return (
    <div ref={root} className={styles.transcript} aria-label="Conversation history">
      <ol className={styles.messageList}>
        {state.messages.map((message, index) => {
          const copy = (
            <Stack gap={6}>
              <Group gap="xs">
                <Person slug={message.author} />
                <Text component="time" size="xs" c="dimmed">
                  {message.at}
                </Text>
              </Group>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {message.text}
              </Text>
              <Delivery message={message} last={index === state.messages.length - 1} dispatch={dispatch} />
            </Stack>
          );
          return (
            <li key={message.id} data-message={message.id} data-mine={message.mine} data-delivery={message.state}>
              {index === 0 || message.day !== state.messages[index - 1].day ? (
                <Text size="xs" c="dimmed" ta="center" py="md">
                  {message.day}
                </Text>
              ) : null}
              {state.unreadFrom === message.id ? (
                <Group data-unread justify="center" my="sm">
                  <Badge color="orange" variant="light">
                    New messages
                  </Badge>
                  <Button size="compact-xs" variant="subtle" onClick={() => dispatch({ type: 'read' })}>
                    Mark read
                  </Button>
                </Group>
              ) : null}
              {bubbles ? (
                <div className={`${styles.bubble} ${message.mine ? styles.ownBubble : ''}`}>
                  <Surface padding="sm" withBorder={false}>
                    {copy}
                  </Surface>
                </div>
              ) : (
                <div className={styles.plainMessage}>{copy}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
function Composer({ state, dispatch }: Props) {
  const send = () =>
    dispatch({ type: 'send', at: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) });
  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <Textarea
        aria-label="Message"
        placeholder="Message"
        autosize
        minRows={2}
        maxRows={4}
        value={state.draft}
        onChange={(event) => dispatch({ type: 'draft', value: event.currentTarget.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            send();
          }
        }}
      />
      <div className={styles.send}>
        <Button type="submit" disabled={!state.draft.trim()}>
          Send
        </Button>
        {!state.online ? <StatusBadge tone="pending">Offline</StatusBadge> : null}
      </div>
    </form>
  );
}
function VariantA(props: Props) {
  return (
    <div className={styles.reading}>
      <div className={styles.readingTools}>
        <Inventory compact />
        <PartnerSelect partner={props.partner} />
      </div>
      <Transcript {...props} />
      <Composer {...props} />
    </div>
  );
}
function VariantB(props: Props) {
  return (
    <div className={styles.split}>
      <aside className={styles.sidebar}>
        <PartnerList partner={props.partner} />
        <Inventory />
      </aside>
      <div className={styles.chat}>
        <Transcript {...props} bubbles />
        <Composer {...props} />
      </div>
    </div>
  );
}
function VariantC(props: Props) {
  return (
    <div className={styles.tableSplit}>
      <div className={styles.tableColumn}>
        <div className={styles.table} inert>
          <ClientOnly fallback={<Text>Loading table</Text>}>
            <Suspense fallback={<Text>Loading table</Text>}>
              <TablePreview />
            </Suspense>
          </ClientOnly>
        </div>
        <Inventory compact />
      </div>
      <div className={styles.chat}>
        <PartnerSelect partner={props.partner} />
        <Transcript {...props} />
        <Composer {...props} />
      </div>
    </div>
  );
}
function ConversationPage() {
  const search = Route.useSearch();
  const { faction: partner } = Route.useParams();
  const navigate = Route.useNavigate();
  const key = `${partner}:${search.scenario}`;
  const [state, dispatch] = useReducer(reduceConversation, undefined, () =>
    makeConversation(key, search.scenario, partner)
  );
  if (state.key !== key) {
    dispatch({ type: 'load', key, scenario: search.scenario, partner });
  }
  const sending = state.messages
    .filter((message) => message.state === 'sending' && message.id !== 'fixture-last')
    .map((message) => message.id)
    .join(',');
  useEffect(() => {
    if (!sending) {
      return;
    }
    const timer = setTimeout(() => dispatch({ type: 'delivered', ids: sending.split(',') }), 900);
    return () => clearTimeout(timer);
  }, [sending]);
  const go = (step: number) => {
    void navigate({
      search: {
        ...search,
        variant: VARIANTS[(VARIANTS.indexOf(search.variant) + step + VARIANTS.length) % VARIANTS.length],
      },
    });
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input,textarea,select,button,[role="combobox"],[contenteditable="true"]')) {
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        go(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const props = { state, dispatch, partner };
  let content: ReactNode;
  if (state.scenario === 'revoked') {
    content = <Text role="status">No access to this conversation.</Text>;
  } else {
    content = (
      <>
        <PairIdentity {...props} />
        {search.variant === 'A' ? (
          <VariantA {...props} />
        ) : search.variant === 'B' ? (
          <VariantB {...props} />
        ) : (
          <VariantC {...props} />
        )}
      </>
    );
  }
  return (
    <PageLayout height="fullscreen">
      <PageLayout.Header>
        <PageTitle title="Faction conversation" />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">
        <MantineProvider
          theme={appContentTheme}
          forceColorScheme="dark"
          cssVariablesSelector="#conversation-prototype"
          getRootElement={() => document.getElementById('conversation-prototype') ?? undefined}
        >
          <main
            id="conversation-prototype"
            data-mantine-color-scheme="dark"
            data-conversation-variant={search.variant}
            className={styles.page}
          >
            <header className={styles.header}>
              <img src="/web/logo.svg" alt="Dune" />
              <Button
                size="sm"
                variant="light"
                renderRoot={(linkProps) => (
                  <Link
                    {...linkProps}
                    to="/play/demo"
                    search={{
                      variant: 'play',
                      conversation: partner,
                      seats: 6,
                      battle: undefined,
                      scenario: undefined,
                    }}
                  />
                )}
              >
                Back to game
              </Button>
            </header>
            {content}
            {import.meta.env.DEV ? (
              <div className={styles.switcher} aria-label="Conversation prototype controls">
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="dark"
                  aria-label="Previous variant"
                  onClick={() => go(-1)}
                >
                  ←
                </Button>
                <span>
                  <b>{search.variant}</b> · {VARIANT_NAMES[search.variant]}
                </span>
                <Button size="compact-xs" variant="subtle" color="dark" aria-label="Next variant" onClick={() => go(1)}>
                  →
                </Button>
                <Select
                  aria-label="Conversation scenario"
                  w={145}
                  size="xs"
                  value={search.scenario}
                  data={[...SCENARIOS]}
                  onChange={(value) => {
                    const scenario = SCENARIOS.find((item) => item === value);
                    if (scenario) {
                      void navigate({ search: { ...search, scenario } });
                    }
                  }}
                />
                {!state.online ? (
                  <Button size="compact-xs" onClick={() => dispatch({ type: 'reconnect' })}>
                    Reconnect
                  </Button>
                ) : null}
              </div>
            ) : null}
          </main>
        </MantineProvider>
      </PageLayout.Content>
    </PageLayout>
  );
}
