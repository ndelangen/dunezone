import { Anchor, Code, Group, Stack, Switch, Table, Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ActionError } from '@ui/block/ActionError';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { Breadcrumb } from '@ui/content/Breadcrumb';
import { EmptyNote } from '@ui/content/EmptyNote';
import { StatusBadge } from '@ui/content/StatusBadge';
import { ControlBlock } from '@ui/control/ControlBlock';
import { HoldAction } from '@ui/control/HoldAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useReducer } from 'react';

import {
  useDeleteDiscordChannel,
  useDeleteDiscordOrphan,
  useDiscordAdminPage,
  useRefreshDiscordOrphans,
  useSetDiscordEnabled,
} from '@db/discordAdmin';
import { pageHead } from '@app/routes/pageTitle';
import { AdminPageLoading } from '@app/widgets/page-message/AdminGate';

export const Route = createFileRoute('/_app/admin/discord')({
  codeSplitGroupings: [['component']],
  head: () => pageHead('Discord channels'),
  component: DiscordDashboard,
});

const utcDateTime = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

type CursorEvent = { type: 'previous' } | { type: 'next'; cursor: string };

function cursorReducer(cursors: (string | null)[], event: CursorEvent) {
  return event.type === 'previous' ? cursors.slice(0, -1) : [...cursors, event.cursor];
}

