/**
 * How this application writes dates.
 * Content and Lists render them;
 * routes reuse the same two functions so a timestamp reads the same wherever it appears.
 */

/** The words a relative date is written in; English unless the caller passes its language's (i18n spike). */
export type RelativeDateWords = Readonly<{
  justNow: string;
  minutesAgo: (minutes: number) => string;
  hoursAgo: (hours: number) => string;
  yesterday: string;
  daysAgo: (days: number) => string;
}>;

const ENGLISH: RelativeDateWords = {
  justNow: 'Just now',
  minutesAgo: (minutes) => `${minutes} min ago`,
  hoursAgo: (hours) => (hours === 1 ? '1 hour ago' : `${hours} hours ago`),
  yesterday: 'Yesterday',
  daysAgo: (days) => `${days} days ago`,
};

/** Short relative or calendar label for ISO timestamps (FAQ lists, profiles). */
export function formatRelativeDate(iso: string, words: RelativeDateWords = ENGLISH): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? words.justNow : words.minutesAgo(diffMins);
    }
    return words.hoursAgo(diffHours);
  }
  if (diffDays === 1) {
    return words.yesterday;
  }
  if (diffDays < 7) {
    return words.daysAgo(diffDays);
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/** A fixed calendar date, the same on every route, in every locale and in every time zone. */
export function formatStableDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return 'recently';
  }
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
