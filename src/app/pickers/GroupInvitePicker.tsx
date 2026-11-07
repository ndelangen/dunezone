import { Combobox, ScrollArea, Stack, Text, TextInput, useCombobox } from '@mantine/core';
import { FormError } from '@ui/block/FormError';
import { useAssignPane } from '@ui/control/AssignPopover';
import { LabeledAction } from '@ui/control/LabeledAction';
import { ChevronsDown } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useInviteCandidates } from '@db/members';
import type { InviteCandidate } from '@db/members';

import { ProfileOptionContent } from './ProfilePicker.parts';

export type GroupInvitePickerProps = {
  /** The Group being invited into; the query lists only people with no open membership of it. */
  groupId: string;
  /**
   * Reports the choice.
   * The page sends the invitation;
   * rejecting shows the error here and leaves the pane open, resolving closes it.
   */
  onPick: (candidate: InviteCandidate) => Promise<void>;
};

/**
 * The people an active member may invite, searched on the server by slug prefix and offered inline.
 * Mounted inside an `AssignPopover`, so the read starts when the reader opens the pane and ends when they leave it.
 * Choosing someone is the commit, `AssignOptions`' rule;
 * it is not `AssignOptions` because the choices arrive by search rather than all at once, so the field has to reach the server.
 */
export function GroupInvitePicker({ groupId, onPick }: GroupInvitePickerProps) {
  const { title, labelId, disabled, close } = useAssignPane();
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const picker = useInviteCandidates(groupId, search.trim());
  const combobox = useCombobox({ defaultOpened: true });
  useEffect(() => {
    combobox.selectFirstOption();
  }, [combobox, picker.data]);

  const invite = async (userId: string) => {
    const candidate = picker.data.find((row) => row.userId === userId);
    if (!candidate || isInviting) {
      return;
    }
    setIsInviting(true);
    setError(null);
    try {
      await onPick(candidate);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invitation. Try again.');
    }
    setIsInviting(false);
  };

  return (
    <Stack gap="sm">
      <Text id={labelId} fw={700} fz="h4">
        {title}
      </Text>
      <Text size="sm" c="dimmed">
        They join once they accept the invitation.
      </Text>
      {error ? <FormError title="Could not send the invitation">{error}</FormError> : null}
      <Combobox store={combobox} onOptionSubmit={(value) => void invite(value)}>
        <Combobox.EventsTarget>
          <TextInput
            aria-label="Search people"
            placeholder="Type a name…"
            value={search}
            type="search"
            name="person-search"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
            data-form-type="other"
            disabled={disabled || isInviting}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </Combobox.EventsTarget>
        <ScrollArea.Autosize mah={260} type="auto">
          <Combobox.Options>
            {picker.status === 'LoadingFirstPage' ? (
              <Combobox.Empty>Loading people…</Combobox.Empty>
            ) : picker.data.length === 0 ? (
              <Combobox.Empty>No one to invite matches</Combobox.Empty>
            ) : (
              picker.data.map((candidate) => (
                <Combobox.Option key={candidate.userId} value={candidate.userId} disabled={disabled || isInviting}>
                  <ProfileOptionContent profile={candidate} />
                </Combobox.Option>
              ))
            )}
          </Combobox.Options>
        </ScrollArea.Autosize>
      </Combobox>
      {picker.status === 'CanLoadMore' ? (
        <LabeledAction size="compact-sm" icon={<ChevronsDown size={14} />} onClick={picker.loadMore}>
          Load more people
        </LabeledAction>
      ) : null}
    </Stack>
  );
}
