import { Combobox, Group, ScrollArea, Stack, Text, TextInput, useCombobox } from '@mantine/core';
import { EmptyNote } from '@ui/content/EmptyNote';
import { Pending } from '@ui/content/Pending';
import { ControlBlock } from '@ui/control/ControlBlock';
import { LabeledAction } from '@ui/control/LabeledAction';
import { Check, ChevronsDown, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useReplacementProfiles } from '@db/accountDeletion';
import type { ReplacementProfile } from '@db/accountDeletion';

import { ProfileOptionContent } from './ProfilePicker.parts';

export interface ProfilePickerProps {
  onPick: (profile: ReplacementProfile) => void;
  onCancel: () => void;
  adminSourceUserId?: string;
}

/**
 * Replacement-owner Picker: self-service offers co-members; administrators may choose any active profile.
 * The caller mounts it while open and receives the chosen profile.
 */
export function ProfilePicker({ onPick, onCancel, adminSourceUserId }: ProfilePickerProps) {
  /* No Dropdown is mounted, so "opened" changes nothing visually; it is what lets Enter choose the highlighted row, which Mantine gates on the dropdown state. */
  const combobox = useCombobox({ defaultOpened: true });
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<ReplacementProfile['userId'] | ''>('');
  const picker = useReplacementProfiles(search.trim(), adminSourceUserId);

  const rowsById = useMemo(() => new Map(picker.data.map((profile) => [profile.userId, profile])), [picker.data]);
  const rows = picker.data;
  /*
   * Each search highlights its first row once that search's results are on screen, so Enter picks the best match.
   * Not in onChange: the results arrive from the server afterwards, and highlighting then marks a row of the previous search.
   * Keyed on the search rather than the rows, so loading more leaves the highlight where the reader moved it.
   * Clearing the search clears the highlight, as before the reader typed.
   * The methods are taken off the store, which is a fresh object every render.
   */
  const listed = picker.status === 'LoadingFirstPage' ? null : search;
  const { selectFirstOption, resetSelectedOption } = combobox;
  useEffect(() => {
    if (listed) {
      selectFirstOption();
    } else if (listed === '') {
      resetSelectedOption();
    }
  }, [selectFirstOption, resetSelectedOption, listed]);
  const selected = selectedUserId ? rowsById.get(selectedUserId) : undefined;
  /* Only an unsearched list speaks for everyone; a search that matches nobody keeps its field so the reader can change it. */
  const unsearched = search.trim() === '';
  const loading = picker.status === 'LoadingFirstPage';

  return (
    <Stack gap="md">
      <div>
        <Text fw={700}>Choose the new owner</Text>
        <Text size="sm" c="dimmed">
          {adminSourceUserId
            ? "Choose an active profile to receive this account's content."
            : 'Only people who share a group with you can receive your direct ownership.'}
        </Text>
      </div>
      {unsearched && loading ? (
        <Pending>Loading profiles</Pending>
      ) : unsearched && rows.length === 0 && picker.status === 'Exhausted' ? (
        <EmptyNote>
          {adminSourceUserId
            ? 'No active replacement profiles are available.'
            : 'Nobody shares a group with you yet. Join a group, or invite someone to one of yours, to choose them here.'}
        </EmptyNote>
      ) : (
        <Combobox
          store={combobox}
          onOptionSubmit={(userId) => setSelectedUserId(userId as ReplacementProfile['userId'])}
        >
          <ControlBlock
            title="Search profiles"
            input={(fieldProps) => (
              <Combobox.EventsTarget>
                <TextInput
                  {...fieldProps}
                  type="search"
                  name="profile-search"
                  autoComplete="off"
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                />
              </Combobox.EventsTarget>
            )}
          />
          <ScrollArea.Autosize mah={260} type="auto">
            <Combobox.Options>
              {loading ? (
                <Combobox.Empty>Loading profiles…</Combobox.Empty>
              ) : rows.length === 0 ? (
                <Combobox.Empty>No matching profiles</Combobox.Empty>
              ) : (
                rows.map((profile) => (
                  <Combobox.Option
                    key={profile.userId}
                    value={profile.userId}
                    active={profile.userId === selectedUserId}
                  >
                    <ProfileOptionContent profile={profile} />
                  </Combobox.Option>
                ))
              )}
            </Combobox.Options>
          </ScrollArea.Autosize>
          {picker.status === 'CanLoadMore' ? (
            <LabeledAction size="compact-sm" icon={<ChevronsDown size={14} />} onClick={picker.loadMore}>
              Load more profiles
            </LabeledAction>
          ) : null}
        </Combobox>
      )}
      <Group justify="flex-end">
        <LabeledAction icon={<X size={16} />} onClick={onCancel}>
          Cancel
        </LabeledAction>
        <LabeledAction
          intent="positive"
          emphasis="strong"
          icon={<Check size={16} />}
          disabledReason={selected ? undefined : 'Pick a profile first.'}
          onClick={() => selected && onPick(selected)}
        >
          Use this profile
        </LabeledAction>
      </Group>
    </Stack>
  );
}
