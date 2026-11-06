import { Avatar, Combobox, Group, ScrollArea, Stack, Text, TextInput, useCombobox } from '@mantine/core';
import { Pending } from '@ui/content/Pending';
import { LabeledAction } from '@ui/control/LabeledAction';
import { Check, ChevronsDown, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useReplacementProfiles } from '@db/accountDeletion';
import type { ReplacementProfile } from '@db/accountDeletion';

export interface ProfilePickerProps {
  onPick: (profile: ReplacementProfile) => void;
  onCancel: () => void;
}

/** A lazy domain Picker: it reads only the active-profile projection and reports a selected profile. */
export function ProfilePicker({ onPick, onCancel }: ProfilePickerProps) {
  const combobox = useCombobox();
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<ReplacementProfile['userId'] | ''>('');
  const picker = useReplacementProfiles(search.trim());

  const rowsById = useMemo(() => new Map(picker.data.map((profile) => [profile.userId, profile])), [picker.data]);
  const rows = picker.data;
  const selected = selectedUserId ? rowsById.get(selectedUserId) : undefined;

  return (
    <Stack gap="md">
      <div>
        <Text fw={700}>Choose the new owner</Text>
        <Text size="sm" c="dimmed">
          Any other active profile can receive all direct ownership.
        </Text>
      </div>
      {picker.status === 'LoadingFirstPage' ? (
        <Pending>Loading profiles</Pending>
      ) : picker.data.length === 0 ? (
        <Text size="sm" c="dimmed">
          No other active profiles are available.
        </Text>
      ) : (
        <Combobox
          store={combobox}
          onOptionSubmit={(userId) => setSelectedUserId(userId as ReplacementProfile['userId'])}
        >
          <Combobox.EventsTarget>
            <TextInput
              label="Search profiles"
              type="search"
              name="profile-search"
              autoComplete="off"
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                combobox.selectFirstOption();
              }}
            />
          </Combobox.EventsTarget>
          <ScrollArea.Autosize mah={260} type="auto">
            <Combobox.Options>
              {rows.length === 0 ? (
                <Combobox.Empty>No matching profiles</Combobox.Empty>
              ) : (
                rows.map((profile) => (
                  <Combobox.Option
                    key={profile.userId}
                    value={profile.userId}
                    active={profile.userId === selectedUserId}
                  >
                    <Group wrap="nowrap">
                      <Avatar src={profile.avatarUrl} name={profile.username} size="sm" />
                      <div>
                        <Text size="sm" fw={700}>
                          {profile.username}
                        </Text>
                        <Text size="xs" c="dimmed">
                          /profiles/{profile.slug}
                        </Text>
                      </div>
                    </Group>
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
