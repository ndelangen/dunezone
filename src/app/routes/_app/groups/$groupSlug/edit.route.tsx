import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { PageState } from '@ui/block/PageState';
import { SlugRenameNotice } from '@ui/content/SlugRenameNotice';

import { loadGroupEditBySlug, useGroupEditBySlug, useUpdateGroup } from '@db/groups';
import type { GroupEntry } from '@db/groups';
import { pageHead } from '@app/routes/pageTitle';
import { RouteLoadError, RouteNotFound } from '@app/routes/routeStates';
import { LoginGate } from '@app/widgets/page-message/LoginGate';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { RoutePending } from '@app/widgets/page-message/RoutePending';

import { GroupForm } from '../GroupForm';

/** The edit page for one group, mounted with `key={group.slug}` so a rename remounts it and resets the field. */
function GroupEditor({ initial }: { initial: GroupEntry }) {
  const navigate = useNavigate();
  const updateGroup = useUpdateGroup();
  return (
    <GroupForm
      initialName={initial.name}
      back={{
        label: 'Back to group',
        renderRoot: (rootProps) => <Link {...rootProps} to="/groups/$groupSlug" params={{ groupSlug: initial.slug }} />,
      }}
      description={<SlugRenameNotice noun="group" url={`…/groups/${initial.slug}`} />}
      verb="save"
      pending={updateGroup.isPending}
      error={updateGroup.error}
      onSubmit={(input) =>
        updateGroup.mutate(
          { id: initial.id, input },
          {
            onSuccess: (entry) => {
              if (initial.slug !== entry.slug) {
                void navigate({ to: '/groups/$groupSlug/edit', params: { groupSlug: entry.slug }, replace: true });
              }
            },
          }
        )
      }
    />
  );
}

export const Route = createFileRoute('/_app/groups/$groupSlug/edit')({
  loader: async ({ params }) => {
    const groupEdit = await loadGroupEditBySlug(params.groupSlug);
    return { groupEdit };
  },
  errorComponent: GroupEditError,
  head: ({ loaderData }) => pageHead(loaderData ? `Edit ${loaderData.groupEdit.group.name}` : 'Edit group'),
  component: GroupEditPage,
});

/**
 * The frame for a load that failed, which on this route is most often a slug that names no group: the query throws rather than returning nothing, so the component's own absent branch never runs.
 * Without this the reader met the router's unstyled default and, in development, a stack trace.
 */
function GroupEditError({ error }: ErrorComponentProps) {
  return (
    <RouteLoadError
      title="Edit group"
      back={<PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>}
      what="Group could not be loaded"
      error={error}
    />
  );
}

function GroupEditPage() {
  const { groupSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const groupData = useGroupEditBySlug(groupSlug, { initialData: loaderData.groupEdit });

  const editPage = groupData.data;
  if (!editPage) {
    return (
      <RouteNotFound
        title="Edit group"
        back={<PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>}
        noun="group"
      />
    );
  }

  const group = editPage.group;
  const viewerAccess = editPage.viewerAccess;

  /* Back to the group rather than to profiles, which is the more useful of the two destinations the
     toolbar carried: a reader who cannot edit this group can still read it. */
  const guardBack = (
    <PageMessage.Back to="/groups/$groupSlug" params={{ groupSlug: group.slug }}>
      Back to group
    </PageMessage.Back>
  );

  if (!editPage.viewerResolved) {
    return (
      <RoutePending title={`Edit ${group.name}`} back={guardBack} loading="Loading your profile">
        Checking what you may change here.
      </RoutePending>
    );
  }

  if (viewerAccess.viewer.kind === 'anonymous') {
    return (
      <PageMessage title={`Edit ${group.name}`} back={guardBack}>
        <LoginGate action="edit group settings" />
      </PageMessage>
    );
  }

  if (!viewerAccess.capabilities.rename) {
    return (
      <PageMessage title={`Edit ${group.name}`} back={guardBack}>
        <PageState kind="absent" title="You cannot edit this group">
          Only the owner can edit the group settings.
        </PageState>
      </PageMessage>
    );
  }

  return <GroupEditor key={group.slug} initial={group} />;
}
