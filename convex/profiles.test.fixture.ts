import type { Doc } from './_generated/dataModel';

/* Profile saves in other domain suites echo a settled avatar instead of starting an unrelated image-storage job. */
export const storedProfileAvatar = {
  avatar_url: `https://dune.zone/user-images/${'a'.repeat(64)}.jpg`,
  avatar: {
    url: `https://dune.zone/user-images/${'a'.repeat(64)}.jpg`,
    source_url: 'https://images.example/avatar.png',
    width: 320,
    height: 320,
  },
} satisfies Pick<Doc<'profiles'>, 'avatar_url' | 'avatar'>;
