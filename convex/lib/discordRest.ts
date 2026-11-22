import { z } from 'zod';

const snowflake = z.string().regex(/^\d+$/);
const channel = z.object({ id: snowflake, type: z.number(), parent_id: snowflake.nullish() });
const listedChannel = channel.extend({ name: z.string().max(100), guild_id: snowflake.optional() });
const errorBody = z.object({
  code: z.number().optional(),
  retry_after: z.number().optional(),
  global: z.boolean().optional(),
});
const configuration = z.object({
  token: z.string().trim().min(1),
  guildId: z.string().trim().pipe(snowflake),
  categoryIds: z.array(snowflake).min(1),
});

export const DISCORD_ROUTES = [
  'guildChannels.read',
  'guildChannels.create',
  'channel.read',
  'channel.rename',
  'channel.delete',
  'channelInvite.create',
  'channelMessage.create',
  'gatewayBot.read',
] as const;
export type DiscordRoute = (typeof DISCORD_ROUTES)[number];
export type DiscordRequestScope = { route: DiscordRoute; major: string };
export type DiscordRateLimitObservation = DiscordRequestScope & {
  bucketId?: string;
  limit?: { until: number; global: boolean };
};
export type DiscordRequestGate = {
  inspect: (scope: DiscordRequestScope) => Promise<{
    blockedUntil: number;
    globalUntil: number;
    bucketId?: string;
  } | null>;
  observe: (observation: DiscordRateLimitObservation) => Promise<unknown>;
};

const requestRoutes: Record<
  DiscordRoute,
  { method: string; path: RegExp; major: 'guild' | 'channel' } | { method: string; path: string; major: 'none' }
> = {
  'guildChannels.read': { method: 'GET', path: /^\/guilds\/(\d+)\/channels$/, major: 'guild' },
  'guildChannels.create': { method: 'POST', path: /^\/guilds\/(\d+)\/channels$/, major: 'guild' },
  'channel.read': { method: 'GET', path: /^\/channels\/(\d+)$/, major: 'channel' },
  'channel.rename': { method: 'PATCH', path: /^\/channels\/(\d+)$/, major: 'channel' },
  'channel.delete': { method: 'DELETE', path: /^\/channels\/(\d+)$/, major: 'channel' },
  'channelInvite.create': { method: 'POST', path: /^\/channels\/(\d+)\/invites$/, major: 'channel' },
  'channelMessage.create': { method: 'POST', path: /^\/channels\/(\d+)\/messages$/, major: 'channel' },
  'gatewayBot.read': { method: 'GET', path: '/gateway/bot', major: 'none' },
};

function matchRequestScope(route: DiscordRoute, method: string, path: string): DiscordRequestScope | null {
  const candidate = requestRoutes[route];
  if (candidate.method !== method) {
    return null;
  }
  if (typeof candidate.path === 'string') {
    return candidate.path === path ? { route, major: candidate.major } : null;
  }
  const match = candidate.path.exec(path);
  if (!match) {
    return null;
  }
  return { route, major: `${candidate.major}:${match[1]}` };
}

/** Only the eight endpoints this integration uses can acquire persisted route aliases. */
function requestScope(method: string, path: string): DiscordRequestScope {
  for (const route of DISCORD_ROUTES) {
    const scope = matchRequestScope(route, method, path);
    if (scope) {
      return scope;
    }
  }
  throw new Error('Unsupported Discord request route.');
}

export function discordRouteHoldKey(scope: DiscordRequestScope) {
  return JSON.stringify(['route', scope.route, scope.major]);
}

export function discordBucketHoldKey(bucketId: string, major: string) {
  return JSON.stringify(['bucket', bucketId, major]);
}

/** A sanitized failure: neither Discord's response body nor credentials enter logs or stored diagnostics. */
export class DiscordFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: number | undefined,
    readonly retryAfterMs = 0,
    readonly global = false,
    readonly retryAt?: number
  ) {
    super(status === 0 ? 'Discord did not return a confirmed response.' : `Discord request failed (${status}).`);
  }
}

export class DiscordPaused extends Error {
  constructor() {
    super('Discord integration is disabled.');
  }
}

export function discordConfiguration() {
  const categoryIds = process.env.DISCORD_GAMES_CATEGORY_IDS?.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const parsed = configuration.safeParse({
    token: process.env.DISCORD_BOT_TOKEN,
    guildId: process.env.DISCORD_GUILD_ID,
    categoryIds,
  });
  return parsed.success ? { ...parsed.data, categoryIds: [...new Set(parsed.data.categoryIds)] } : null;
}

async function responseData(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    if (response.ok) {
      throw new DiscordFailure(0, undefined);
    }
    return null;
  }
}

function responseFailure(response: Response, data: unknown, receivedAt: number) {
  const parsed = errorBody.safeParse(data);
  const headerDelay = Number(response.headers.get('Retry-After'));
  const seconds = Math.max(
    parsed.success ? (parsed.data.retry_after ?? 0) : 0,
    Number.isFinite(headerDelay) ? headerDelay : 0
  );
  const retryAt = response.status === 429 ? receivedAt + Math.max(1000, Math.ceil(seconds * 1000)) : undefined;
  return new DiscordFailure(
    response.status,
    parsed.success ? parsed.data.code : undefined,
    retryAt === undefined ? 0 : Math.max(0, retryAt - Date.now()),
    response.status === 429 &&
      (response.headers.get('X-RateLimit-Global') === 'true' ||
        response.headers.get('X-RateLimit-Scope') === 'global' ||
        (parsed.success && parsed.data.global === true)),
    retryAt
  );
}

