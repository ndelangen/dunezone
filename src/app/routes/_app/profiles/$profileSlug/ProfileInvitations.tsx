import { Group, Stack, Text } from '@mantine/core';
import { FormError } from '@ui/block/FormError';
import { formatStableDate } from '@ui/content/dates';
import { GroupLink } from '@ui/content/GroupLink';
import { IconAction } from '@ui/control/IconAction';
import { Card } from '@ui/surface/Card';
import { Check, MailPlus, X } from 'lucide-react';
import { useState } from 'react';

import { useGroupMembershipWorkflow, useViewerInvitations } from '@db/members';
import type { ViewerInvitation } from '@db/members';

/**
 * The Groups that have asked the viewer in, each with its two answers, on the viewer's own profile alone.
 * Its own component so the query mounts only for the person it answers;
 * it is private to them, which is why the public page carries no invitations of its own.
 */
export function ProfileInvitations() {
  const invitations = useViewerInvitations();
  const workflow = useGroupMembershipWorkflow();
  /* The Group last answered, so only its own button reads as busy; whether anything is busy is the workflow's to say. */
  const [answeredGroupId, setAnsweredGroupId] = useState<string | null>(null);
  const busy = workflow.accept.isPending || workflow.decline.isPending;
  const answer = (groupId: string, command: typeof workflow.accept) => {
    setAnsweredGroupId(groupId);
    void command.run(groupId).catch(() => undefined);
  };
  const rows = invitations.data ?? [];
  const error = workflow.accept.error ?? workflow.decline.error;
  if (rows.length === 0 && !error) {
    return null;
  }
  return (
    <Card icon={<MailPlus size={20} aria-hidden />} title="Invitations">
      <Stack gap="sm">
        {error ? <FormError title="Could not answer the invitation">{error.message}</FormError> : null}
        {rows.map((invitation) => (
          <ProfileInvitationRow
            key={invitation.membershipId}
            invitation={invitation}
            busy={busy}
            accepting={answeredGroupId === invitation.group.id && workflow.accept.isPending}
            declining={answeredGroupId === invitation.group.id && workflow.decline.isPending}
            onAccept={() => answer(invitation.group.id, workflow.accept)}
            onDecline={() => answer(invitation.group.id, workflow.decline)}
          />
        ))}
      </Stack>
    </Card>
  );
}

/** One invitation: the Group, who asked and when, and the two answers. */
function ProfileInvitationRow({
  invitation,
  busy,
  accepting,
  declining,
  onAccept,
  onDecline,
}: {
  invitation: ViewerInvitation;
  busy: boolean;
  accepting: boolean;
  declining: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const invitedAt = formatStableDate(invitation.invitedAt);
  return (
    <Group justify="space-between" wrap="wrap" gap="sm">
      <Stack gap={2} miw={0}>
        <GroupLink slug={invitation.group.slug} name={invitation.group.name} />
        <Text size="xs" c="dimmed">
          {invitation.invitedBy?.username
            ? `Invited by ${invitation.invitedBy.username}, ${invitedAt}`
            : `Invited ${invitedAt}`}
        </Text>
      </Stack>
      <Group gap={4} wrap="nowrap">
        <IconAction
          label={`Accept invitation to ${invitation.group.name}`}
          tooltip="Accept"
          intent="positive"
          emphasis="standard"
          loading={accepting}
          disabled={busy}
          onClick={onAccept}
          icon={<Check size={15} aria-hidden />}
        />
        <IconAction
          label={`Decline invitation to ${invitation.group.name}`}
          tooltip="Decline"
          intent="negative"
          emphasis="standard"
          loading={declining}
          disabled={busy}
          onClick={onDecline}
          icon={<X size={15} aria-hidden />}
        />
      </Group>
    </Group>
  );
}
