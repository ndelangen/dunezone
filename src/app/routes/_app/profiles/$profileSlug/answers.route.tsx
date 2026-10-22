import { parseProfileActivitySearch } from '@shared/profiles/catalogueSearch';
import { createFileRoute } from '@tanstack/react-router';
import type { NotFoundRouteProps } from '@tanstack/react-router';
import { ProfileAnswerList } from '@ui/list/ProfileAnswerList';

import { loadProfileAnswersPage, useProfileAnswersPage } from '@db/profiles';
import { useLivePageTitle } from '@app/routes/publicPage';
import { ProfileActivityNotFound, ProfileActivityPage } from '@app/widgets/profile-activity/ProfileActivityPage';
import type { ProfileActivityNotFoundData } from '@app/widgets/profile-activity/ProfileActivityPage';

import { loadProfileActivity, profileActivityDeps, profileActivityHead, profileActivityName } from './activity';

const TO = '/profiles/$profileSlug/answers';

export const Route = createFileRoute('/_app/profiles/$profileSlug/answers')({
  ssr: true,
  codeSplitGroupings: [['component', 'notFoundComponent']],
  validateSearch: parseProfileActivitySearch,
  loaderDeps: ({ search }) => profileActivityDeps(search),
  loader: ({ params, deps }) => loadProfileActivity(loadProfileAnswersPage, TO, params, deps),
  notFoundComponent: ProfileAnswersNotFound,
  head: ({ loaderData, params, match }) =>
    profileActivityHead({
      kind: 'Answers',
      noun: 'answers',
      path: 'answers',
      profile: loaderData?.profile,
      profileSlug: params.profileSlug,
      search: match.search,
      match,
    }),
  component: ProfileAnswersPage,
});

/** Every answer a member has given, a page at a time, newest first. */
function ProfileAnswersPage() {
  const { profileSlug } = Route.useParams();
  const deps = Route.useLoaderDeps();
  const loaderData = Route.useLoaderData();
  /* A live null is a profile deleted while open; the loaded page stays until the reader leaves. */
  const data = useProfileAnswersPage({ slug: profileSlug, ...deps }, { initialData: loaderData }).data ?? loaderData;
  useLivePageTitle(profileActivityName(data.profile.username, 'Answers', deps.page), 'Profile');
  return (
    <ProfileActivityPage
      title="Answers"
      noun="answers"
      to={TO}
      profile={data.profile}
      paging={{ ...data, rows: data.items.length }}
      emptyLabel="No FAQ answers yet."
    >
      <ProfileAnswerList items={data.items} viewedProfileId={data.profile.id} />
    </ProfileActivityPage>
  );
}

function ProfileAnswersNotFound({ data }: NotFoundRouteProps) {
  const { profileSlug } = Route.useParams();
  return (
    <ProfileActivityNotFound
      title="Answers"
      to={TO}
      noun="answers"
      profileSlug={profileSlug}
      data={data as ProfileActivityNotFoundData}
    />
  );
}
