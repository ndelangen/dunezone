import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';

import { useGroupsByCreator } from '@db/groups';
import { useCurrentProfile } from '@db/profiles';
import { useCreateRuleset } from '@db/rulesets';
import { FormField } from '@app/components/form/FormField';
import { FormTooltip } from '@app/components/form/FormTooltip';
import { TextField } from '@app/components/form/TextField';
import { ButtonGroup, Stack, Toolbar } from '@app/components/generic/layout';
import { Card } from '@app/components/generic/surfaces/Card';
import { UIButton } from '@app/components/generic/ui/UIButton';
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
      as="form"
      gap={3}
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
      <ButtonGroup>
        <UIButton
          type="submit"
          iconOnly={false}
          disabled={createRuleset.isPending || name.trim().length === 0}
        >
          <Plus size={16} aria-hidden />
          <span>{createRuleset.isPending ? 'Creating…' : 'Create'}</span>
        </UIButton>
      </ButtonGroup>
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
              <UIButton variant="nav" to="/rulesets" aria-label="Back to rulesets">
                <ArrowLeft size={16} aria-hidden />
              </UIButton>
            </FormTooltip>
          </Toolbar.Left>
        </Toolbar>
      }
    >
      {!profile.data?.user_id ? (
        <Card>
          <p>
            <Link to="/auth/login">Log in</Link> to create a ruleset.
          </p>
          <p>
            <Link to="/rulesets">Back to rulesets</Link>
          </p>
        </Card>
      ) : (
        <Card>
          <CreateRulesetForm ownerUserId={profile.data.user_id} />
        </Card>
      )}
    </PageLayout>
  );
}
