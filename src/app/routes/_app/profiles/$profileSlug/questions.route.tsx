import { parseProfileActivitySearch } from '@shared/profiles/catalogueSearch';
import { createFileRoute } from '@tanstack/react-router';
import type { NotFoundRouteProps } from '@tanstack/react-router';
import { ProfileQuestionList } from '@ui/list/ProfileQuestionList';

import { loadProfileQuestionsPage, useProfileQuestionsPage } from '@db/profiles';
import { useLivePageTitle } from '@app/routes/publicPage';
import { ProfileActivityNotFound, ProfileActivityPage } from '@app/widgets/profile-activity/ProfileActivityPage';
import type { ProfileActivityNotFoundData } from '@app/widgets/profile-activity/ProfileActivityPage';

import { loadProfileActivity, profileActivityDeps, profileActivityHead, profileActivityName } from './activity';

const TO = '/profiles/$profileSlug/questions';

export const Route = createFileRoute('/_app/profiles/$profileSlug/questions')({
  ssr: true,
  codeSplitGroupings: [['component', 'notFoundComponent']],
  validateSearch: parseProfileActivitySearch,
  loaderDeps: ({ search }) => profileActivityDeps(search),
  loader: ({ params, deps }) => loadProfileActivity(loadProfileQuestionsPage, TO, params, deps),
  notFoundComponent: ProfileQuestionsNotFound,
  head: ({ loaderData, params, match }) =>
    profileActivityHead({
      kind: 'Questions',
      noun: 'questions',
      path: 'questions',
      profile: loaderData?.profile,
      profileSlug: params.profileSlug,
      search: match.search,
      match,
    }),
  component: ProfileQuestionsPage,
});

/** Every question a member has asked, a page at a time, newest first. */
function ProfileQuestionsPage() {
  const { profileSlug } = Route.useParams();
  const deps = Route.useLoaderDeps();
  const loaderData = Route.useLoaderData();
  /* A live null is a profile deleted while open; the loaded page stays until the reader leaves. */
  const data = useProfileQuestionsPage({ slug: profileSlug, ...deps }, { initialData: loaderData }).data ?? loaderData;
  useLivePageTitle(profileActivityName(data.profile.username, 'Questions', deps.page), 'Profile');
  return (
    <ProfileActivityPage
      title="Questions"
      noun="questions"
      to={TO}
      profile={data.profile}
      paging={{ ...data, rows: data.items.length }}
      emptyLabel="No questions asked yet."
    >
      <ProfileQuestionList items={data.items} />
    </ProfileActivityPage>
  );
}

function ProfileQuestionsNotFound({ data }: NotFoundRouteProps) {
  const { profileSlug } = Route.useParams();
  return (
    <ProfileActivityNotFound
      title="Questions"
      to={TO}
      noun="questions"
      profileSlug={profileSlug}
      data={data as ProfileActivityNotFoundData}
    />
  );
}
