import { ActionIcon, Button, Group, Stack } from '@mantine/core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormField } from '@ui/input/FormField';
import { FormTooltip } from '@ui/input/FormTooltip';
import { TextField } from '@ui/input/TextField';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';

import { useGroupsByCreator } from '@db/groups';
import { useCurrentProfile } from '@db/profiles';
import { useCreateRuleset } from '@db/rulesets';
import { PageLayout } from '@app/components/shell';

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
      <FormField label="Name" htmlFor="ruleset-name" error={createRuleset.error?.message}>
        <TextField
          id="ruleset-name"
          name="name"
          required
          minLength={1}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>
      <FormField label="Group" htmlFor="ruleset-group">
        <select
          id="ruleset-group"
          name="group"
          value={groupId ?? ''}
          onChange={(event) => setGroupId(event.target.value === '' ? null : event.target.value)}
        >
          <option value="">No group</option>
          {groups.data?.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </FormField>
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
            <FormTooltip content="Back to rulesets">
              <ActionIcon
                variant="light"
                color="gray"
                size="lg"
                aria-label="Back to rulesets"
                renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}
              >
                <ArrowLeft size={16} aria-hidden />
              </ActionIcon>
            </FormTooltip>
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