/** Discord actions share one persisted request gate; writes carry an audit reason. */
export class DiscordRest {
  private sentRequests = 0;

  get requestsMade() {
    return this.sentRequests;
  }

  constructor(
    private readonly token: string,
    private readonly reason: string,
    private readonly cooldown: DiscordRequestGate,
    private readonly deadline?: number
  ) {}

  private async fetchResponse(method: string, path: string, body: unknown) {
    try {
      const timeout = Math.min(15_000, this.deadline === undefined ? 15_000 : this.deadline - Date.now());
      if (timeout <= 0) {
        throw new DiscordFailure(0, undefined);
      }
      this.sentRequests += 1;
      return await fetch(`https://discord.com/api/v10${path}`, {
        method,
        headers: {
          Authorization: `Bot ${this.token}`,
          'Content-Type': 'application/json',
          ...(method === 'GET' ? {} : { 'X-Audit-Log-Reason': encodeURIComponent(this.reason) }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(Math.ceil(timeout)),
      });
    } catch {
      throw new DiscordFailure(0, undefined);
    }
  }

  async request(method: string, path: string, body?: unknown): Promise<unknown> {
    if (!discordConfiguration()) {
      throw new DiscordFailure(0, undefined);
    }
    const scope = requestScope(method, path);
    const gate = await this.cooldown.inspect(scope);
    if (gate === null) {
      throw new DiscordPaused();
    }
    const blocked = gate.blockedUntil - Date.now();
    if (blocked > 0) {
      throw new DiscordFailure(429, undefined, blocked, gate.globalUntil > Date.now(), gate.blockedUntil);
    }
    const response = await this.fetchResponse(method, path, body);
    const receivedAt = Date.now();
    const data = await responseData(response);
    const headerBucket = response.headers.get('X-RateLimit-Bucket')?.trim();
    const bucketId = headerBucket && headerBucket.length <= 256 ? headerBucket : undefined;
    if (response.ok) {
      if (bucketId && bucketId !== gate.bucketId) {
        await this.cooldown.observe({ ...scope, bucketId });
      }
      return data;
    }
    const failure = responseFailure(response, data, receivedAt);
    if (response.status === 429) {
      await this.cooldown.observe({
        ...scope,
        ...(bucketId ? { bucketId } : {}),
        limit: { until: failure.retryAt!, global: failure.global },
      });
    }
    throw failure;
  }

  /** Recovery needs the full visible list, including category names and exact channel markers. */
  async listChannels(guildId: string) {
    const channels = z
      .array(listedChannel)
      .max(500)
      .parse(await this.request('GET', `/guilds/${guildId}/channels`));
    if (channels.some((entry) => entry.guild_id !== undefined && entry.guild_id !== guildId)) {
      throw new Error('Discord returned channels from a different server.');
    }
    return channels;
  }

  async categories(guildId: string, categoryIds: string[]) {
    const channels = z.array(channel).parse(await this.request('GET', `/guilds/${guildId}/channels`));
    return categoryIds.filter(
      (id) =>
        channels.some((entry) => entry.id === id && entry.type === 4) &&
        channels.filter((entry) => entry.parent_id === id).length < 50
    );
  }

  async create(guildId: string, categoryId: string, name: string) {
    return channel.parse(
      await this.request('POST', `/guilds/${guildId}/channels`, {
        name,
        type: 2,
        parent_id: categoryId,
      })
    ).id;
  }

  async invite(channelId: string) {
    const result = z
      .object({ code: z.string().regex(/^[A-Za-z0-9-]+$/) })
      .parse(await this.request('POST', `/channels/${channelId}/invites`, { max_uses: 0, max_age: 0, unique: false }));
    return `https://discord.gg/${result.code}`;
  }

  async rename(channelId: string, name: string) {
    await this.request('PATCH', `/channels/${channelId}`, { name });
  }

  /** One best-effort POST, with only the intended recipient allowed to be mentioned. */
  async nudge(channelId: string, userId: string, fromFactionName: string, gameName: string) {
    const plain = (value: string) => value.replace(/\s+/g, ' ').replace(/[\\`*_~|<>[\]]/g, '\\$&');
    const result = await this.request('POST', `/channels/${channelId}/messages`, {
      content: `<@${userId}> ${plain(fromFactionName)} is waiting on you in ${plain(gameName)}.`,
      allowed_mentions: { parse: [], users: [userId], replied_user: false },
    });
    const parsed = z.object({ id: snowflake }).safeParse(result);
    if (!parsed.success) {
      throw new DiscordFailure(0, undefined);
    }
    return parsed.data.id;
  }

  async remove(channelId: string) {
    try {
      await this.request('DELETE', `/channels/${channelId}`);
    } catch (error) {
      if (!(error instanceof DiscordFailure && error.status === 404 && error.code === 10_003)) {
        throw error;
      }
    }
  }
}
