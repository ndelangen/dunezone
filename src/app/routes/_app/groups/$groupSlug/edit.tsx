import { Group, Stack, TextInput } from '@mantine/core';
import { groupInputSchema } from '@shared/groups/validation';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
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

function GroupSettings({ initial }: { initial: GroupEntry }) {
  const navigate = useNavigate();
  const updateGroup = useUpdateGroup();
  /* No effect syncing `name` back from `initial`: the page mounts this with `key={group.slug}`, so a
     rename remounts it and resets the field. An effect on top of that only adds a way for a
     background update to overwrite what someone is typing. `RulesetSettings` works the same way. */
  const [name, setName] = useState(initial.name);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const mutationError =
    updateGroup.isError && updateGroup.error instanceof Error ? updateGroup.error.message : null;
  const failure = submitError ?? mutationError;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    const parsed = groupInputSchema.safeParse({ name: name.trim() });
    if (!parsed.success) {
      setSubmitError(
        parsed.error.issues.map((issue) => issue.message).join(' ') || 'Invalid group name'
      );
      return;
    }
    const previousSlug = initial.slug;
    updateGroup.mutate(
      { id: initial.id, input: parsed.data },
      {
        onSuccess: (entry) => {
          setSubmitError(null);
          if (previousSlug !== entry.slug) {
            navigate({
              to: '/groups/$groupSlug/edit',
              params: { groupSlug: entry.slug },
              replace: true,
            });
          }
        },
        onError: (error) => setSubmitError(error.message),
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
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          if (submitError) {
            setSubmitError(null);
          }
        }}
      />
      {failure ? <FormError title="Group could not be saved">{failure}</FormError> : null}
      <Group gap="xs" wrap="nowrap">
        <SubmitAction pending={updateGroup.isPending} disabled={name.trim().length === 0}>
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
  component: GroupEditPage,
});

function GroupEditPage() {
  const { groupSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const groupData = useGroupEditBySlug(groupSlug, { initialData: loaderData.groupEdit });

  const editPage = groupData.data;
  if (groupData.isError || !editPage) {
    return (
      <PageLayout>
        <PageLayout.Header>
          <h1>Edit group</h1>
        </PageLayout.Header>
        <PageLayout.Content>
          <Surface padding="lg">
            <p>Group not found.</p>
            <p>
              <Link to="/profiles">Back to profiles</Link>
            </p>
          </Surface>
        </PageLayout.Content>
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
          <IconAction
            label="Back to profiles"
            variant="light"
            color="gray"
            size="lg"
            renderRoot={(rootProps) => <Link {...rootProps} to="/profiles" />}
            icon={<ArrowLeft size={16} aria-hidden />}
          />
          <IconAction
            label="View group"
            variant="light"
            color="dune"
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

  if (viewerAccess.viewer.kind === 'anonymous') {
    return (
      <PageLayout>
        <PageLayout.Header>{header}</PageLayout.Header>
        <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
        <PageLayout.Content>
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
        </PageLayout.Content>
      </PageLayout>
    );
  }

  if (!viewerAccess.capabilities.rename) {
    return (
      <PageLayout>
        <PageLayout.Header>{header}</PageLayout.Header>
        <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
        <PageLayout.Content>
          <Surface padding="lg">
            <p>Only the owner can edit the group settings.</p>
            <p>
              <Link to="/groups/$groupSlug" params={{ groupSlug: group.slug }}>
                Back to group
              </Link>
            </p>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
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
