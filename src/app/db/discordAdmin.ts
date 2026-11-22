import { useAction, useQuery } from 'convex/react';
import { useCallback } from 'react';

import { useLiveMutation, useLiveOperation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

export function useDiscordAdminPage(paginationOpts: { cursor: string | null; numItems: number }) {
  return useQuery(api.playDiscordAdmin.dashboard, { paginationOpts });
}

export function useSetDiscordEnabled() {
  return useLiveMutation<{ enabled: boolean }, null>(api.playDiscordAdmin.setEnabled);
}

export function useDeleteDiscordChannel() {
  return useLiveMutation<{ channelId: Id<'play_game_discord_channels'> }, null>(api.playDiscordAdmin.requestDelete);
}

export function useRetryDiscordChannel() {
  return useLiveMutation<{ channelId: Id<'play_game_discord_channels'> }, null>(api.playDiscordAdmin.requestRetry);
}

export function useRefreshDiscordOrphans() {
  const action = useAction(api.playDiscordAdmin.refreshOrphans);
  return useLiveOperation(useCallback(async () => await action({}), [action]));
}

export function useDeleteDiscordOrphan() {
  const action = useAction(api.playDiscordAdmin.deleteOrphan);
  return useLiveOperation(useCallback(async (args: { channelId: string }) => await action(args), [action]));
}
