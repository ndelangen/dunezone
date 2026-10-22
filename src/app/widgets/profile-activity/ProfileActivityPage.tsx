import { Button, Stack, Text, Title } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { PageIdentity } from '@ui/block/PageIdentity';
import { CataloguePager } from '@ui/control/CataloguePager';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { PageMessage } from '@app/widgets/page-message/PageMessage';

/** The two paged lists a profile has; each is its own route under the profile, and this frame serves both. */
export type ProfileActivityRoute = '/profiles/$profileSlug/answers' | '/profiles/$profileSlug/questions';

/** The pager's facts for the page shown, and how many rows it holds; a page past the end has none. */
export type ProfileActivityPaging = {
  total: number;
  complete: boolean;
  page: number;
  pageCount: number;
  pageSize: number;
  rows: number;
};

/** The address of one page of a list; the first page has no number. */
function pageSearch(page: number) {
  return page > 1 ? { page } : {};
}

export type ProfileActivityPageProps = {
  /** The list's name, as the band says it: "Answers", "Questions". */
  title: string;
  /** The list's rows, plural and lower case, as the pager counts them: "answers", "questions". */
  noun: string;
  /** Which of the two lists this is, so the pages link to themselves. */
  to: ProfileActivityRoute;
  /** Whose list it is: the way back and the band's breadcrumb. */
  profile: { slug: string; username: string | null };
  paging: ProfileActivityPaging;
  /** What to say when the member has none. */
  emptyLabel: string;
  /** The rows, as the kit list renders them. */
  children: ReactNode;
};

/**
 * One page of a member's answers or questions: the band naming the member, the way back to their profile, the rows and the pager.
 *
 * The two routes hand it their page and the list that renders the rows;
 * this owns the frame and the two states with no rows, a member with nothing and an address past the last page.
 */
export function ProfileActivityPage({
  title,
  noun,
  to,
  profile,
  paging,
  emptyLabel,
  children,
}: ProfileActivityPageProps) {
  const name = profile.username ?? 'Unknown';
  const params = { profileSlug: profile.slug };
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageIdentity
          title={title}
          breadcrumb={
            <PageIdentity.Breadcrumb to="/profiles/$profileSlug" params={params}>
              {name}
            </PageIdentity.Breadcrumb>
          }
        />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left label="Navigation">
            <IconAction
              label={`Back to ${name}`}
              emphasis="standard"
              intent="neutral"
              size="lg"
              icon={<ArrowLeft size={17} aria-hidden />}
              renderRoot={(rootProps) => <Link {...rootProps} to="/profiles/$profileSlug" params={params} />}
            />
          </Toolbar.Left>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <ProfileActivityBody to={to} profileSlug={profile.slug} noun={noun} paging={paging} emptyLabel={emptyLabel}>
          {children}
        </ProfileActivityBody>
      </PageLayout.Content>
    </PageLayout>
  );
}

/** The page's body: nothing to list, a page past the end, or the rows with their pager. */
function ProfileActivityBody({
  to,
  profileSlug,
  noun,
  paging,
  emptyLabel,
  children,
}: {
  to: ProfileActivityRoute;
  profileSlug: string;
  noun: string;
  paging: ProfileActivityPaging;
  emptyLabel: string;
  children: ReactNode;
}) {
  if (paging.total === 0) {
    return (
      <Surface padding="lg">
        <Text size="sm" c="dimmed">
          {emptyLabel}
        </Text>
      </Surface>
    );
  }
  if (paging.page > 1 && paging.rows === 0) {
    return (
      <Surface padding="xl">
        <PastTheEnd to={to} profileSlug={profileSlug} noun={noun} pageCount={paging.pageCount} />
      </Surface>
    );
  }
  return (
    <Stack gap="lg">
      {children}
      <CataloguePager
        page={paging.page}
        pageCount={paging.pageCount}
        pageSize={paging.pageSize}
        total={paging.total}
        complete={paging.complete}
        noun={noun}
        label={`${noun[0]!.toUpperCase()}${noun.slice(1)} pages`}
        pageLinkProps={(page) => ({ component: Link, to, params: { profileSlug }, search: pageSearch(page) })}
      />
    </Stack>
  );
}

/** A page past the end, from an old link or a list that shrank: say where the rows end and link there. */
function PastTheEnd({
  to,
  profileSlug,
  noun,
  pageCount,
}: {
  to: ProfileActivityRoute;
  profileSlug: string;
  noun: string;
  pageCount: number;
}) {
  return (
    <Stack gap="sm" align="center">
      <Title order={2}>No {noun} on this page</Title>
      <Text c="dimmed">
        {pageCount === 1 ? `These ${noun} fit on one page.` : `These ${noun} end on page ${pageCount}.`}
      </Text>
      <Button
        variant="default"
        renderRoot={(props) => <Link {...props} to={to} params={{ profileSlug }} search={pageSearch(pageCount)} />}
      >
        {pageCount === 1 ? `Go to the ${noun}` : `Go to page ${pageCount}`}
      </Button>
    </Stack>
  );
}

/** What the routes' not-found carries: where the rows end, when the address named a page past them. */
export type ProfileActivityNotFoundData = { pageCount?: number } | undefined;

/** An unknown profile, or a page past the end, which carries where the rows end. */
export function ProfileActivityNotFound({
  title,
  to,
  noun,
  profileSlug,
  data,
}: {
  title: string;
  to: ProfileActivityRoute;
  noun: string;
  profileSlug: string;
  data: ProfileActivityNotFoundData;
}) {
  if (data?.pageCount == null) {
    return (
      <PageMessage
        size="compact"
        title={title}
        back={<PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>}
      >
        <Text c="dimmed">This profile does not exist or was deleted.</Text>
      </PageMessage>
    );
  }
  return (
    <PageMessage
      size="compact"
      title={title}
      back={
        <PageMessage.Back to="/profiles/$profileSlug" params={{ profileSlug }}>
          Back to profile
        </PageMessage.Back>
      }
    >
      <PastTheEnd to={to} profileSlug={profileSlug} noun={noun} pageCount={data.pageCount} />
    </PageMessage>
  );
}
