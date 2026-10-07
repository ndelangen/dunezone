import { z } from 'zod';

export const PLAY_GAME_NAME_MAX_LENGTH = 80;
export const PLAY_GAME_SLUG_BASE_MAX_LENGTH = 64;
export const PLAY_GAME_SLUG_MAX_LENGTH = 81;
export const PLAY_RESERVED_GAME_ADDRESSES = ['create', 'demo', 'hosted'] as const;

/** The same spelling rule applies to typed names, generated names and availability checks. */
export function normalizePlayGameSlug(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/['’ʼ]/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/\bgom-jabbar\b/g, 'gomjabbar')
    .replace(/^-+|-+$/g, '')
    .slice(0, PLAY_GAME_SLUG_BASE_MAX_LENGTH)
    .replace(/-+$/g, '');
}

/** Display wording stays independent of the allocated address and its numeric suffix. */
export const playGameNameSchema = z
  .string()
  .refine((value) => !/\p{C}/u.test(value), 'Game names cannot contain control or invisible characters.')
  .transform((value) => value.normalize('NFC').trim().replace(/\s+/gu, ' '))
  .refine(
    (value) => [...value].length > 0 && [...value].length <= PLAY_GAME_NAME_MAX_LENGTH,
    `Use between 1 and ${PLAY_GAME_NAME_MAX_LENGTH} characters for the game name.`
  )
  .refine((value) => normalizePlayGameSlug(value).length > 0, 'Include a Latin letter or a number in the game name.');
