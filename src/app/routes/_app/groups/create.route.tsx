import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';

import { useCreateGroup } from '@db/groups';
import { useSessionViewer } from '@db/profiles';
import { pageHead } from '@app/routes/pageTitle';
import { GroupForm } from '@app/widgets/group-form/GroupForm';
import { LoginGate } from '@app/widgets/page-message/LoginGate';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { RoutePending } from '@app/widgets/page-message/RoutePending';

export const Route = createFileRoute('/_app/groups/create')({
  head: () => pageHead('Start group'),
  component: GroupCreatePage,
});

function GroupCreatePage() {
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const createGroup = useCreateGroup();

  switch (viewer.kind) {
    case 'pending':
      return (
        <RoutePending
          title="Start group"
          back={<PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>}
          loading="Loading your profile"
        >
          Checking whether you are signed in.
        </RoutePending>
      );
    case 'signed-out':
      return (
        <PageMessage title="Start group" back={<PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>}>
          <LoginGate action="start a group" />
        </PageMessage>
      );
    default:
      break;
  }

  const profileSlug = viewer.profile.slug;
  return (
    <GroupForm
      initialName=""
      /* Back to the profile Start group was pressed on, the same place the old Close went. */
      back={{
        label: 'Back to profile',
        renderRoot: (rootProps) => <Link {...rootProps} to="/profiles/$profileSlug" params={{ profileSlug }} />,
      }}
      verb="create"
      pending={createGroup.isPending}
      error={createGroup.error}
      onSubmit={(input) =>
        createGroup.mutate(
          { input },
          { onSuccess: () => void navigate({ to: '/profiles/$profileSlug', params: { profileSlug } }) }
        )
      }
    />
  );
}
