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

export const profileDisplayNameSchema = z
  .string()
  .trim()
  .min(1, 'Display name is required')
  .min(5, 'Display name must be at least 5 characters')
  .max(30, 'Display name must be at most 30 characters')
  .regex(/^[A-Za-z0-9]+$/, 'Display name may only contain letters and numbers')
  .refine((val) => !isAllCapsShouting(val), {
    message: 'Display name cannot be all capitals',
  });

export const profileAvatarUrlSchema = z
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

export const profileUserEditFormSchema = z.strictObject({
  username: profileDisplayNameSchema,
  avatar_url: profileAvatarUrlSchema,
});

export type ProfileUserEditInput = z.infer<typeof profileUserEditFormSchema>;

/** Canonical profile semantic validation surface. */
export const profileValidationSchemas = {
  displayName: profileDisplayNameSchema,
  avatarUrl: profileAvatarUrlSchema,
  input: profileUserEditFormSchema,
} as const;
