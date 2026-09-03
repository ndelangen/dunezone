import { Group, Stack, TextInput } from '@mantine/core';
import { groupInputSchema } from '@shared/groups/validation';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { PageTitle } from '@ui/block/PageTitle';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { Save, X } from 'lucide-react';
import { useState } from 'react';

import { useCreateGroup } from '@db/groups';
import { useSessionViewer } from '@db/profiles';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

export const Route = createFileRoute('/_app/groups/create')({
  component: GroupCreatePage,
});

const GROUP_CREATE_FORM_ID = 'group-create';
const groupCreateHeader = <PageTitle title="Start group" />;

function GroupCreatePage() {
  const navigate = useNavigate();
  const viewer = useSessionViewer();
  const createGroup = useCreateGroup();
  const [name, setName] = useState('');

  const nameCheck = groupInputSchema.safeParse({ name: name.trim() });
  /* Live once something is typed, per the edit twin: the create wrapper parses before it mutates and
     its refusal never reaches the mutation's error state, so an invalid name must be caught here or
     it is caught nowhere. */
  const nameError =
    name.trim().length > 0 && !nameCheck.success
      ? nameCheck.error.issues.map((issue) => issue.message).join(' ') || 'Invalid group name'
      : undefined;

  switch (viewer.kind) {
    case 'pending':
      return (
        <PageMessage title="Start group" back={<PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>}>
          <LoadPending title="Loading your profile">Checking whether you are signed in.</LoadPending>
        </PageMessage>
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

  const profileRow = viewer.profile;
  const canSubmit = !createGroup.isPending && nameCheck.success;

  return (
    <PageLayout>
      <PageLayout.Header>{groupCreateHeader}</PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Group gap="xs" wrap="nowrap">
              <IconAction
                label="Save group"
                emphasis="strong"
                intent="positive"
                size="lg"
                type="submit"
                form={GROUP_CREATE_FORM_ID}
                disabled={!canSubmit}
                icon={<Save size={16} aria-hidden />}
              />
              <IconAction
                label="Close create group"
                emphasis="standard"
                intent="neutral"
                size="lg"
                disabled={createGroup.isPending}
                onClick={() =>
                  navigate({
                    to: '/profiles/$profileSlug',
                    params: { profileSlug: profileRow.slug },
                  })
                }
                icon={<X size={16} aria-hidden />}
              />
            </Group>
          </Toolbar.Left>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Surface padding="lg">
          <Stack
            component="form"
            gap="sm"
            id={GROUP_CREATE_FORM_ID}
            onSubmit={(e) => {
              e.preventDefault();
              if (!nameCheck.success) {
                return;
              }
              createGroup.mutate(
                { input: nameCheck.data },
                {
                  onSuccess: () => {
                    navigate({
                      to: '/profiles/$profileSlug',
                      params: { profileSlug: profileRow.slug },
                    });
                  },
                }
              );
            }}
          >
            <TextInput
              label="Group name"
              error={nameError ?? createGroup.error?.message}
              name="name"
              required
              minLength={1}
              title="Group name may only contain letters and numbers"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}
