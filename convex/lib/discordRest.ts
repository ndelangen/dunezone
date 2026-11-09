import { z } from 'zod';

const snowflake = z.string().regex(/^\d+$/);
const channel = z.object({ id: snowflake, type: z.number(), parent_id: snowflake.nullish() });
const errorBody = z.object({ code: z.number().optional(), retry_after: z.number().optional() });

export const DISCORD_PLAYER_PERMISSIONS = '3214336';
/* Manage Roles comes from the guild role; Discord only lets administrators put it in a channel overwrite. */
export const DISCORD_BOT_PERMISSIONS = '3214353';
export const DISCORD_PRIVATE_PERMISSIONS = '1049600';

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

export function discordConfiguration() {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const categoryIds = process.env.DISCORD_GAMES_CATEGORY_IDS?.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return token &&
    guildId &&
    snowflake.safeParse(guildId).success &&
    categoryIds?.length &&
    categoryIds.every((id) => snowflake.safeParse(id).success)
    ? { token, guildId, categoryIds: [...new Set(categoryIds)] }
    : null;
}

/** Discord REST is called only by the internal Play action; writes carry an audit reason. */
export class DiscordRest {
  constructor(
    private readonly token: string,
    private readonly reason: string,
    private readonly cooldown: { until: () => Promise<number>; hold: (until: number) => Promise<unknown> }
  ) {}

  async request(method: string, path: string, body?: unknown): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      if (!discordConfiguration()) {
        throw new DiscordFailure(0, undefined);
      }
      const blocked = (await this.cooldown.until()) - Date.now();
      if (blocked > 0) {
        throw new DiscordFailure(429, undefined, blocked);
      }
      let response: Response;
      try {
        response = await fetch(`https://discord.com/api/v10${path}`, {
          method,
          headers: {
            Authorization: `Bot ${this.token}`,
            'Content-Type': 'application/json',
            ...(method === 'GET' ? {} : { 'X-Audit-Log-Reason': encodeURIComponent(this.reason) }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new DiscordFailure(0, undefined);
      }
      let data: unknown = null;
      try {
        if (response.status !== 204) {
          data = await response.json();
        }
      } catch {
        if (response.ok) {
          throw new DiscordFailure(0, undefined);
        }
      }
      if (response.ok) {
        return data;
      }
      const parsed = errorBody.safeParse(data);
      const headerDelay = Number(response.headers.get('Retry-After'));
      const seconds = Math.max(
        parsed.success ? (parsed.data.retry_after ?? 0) : 0,
        Number.isFinite(headerDelay) ? headerDelay : 0
      );
      const delay = Math.max(1000, seconds * 1000);
      if (response.status === 429) {
        await this.cooldown.hold(Date.now() + delay);
      }
      if (response.status === 429 && attempt < 2 && delay <= 5000) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new DiscordFailure(
        response.status,
        parsed.success ? parsed.data.code : undefined,
        response.status === 429 ? delay : 0
      );
    }
  }

  async botId() {
    return z.object({ id: snowflake }).parse(await this.request('GET', '/users/@me')).id;
  }

  async categories(guildId: string, categoryIds: string[]) {
    const channels = z.array(channel).parse(await this.request('GET', `/guilds/${guildId}/channels`));
    return categoryIds.filter(
      (id) =>
        channels.some((entry) => entry.id === id && entry.type === 4) &&
        channels.filter((entry) => entry.parent_id === id).length < 50
    );
  }

  async create(guildId: string, categoryId: string, name: string, botId: string) {
    return channel.parse(
      await this.request('POST', `/guilds/${guildId}/channels`, {
        name,
        type: 2,
        parent_id: categoryId,
        permission_overwrites: [
          { id: guildId, type: 0, allow: '0', deny: DISCORD_PRIVATE_PERMISSIONS },
          { id: botId, type: 1, allow: DISCORD_BOT_PERMISSIONS, deny: '0' },
        ],
      })
    ).id;
  }

  async member(guildId: string, userId: string) {
    try {
      await this.request('GET', `/guilds/${guildId}/members/${userId}`);
      return true;
    } catch (error) {
      if (error instanceof DiscordFailure && error.status === 404 && error.code === 10_007) {
        return false;
      }
      throw error;
    }
  }

  async grant(channelId: string, userId: string) {
    await this.request('PUT', `/channels/${channelId}/permissions/${userId}`, {
      type: 1,
      allow: DISCORD_PLAYER_PERMISSIONS,
      deny: '0',
    });
  }

  async revoke(channelId: string, userId: string) {
    try {
      await this.request('DELETE', `/channels/${channelId}/permissions/${userId}`);
    } catch (error) {
      if (
        !(error instanceof DiscordFailure && error.status === 404 && (error.code === 10_003 || error.code === 10_009))
      ) {
        throw error;
      }
    }
  }

  async invite(channelId: string) {
    const result = z
      .object({ code: z.string().regex(/^[A-Za-z0-9-]+$/) })
      .parse(
        await this.request('POST', `/channels/${channelId}/invites`, { max_uses: 1, max_age: 3600, unique: true })
      );
    return `https://discord.gg/${result.code}`;
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
