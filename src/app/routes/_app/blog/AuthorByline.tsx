import { useProfileLink } from '@db/profiles';
import { BlogByline } from '@app/widgets/blog-byline/BlogByline';

type AuthorBylineProps = {
  date: string;
  author: { name: string; profileSlug?: string };
  tone?: 'accent' | 'inverse';
};

/**
 * A post's byline with its author's avatar.
 * The blog renders on the server without a query, so the avatar arrives once the browser's subscription answers;
 * until then, and for an author with no public profile, the byline shows initials or the written name.
 */
export function AuthorByline({ date, author, tone }: AuthorBylineProps) {
  return author.profileSlug ? (
    <LinkedAuthorByline date={date} author={author} profileSlug={author.profileSlug} tone={tone} />
  ) : (
    <BlogByline date={date} author={author} tone={tone} />
  );
}

/* Mounted only for a linked author, so the subscription always has a real slug to ask about. */
function LinkedAuthorByline({ date, author, profileSlug, tone }: AuthorBylineProps & { profileSlug: string }) {
  const profile = useProfileLink(profileSlug);
  return <BlogByline date={date} author={{ ...author, image: profile?.image }} tone={tone} />;
}
