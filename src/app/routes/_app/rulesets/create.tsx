import { ActionIcon, Button, Group, NativeSelect, Stack, TextInput, Tooltip } from '@mantine/core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';

import { useGroupsByCreator } from '@db/groups';
import { useCurrentProfile } from '@db/profiles';
import { useCreateRuleset } from '@db/rulesets';
import { PageLayout } from '@app/components/layout/PageLayout';

export const Route = createFileRoute('/_app/rulesets/create')({
  component: CreateRulesetPage,
});

function CreateRulesetForm({ ownerUserId }: { ownerUserId: string }) {
  const navigate = useNavigate();
  const createRuleset = useCreateRuleset();
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const groups = useGroupsByCreator(ownerUserId);

  return (
    <Stack
      component="form"
      gap="sm"
      onSubmit={(e) => {
        e.preventDefault();
        const nextName = name.trim();
        if (!nextName) {
          return;
        }
        createRuleset.mutate(
          { input: { name: nextName }, groupId: groupId ?? null },
          {
            onSuccess: (entry) => {
              navigate({
                to: '/rulesets/$rulesetSlug',
                params: { rulesetSlug: entry.slug },
              });
            },
          }
        );
      }}
    >
      <TextInput
        label="Name"
        error={createRuleset.error?.message}
        name="name"
        required
        minLength={1}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <NativeSelect
        label="Group"
        name="group"
        value={groupId ?? ''}
        onChange={(event) => setGroupId(event.target.value === '' ? null : event.target.value)}
        data={[
          { value: '', label: 'No group' },
          ...(groups.data?.map((group) => ({ value: group.id, label: group.name })) ?? []),
        ]}
      />
      <Group gap="xs" wrap="nowrap">
        <Button
          variant="filled"
          color="confirm"
          type="submit"
          disabled={createRuleset.isPending || name.trim().length === 0}
        >
          <Plus size={16} aria-hidden />
          <span>{createRuleset.isPending ? 'Creating…' : 'Create'}</span>
        </Button>
      </Group>
    </Stack>
  );
}

function CreateRulesetPage() {
  const profile = useCurrentProfile();

  return (
    <PageLayout
      header={<h1>Create ruleset</h1>}
      toolbar={
        <Toolbar>
          <Toolbar.Left>
            <Tooltip label="Back to rulesets">
              <ActionIcon
                variant="light"
                color="gray"
                size="lg"
                aria-label="Back to rulesets"
                renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}
              >
                <ArrowLeft size={16} aria-hidden />
              </ActionIcon>
            </Tooltip>
          </Toolbar.Left>
        </Toolbar>
      }
    >
      {!profile.data?.user_id ? (
        <Surface padding="lg">
          <p>
            <Link to="/auth/login">Log in</Link> to create a ruleset.
          </p>
          <p>
            <Link to="/rulesets">Back to rulesets</Link>
          </p>
        </Surface>
      ) : (
        <Surface padding="lg">
          <CreateRulesetForm ownerUserId={profile.data.user_id} />
        </Surface>
      )}
    </PageLayout>
  );
}
