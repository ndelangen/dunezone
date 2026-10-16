import { Group } from '@mantine/core';
import { formatStableDate } from '@ui/content/dates';
import { Eyebrow } from '@ui/content/Eyebrow';
import { ProfileLink } from '@ui/content/ProfileLink';

type BlogBylineProps = {
  date: string;
  /** `image` is the linked profile's avatar; without one the link shows the name's initials. */
  author: { name: string; profileSlug?: string; image?: string };
  tone?: 'accent' | 'inverse';
};

/** The blog list and article page hand over a date and author; this composes their shared byline. */
export function BlogByline({ date, author, tone = 'accent' }: BlogBylineProps) {
  return (
    <Group gap="xs">
      <Eyebrow tone={tone}>{formatStableDate(date)}</Eyebrow>
      {author.profileSlug ? (
        <ProfileLink
          slug={author.profileSlug}
          name={author.name}
          image={author.image}
          tone={tone === 'inverse' ? 'inverse' : 'default'}
        />
      ) : (
        <Eyebrow tone={tone}>{author.name}</Eyebrow>
      )}
    </Group>
  );
}
