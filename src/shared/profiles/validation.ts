import { z } from 'zod';

/** Lowercase [a-z0-9] only; matches DB slugify base (no numeric uniqueness suffix). */
export function profileSlugBaseFromName(name: string): string {
  const raw = name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
  if (raw.length === 0) {
    throw new Error('Failed to generate slug from display name');
  }
  return raw;
}

function isAllCapsShouting(s: string): boolean {
  const letters = s.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) {
    return false;
  }
  return letters === letters.toUpperCase();
}

const profileDisplayNameSchema = z
  .string()
  .trim()
  .min(1, 'Display name is required')
  .min(5, 'Display name must be at least 5 characters')
  .max(30, 'Display name must be at most 30 characters')
  .regex(/^[A-Za-z0-9]+$/, 'Display name may only contain letters and numbers')
  .refine((val) => !isAllCapsShouting(val), {
    message: 'Display name cannot be all capitals',
  });

const profileAvatarUrlSchema = z
  .string()
  .trim()
  .min(1, 'Avatar URL is required')
  .superRefine((val, ctx) => {
    try {
      const u = new URL(val);
      if (u.protocol !== 'https:') {
        ctx.addIssue({
          code: 'custom',
          message: 'Avatar must use https://',
        });
      }
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'Avatar must be a full https:// URL',
      });
    }
  });

const boardGameGeekProfileUrlSchema = z
  .string()
  .trim()
  .max(500, 'BoardGameGeek profile URL must be at most 500 characters')
  .transform((value, ctx) => {
    if (!value) {
      return '';
    }
    try {
      const url = new URL(value);
      const match = /^\/user\/([^/]+)\/?$/.exec(url.pathname);
      const username = match ? decodeURIComponent(match[1]!) : '';
      if (
        url.protocol !== 'https:' ||
        !['boardgamegeek.com', 'www.boardgamegeek.com'].includes(url.hostname) ||
        url.port ||
        url.username ||
        url.password ||
        !username.trim() ||
        username.length > 100 ||
        username === '.' ||
        username === '..' ||
        /[/?#\p{Cc}]/u.test(username)
      ) {
        throw new Error('Invalid profile URL');
      }
      return `https://boardgamegeek.com/user/${encodeURIComponent(username)}`;
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a BoardGameGeek profile URL such as https://boardgamegeek.com/user/yourname',
      });
      return z.NEVER;
    }
  });

export const profileUserEditFormSchema = z.strictObject({
  username: profileDisplayNameSchema,
  avatar_url: profileAvatarUrlSchema,
  default_group_id: z.string().nullable().optional(),
  bgg_profile_url: boardGameGeekProfileUrlSchema.optional(),
});

export type ProfileUserEditInput = z.infer<typeof profileUserEditFormSchema>;
