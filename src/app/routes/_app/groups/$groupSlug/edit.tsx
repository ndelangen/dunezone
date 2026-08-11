import { ActionIcon, Group } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { FormTooltip } from '@ui/input/FormTooltip';
import { Surface } from '@ui/surface';
import { ArrowLeft, Users } from 'lucide-react';

import { loadGroupEditBySlug, useGroupEditBySlug } from '@db/groups';
import { GroupSettingsForm } from '@app/components/groups/GroupSettingsForm';
import { PageLayout } from '@app/components/shell';
import { Toolbar } from '@app/components/shell/Toolbar';

export const Route = createFileRoute('/_app/groups/$groupSlug/edit')({
  loader: async ({ params }) => {
    const groupEdit = await loadGroupEditBySlug(params.groupSlug);
    return { groupEdit };
  },
  component: GroupEditPage,
});

function GroupEditPage() {
  const { groupSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const groupData = useGroupEditBySlug(groupSlug, { initialData: loaderData.groupEdit });

  const editPage = groupData.data;
  if (groupData.isError || !editPage) {
    return (
      <PageLayout header={<h1>Edit group</h1>}>
        <Surface padding="lg">
          <p>Group not found.</p>
          <p>
            <Link to="/profiles">Back to profiles</Link>
          </p>
        </Surface>
      </PageLayout>
    );
  }

  const group = editPage.group;
  const viewerAccess = editPage.viewerAccess;
  const header = <h1>{`Edit ${group.name}`}</h1>;
  const toolbar = (
    <Toolbar>
      <Toolbar.Left>
        <Group gap="xs" wrap="nowrap">
          <FormTooltip content="Back to profiles">
            <ActionIcon
              variant="light"
              color="gray"
              size="lg"
              aria-label="Back to profiles"
              renderRoot={(rootProps) => <Link {...rootProps} to="/profiles" />}
            >
              <ArrowLeft size={16} aria-hidden />
            </ActionIcon>
          </FormTooltip>
          <FormTooltip content="View group">
            <ActionIcon
              variant="light"
              color="dune"
              size="lg"
              aria-label="View group"
              renderRoot={(rootProps) => (
                <Link {...rootProps} to="/groups/$groupSlug" params={{ groupSlug: group.slug }} />
              )}
            >
              <Users size={16} aria-hidden />
            </ActionIcon>
          </FormTooltip>
        </Group>
      </Toolbar.Left>
    </Toolbar>
  );

  if (viewerAccess.viewer.kind === 'anonymous') {
    return (
      <PageLayout header={header} toolbar={toolbar}>
        <Surface padding="lg">
          <p>
            <Link to="/auth/login">Log in</Link> to edit group settings.
          </p>
          <p>
            <Link to="/groups/$groupSlug" params={{ groupSlug: group.slug }}>
              Back to group
            </Link>
          </p>
        </Surface>
      </PageLayout>
    );
  }

  if (!viewerAccess.capabilities.rename) {
    return (
      <PageLayout header={header} toolbar={toolbar}>
        <Surface padding="lg">
          <p>Only the owner can edit the group settings.</p>
          <p>
            <Link to="/groups/$groupSlug" params={{ groupSlug: group.slug }}>
              Back to group
            </Link>
          </p>
        </Surface>
      </PageLayout>
    );
  }

  return (
    <PageLayout header={header} toolbar={toolbar}>
      <Surface padding="lg">
        <GroupSettingsForm key={group.slug} initial={group} />
      </Surface>
    </PageLayout>
  );
}
