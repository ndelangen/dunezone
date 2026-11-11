import { z } from 'zod';

const snowflake = z.string().regex(/^\d+$/);
const channel = z.object({ id: snowflake, type: z.number(), parent_id: snowflake.nullish() });
const errorBody = z.object({ code: z.number().optional(), retry_after: z.number().optional() });
const configuration = z.object({
  token: z.string().trim().min(1),
  guildId: z.string().trim().pipe(snowflake),
  categoryIds: z.array(snowflake).min(1),
});

/** A sanitized failure: neither Discord's response body nor credentials enter logs or stored diagnostics. */
export class DiscordFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: number | undefined,
    readonly retryAfterMs = 0
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

function responseFailure(response: Response, data: unknown) {
  const parsed = errorBody.safeParse(data);
  const headerDelay = Number(response.headers.get('Retry-After'));
  const seconds = Math.max(
    parsed.success ? (parsed.data.retry_after ?? 0) : 0,
    Number.isFinite(headerDelay) ? headerDelay : 0
  );
  const delay = Math.max(1000, seconds * 1000);
  return new DiscordFailure(
    response.status,
    parsed.success ? parsed.data.code : undefined,
    response.status === 429 ? delay : 0
  );
}

/** Discord REST is called only by the internal Play action; writes carry an audit reason. */
export class DiscordRest {
  constructor(
    private readonly token: string,
    private readonly reason: string,
    private readonly cooldown: { until: () => Promise<number | null>; hold: (until: number) => Promise<unknown> },
    private readonly deadline?: number
  ) {}

  private async fetchResponse(method: string, path: string, body: unknown) {
    try {
      const timeout = Math.min(15_000, this.deadline === undefined ? 15_000 : this.deadline - Date.now());
      if (timeout <= 0) {
        throw new DiscordFailure(0, undefined);
      }
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

  async request(method: string, path: string, body?: unknown, rateLimitRetries = 2): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      if (!discordConfiguration()) {
        throw new DiscordFailure(0, undefined);
      }
      const until = await this.cooldown.until();
      if (until === null) {
        throw new DiscordPaused();
      }
      const blocked = until - Date.now();
      if (blocked > 0) {
        throw new DiscordFailure(429, undefined, blocked);
      }
      const response = await this.fetchResponse(method, path, body);
      const data = await responseData(response);
      if (response.ok) {
        return data;
      }
      const failure = responseFailure(response, data);
      if (response.status === 429) {
        await this.cooldown.hold(Date.now() + failure.retryAfterMs);
      }
      if (response.status === 429 && attempt < rateLimitRetries && failure.retryAfterMs <= 5000) {
        await new Promise((resolve) => setTimeout(resolve, failure.retryAfterMs));
        continue;
      }
      throw failure;
    }
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

  /** The scheduler owns nudge retries so expiry and account linkage are checked before each POST. */
  async nudge(channelId: string, userId: string, fromFactionName: string, gameName: string, nonce: string) {
    const plain = (value: string) => value.replace(/\s+/g, ' ').replace(/[\\`*_~|<>[\]]/g, '\\$&');
    const result = await this.request(
      'POST',
      `/channels/${channelId}/messages`,
      {
        content: `<@${userId}> ${plain(fromFactionName)} is waiting on you in ${plain(gameName)}.`,
        allowed_mentions: { parse: [], users: [userId], replied_user: false },
        nonce,
        enforce_nonce: true,
      },
      0
    );
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