function DiscordDashboard() {
  const [cursors, dispatchCursor] = useReducer(cursorReducer, [null]);
  const result = useDiscordAdminPage({ cursor: cursors.at(-1) ?? null, numItems: 25 });
  const enabled = useSetDiscordEnabled();
  const deleteChannel = useDeleteDiscordChannel();
  const refresh = useRefreshDiscordOrphans();
  const deleteOrphan = useDeleteDiscordOrphan();

  if (result === undefined) {
    return (
      <AdminPageLoading size="compact" title="Discord channels">
        Loading Discord channels.
      </AdminPageLoading>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header size="compact" align="start">
        <PageTitle
          breadcrumb={<Breadcrumb to="/admin">Admin tools</Breadcrumb>}
          title="Discord channels"
          lede="Manage game voice channels and inspect untracked channels."
        />
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="lg">
          <Surface padding="lg">
            <Stack gap="sm">
              <ControlBlock
                title="Discord integration"
                input={(field) => (
                  <Switch
                    {...field}
                    checked={result.enabled}
                    disabled={!result.configured || enabled.isPending}
                    onChange={(event) => enabled.mutate({ enabled: event.currentTarget.checked })}
                  />
                )}
              />
              <Text size="sm" c="dimmed">
                Turning this off pauses channel creation, pings and cleanup. Existing channels remain available.
              </Text>
              {!result.configured && (
                <Text size="sm" c="dimmed">
                  Discord is not configured for this deployment.
                </Text>
              )}
            </Stack>
            <ActionError subject="Discord integration" verb="update" error={enabled.error} />
          </Surface>
          <Surface padding="lg">
            <Section title="Tracked channels">
              <Text size="sm" c="dimmed">
                Game invites are shared. Individual Discord access is not tracked.
              </Text>
              <Table.ScrollContainer minWidth={800}>
                <Table verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Game</Table.Th>
                      <Table.Th>Channel</Table.Th>
                      <Table.Th>State</Table.Th>
                      <Table.Th>Created</Table.Th>
                      <Table.Th>Cleanup due</Table.Th>
                      <Table.Th>Last error</Table.Th>
                      <Table.Th>Action</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {result.channels.page.map((channel) => (
                      <Table.Tr key={channel._id}>
                        <Table.Td>
                          {channel.gameSlug ? (
                            <Anchor
                              renderRoot={(props) => (
                                <Link {...props} to="/play/$gameId" params={{ gameId: channel.gameSlug! }} />
                              )}
                            >
                              {channel.gameName ?? channel.gameSlug}
                            </Anchor>
                          ) : (
                            <Code>{channel.game_id}</Code>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {channel.channel_id ? (
                            <Anchor
                              href={`https://discord.com/channels/${channel.guild_id}/${channel.channel_id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {channel.channel_id}
                            </Anchor>
                          ) : channel.state === 'creating' ? (
                            'Creation unconfirmed'
                          ) : (
                            'Not created'
                          )}
                          <Text size="xs" c="dimmed">
                            Guild {channel.guild_id}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <StatusBadge>{channel.state}</StatusBadge>
                        </Table.Td>
                        <Table.Td>{utcDateTime.format(channel.created_at)}</Table.Td>
                        <Table.Td>{utcDateTime.format(channel.cleanup_at)}</Table.Td>
                        <Table.Td>
                          <Text size="sm">{channel.error ?? 'None'}</Text>
                        </Table.Td>
                        <Table.Td>
                          <HoldAction
                            label={`Delete channel for ${channel.gameName ?? channel.gameSlug ?? channel.game_id}`}
                            disabledReason={
                              channel.state === 'deleted'
                                ? 'This channel has already been removed.'
                                : channel.state === 'deleting'
                                  ? 'Channel removal is in progress.'
                                  : channel.state === 'creating' && !channel.channel_id
                                    ? 'Creation is unconfirmed. Check Discord first.'
                                    : !result.enabled
                                      ? 'Discord integration is disabled.'
                                      : undefined
                            }
                            pending={deleteChannel.isPending}
                            onConfirm={() => deleteChannel.mutate({ channelId: channel._id })}
                          />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                    {result.channels.page.length === 0 && (
                      <Table.Tr>
                        <Table.Td colSpan={7}>
                          <EmptyNote>No tracked channels on this page.</EmptyNote>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              <ActionError subject="channel" verb="delete" error={deleteChannel.error} />
              <Group justify="center" aria-label="Channel pages">
                <LabeledAction
                  icon={<ChevronLeft size={16} />}
                  disabledReason={cursors.length === 1 ? 'This is the first page.' : undefined}
                  onClick={() => dispatchCursor({ type: 'previous' })}
                >
                  Previous
                </LabeledAction>
                <Text size="sm">Page {cursors.length}</Text>
                <LabeledAction
                  icon={<ChevronRight size={16} />}
                  disabledReason={result.channels.isDone ? 'This is the last page.' : undefined}
                  onClick={() => dispatchCursor({ type: 'next', cursor: result.channels.continueCursor })}
                >
                  Next
                </LabeledAction>
              </Group>
            </Section>
          </Surface>
          <Surface padding="lg">
            <Section title="Recent nudge delivery issues">
              {result.nudgeErrors.length === 0 ? (
                <EmptyNote>No recent delivery issues.</EmptyNote>
              ) : (
                <Table.ScrollContainer minWidth={700}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Time</Table.Th>
                        <Table.Th>Game</Table.Th>
                        <Table.Th>Seat</Table.Th>
                        <Table.Th>State</Table.Th>
                        <Table.Th>Error</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {result.nudgeErrors.map((failure, index) => (
                        <Table.Tr key={`${failure.at}-${index}`}>
                          <Table.Td>{utcDateTime.format(failure.at)}</Table.Td>
                          <Table.Td>
                            {failure.gameSlug ? (
                              <Anchor
                                renderRoot={(props) => (
                                  <Link {...props} to="/play/$gameId" params={{ gameId: failure.gameSlug! }} />
                                )}
                              >
                                {failure.gameName ?? failure.gameSlug}
                              </Anchor>
                            ) : (
                              <Code>{failure.game_id}</Code>
                            )}
                          </Table.Td>
                          <Table.Td>{failure.toSeat}</Table.Td>
                          <Table.Td>{failure.state === 'sending' ? 'Sending (unconfirmed)' : failure.state}</Table.Td>
                          <Table.Td>{failure.error ?? 'None'}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Section>
          </Surface>
          <Surface padding="lg">
            <Section
              title="Untracked channels"
              action={
                <LabeledAction
                  icon={<RefreshCw size={16} />}
                  disabledReason={!result.configured ? 'Discord is not configured.' : undefined}
                  busy={refresh.isPending}
                  onClick={() => refresh.mutate(undefined)}
                >
                  Refresh
                </LabeledAction>
              }
            >
              <Text size="sm" c="dimmed">
                Refresh checks voice channels in the configured game categories and shows up to 100 untracked channels.
                Recently created channels are omitted while creation may still be in progress. These channels are never
                removed automatically. Check each channel before deleting it.
              </Text>
              <ActionError subject="untracked channels" verb="update" error={refresh.error} />
              <ActionError subject="untracked channel" verb="delete" error={deleteOrphan.error} />
              {refresh.data && (
                <Table.ScrollContainer minWidth={600}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Channel ID</Table.Th>
                        <Table.Th>Category ID</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Action</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {refresh.data.map((channel) => (
                        <Table.Tr key={channel.id}>
                          <Table.Td>{channel.name}</Table.Td>
                          <Table.Td>
                            <Anchor
                              href={`https://discord.com/channels/${channel.guild_id}/${channel.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {channel.id}
                            </Anchor>
                          </Table.Td>
                          <Table.Td>
                            <Code>{channel.parent_id}</Code>
                          </Table.Td>
                          <Table.Td>Untracked</Table.Td>
                          <Table.Td>
                            <HoldAction
                              label={`Delete untracked channel ${channel.name}`}
                              disabledReason={!result.enabled ? 'Discord integration is disabled.' : undefined}
                              pending={deleteOrphan.isPending}
                              onConfirm={() =>
                                deleteOrphan.mutate(
                                  { channelId: channel.id },
                                  { onSuccess: () => refresh.mutate(undefined) }
                                )
                              }
                            />
                          </Table.Td>
                        </Table.Tr>
                      ))}
                      {refresh.data.length === 0 && (
                        <Table.Tr>
                          <Table.Td colSpan={5}>
                            <EmptyNote>No untracked voice channels found.</EmptyNote>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Section>
          </Surface>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
