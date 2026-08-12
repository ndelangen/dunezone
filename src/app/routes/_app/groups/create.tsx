import { ActionIcon, Group, Stack, TextInput, Tooltip } from '@mantine/core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { Save, X } from 'lucide-react';
import { useState } from 'react';

import { useCreateGroup } from '@db/groups';
import { useCurrentProfile } from '@db/profiles';
import { PageLayout } from '@app/components/layout/PageLayout';

export const Route = createFileRoute('/_app/groups/create')({
  component: GroupCreatePage,
});

const GROUP_CREATE_FORM_ID = 'group-create';
const groupCreateHeader = <h1>Start group</h1>;

function GroupCreatePage() {
  const navigate = useNavigate();
  const profile = useCurrentProfile();
  const createGroup = useCreateGroup();
  const [name, setName] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!profile.data?._id || !profile.data.slug) {
    return (
      <PageLayout header={groupCreateHeader}>
        <Surface padding="lg">
          <p>
            <Link to="/auth/login">Log in</Link> to start a group.
          </p>
          <p>
            <Link to="/profiles">Back to profiles</Link>
          </p>
        </Surface>
      </PageLayout>
    );
  }

  const profileRow = profile.data;
  const canSubmit = !createGroup.isPending && name.trim().length > 0;

  return (
    <PageLayout
      header={groupCreateHeader}
      toolbar={
        <Toolbar>
          <Toolbar.Left>
            <Group gap="xs" wrap="nowrap">
              <Tooltip label="Save group">
                <ActionIcon
                  variant="filled"
                  color="confirm"
                  size="lg"
                  type="submit"
                  form={GROUP_CREATE_FORM_ID}
                  aria-label="Save group"
                  disabled={!canSubmit}
                >
                  <Save size={16} aria-hidden />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Close create group">
                <ActionIcon
                  variant="light"
                  color="dune"
                  size="lg"
                  type="button"
                  aria-label="Close create group"
                  disabled={createGroup.isPending}
                  onClick={() =>
                    navigate({
                      to: '/profiles/$profileSlug',
                      params: { profileSlug: profileRow.slug },
                    })
                  }
                >
                  <X size={16} aria-hidden />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Toolbar.Left>
        </Toolbar>
      }
    >
      <Surface padding="lg">
        <Stack
          component="form"
          gap="sm"
          id={GROUP_CREATE_FORM_ID}
          onSubmit={(e) => {
            e.preventDefault();
            const nextName = name.trim();
            if (!nextName) {
              return;
            }
            setSubmitError(null);
            createGroup.mutate(
              { input: { name: nextName } },
              {
                onSuccess: () => {
                  setSubmitError(null);
                  navigate({
                    to: '/profiles/$profileSlug',
                    params: { profileSlug: profileRow.slug },
                  });
                },
                onError: (error) => setSubmitError(error.message),
              }
            );
          }}
        >
          <TextInput
            label="Group name"
            error={submitError ?? createGroup.error?.message}
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
        </Stack>
      </Surface>
    </PageLayout>
  );
}
