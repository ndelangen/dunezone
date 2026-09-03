import { Group, Stack, TextInput } from '@mantine/core';
import { groupInputSchema } from '@shared/groups/validation';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { LoadError } from '@ui/block/LoadError';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { SlugRenameNotice } from '@ui/content/SlugRenameNotice';
import { IconAction } from '@ui/control/IconAction';
import { SubmitAction } from '@ui/control/SubmitAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Users } from 'lucide-react';
import { useState } from 'react';

import { loadGroupEditBySlug, useGroupEditBySlug, useUpdateGroup } from '@db/groups';
import type { GroupEntry } from '@db/groups';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

function GroupSettings({ initial }: { initial: GroupEntry }) {
  const navigate = useNavigate();
  const updateGroup = useUpdateGroup();
  /* No effect syncing `name` back from `initial`: the page mounts this with `key={group.slug}`, so a
     rename remounts it and resets the field. An effect on top of that only adds a way for a
     background update to overwrite what someone is typing. `RulesetSettings` works the same way. */
  const [name, setName] = useState(initial.name);

  const nameCheck = groupInputSchema.safeParse({ name: name.trim() });
  /* Live once something is typed, per RulesetSettings' about field: an untouched or emptied field is
     explained by the requirement line and the disabled button, not an error. */
  const nameError =
    name.trim().length > 0 && !nameCheck.success
      ? nameCheck.error.issues.map((issue) => issue.message).join(' ') || 'Invalid group name'
      : undefined;
  const mutationError = updateGroup.isError && updateGroup.error instanceof Error ? updateGroup.error.message : null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!nameCheck.success) {
      return;
    }
    const previousSlug = initial.slug;
    updateGroup.mutate(
      { id: initial.id, input: nameCheck.data },
      {
        onSuccess: (entry) => {
          if (previousSlug !== entry.slug) {
            navigate({
              to: '/groups/$groupSlug/edit',
              params: { groupSlug: entry.slug },
              replace: true,
            });
          }
        },
      }
    );
  };

  return (
    <Stack component="form" gap="sm" onSubmit={handleSubmit}>
      <TextInput
        label="Group name"
        description={<SlugRenameNotice noun="group" url={`…/groups/${initial.slug}`} />}
        name="name"
        required
        minLength={1}
        title="Group name may only contain letters and numbers"
        error={nameError}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      {mutationError ? <FormError title="Group could not be saved">{mutationError}</FormError> : null}
      <Group gap="xs" wrap="nowrap">
        <SubmitAction pending={updateGroup.isPending} disabled={!nameCheck.success}>
          Save group
        </SubmitAction>
      </Group>
    </Stack>
  );
}

export const Route = createFileRoute('/_app/groups/$groupSlug/edit')({
  loader: async ({ params }) => {
    const groupEdit = await loadGroupEditBySlug(params.groupSlug);
    return { groupEdit };
  },
  errorComponent: GroupEditError,
  component: GroupEditPage,
});

/**
 * The frame for a load that failed, which on this route is most often a slug that names no group: the query throws rather than returning nothing, so the component's own absent branch never runs.
 * Without this the reader met the router's unstyled default and, in development, a stack trace.
 */
function GroupEditError({ error }: ErrorComponentProps) {
  return (
    <PageMessage title="Edit group" back={<PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>}>
      <LoadError title="Group could not be loaded" stale={isStaleClientData(error)}>
        {error.message}
      </LoadError>
    </PageMessage>
  );
}

function GroupEditPage() {
  const { groupSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const groupData = useGroupEditBySlug(groupSlug, { initialData: loaderData.groupEdit });

  const editPage = groupData.data;
  if (!editPage) {
    return (
      <PageMessage title="Edit group" back={<PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>}>
        <NotAvailable title="Group not found">This group does not exist or was deleted.</NotAvailable>
      </PageMessage>
    );
  }

  const group = editPage.group;
  const viewerAccess = editPage.viewerAccess;
  const header = <PageTitle title={`Edit ${group.name}`} />;
  const toolbar = (
    <Toolbar>
      <Toolbar.Left>
        <Group gap="xs" wrap="nowrap">
          <IconAction
            label="Back to profiles"
            variant="light"
            intent="neutral"
            size="lg"
            renderRoot={(rootProps) => <Link {...rootProps} to="/profiles" />}
            icon={<ArrowLeft size={16} aria-hidden />}
          />
          <IconAction
            label="View group"
            variant="light"
            intent="neutral"
            size="lg"
            renderRoot={(rootProps) => (
              <Link {...rootProps} to="/groups/$groupSlug" params={{ groupSlug: group.slug }} />
            )}
            icon={<Users size={16} aria-hidden />}
          />
        </Group>
      </Toolbar.Left>
    </Toolbar>
  );

  /* Back to the group rather than to profiles, which is the more useful of the two destinations the
     toolbar carried: a reader who cannot edit this group can still read it. */
  const guardBack = (
    <PageMessage.Back to="/groups/$groupSlug" params={{ groupSlug: group.slug }}>
      Back to group
    </PageMessage.Back>
  );

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
        <NotAvailable title="You cannot edit this group">Only the owner can edit the group settings.</NotAvailable>
      </PageMessage>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header>{header}</PageLayout.Header>
      <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
      <PageLayout.Content>
        <Surface padding="lg">
          <GroupSettings key={group.slug} initial={group} />
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}
