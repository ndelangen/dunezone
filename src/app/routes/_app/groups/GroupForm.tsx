import { Stack, TextInput } from '@mantine/core';
import { groupInputSchema } from '@shared/groups/validation';
import { ActionError } from '@ui/block/ActionError';
import type { FailedAction } from '@ui/block/ActionError';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import type { IconActionProps } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Save } from 'lucide-react';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import type { z } from 'zod';

import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';

/* The form's id, so Save can sit in the toolbar with every other page's Save and still submit it. */
const GROUP_FORM_ID = 'group-form';

/**
 * The group form, whole page: the way back, Save, and the name field with its live check.
 * Starting a group and editing one are the same form with a different starting name, way back and mutation, so both routes render this and own only those.
 * It returns the full `PageLayout` itself rather than handing a header slot upward: the layout matches slots by identity, so the band must be this component's own direct child (#444), and per #897 that band stays closed until there are warnings.
 */
export function GroupForm({
  initialName,
  back,
  description,
  verb,
  pending,
  error,
  onSubmit,
}: {
  /** The name the field starts with: empty for a new group, the current name for an edit. A rename remounts the edit page, which is the reset. */
  initialName: string;
  /** The toolbar's way back: its name and where it goes. */
  back: { label: string; renderRoot: NonNullable<IconActionProps['renderRoot']> };
  /** What the name field says about itself, such as that a rename moves the group's address. */
  description?: ReactNode;
  /** What a failed save says did not happen. */
  verb: Extract<FailedAction, 'create' | 'save'>;
  pending: boolean;
  /** The last save's failure. */
  error: Error | null;
  /** Fires with the checked input when the form is submitted with a valid name. */
  onSubmit: (input: z.output<typeof groupInputSchema>) => void;
}) {
  const [name, setName] = useState(initialName);
  const nameCheck = groupInputSchema.safeParse({ name: name.trim() });
  /* Live once something is typed: an untouched or emptied field is explained by the requirement and the disabled Save, not an error. */
  const nameError =
    name.trim().length > 0 && !nameCheck.success
      ? nameCheck.error.issues.map((issue) => issue.message).join(' ') || 'Invalid group name'
      : undefined;
  const nameInputRef = useRef<HTMLInputElement>(null);
  const validationHeader = useEditPageHeader({
    warnings: nameError ? [{ source: 'Group name', complaint: nameError }] : [],
    onFocusWarning: () => nameInputRef.current?.focus(),
  });

  return (
    <PageLayout>
      {validationHeader.slot}
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left label="Navigation">
            <IconAction
              label={back.label}
              emphasis="standard"
              intent="neutral"
              size="lg"
              renderRoot={back.renderRoot}
              icon={<ArrowLeft size={17} aria-hidden />}
            />
          </Toolbar.Left>
          <Toolbar.Right label="Editing actions">
            <Toolbar.Cluster kind="commit">
              <IconAction
                label="Save group"
                emphasis="strong"
                intent="positive"
                size="lg"
                type="submit"
                form={GROUP_FORM_ID}
                loading={pending}
                disabled={!nameCheck.success || pending}
                icon={<Save size={17} aria-hidden />}
              />
            </Toolbar.Cluster>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Surface padding="lg">
          <Stack
            component="form"
            id={GROUP_FORM_ID}
            gap="sm"
            onBlurCapture={validationHeader.settle}
            onSubmit={(event) => {
              event.preventDefault();
              if (nameCheck.success) {
                onSubmit(nameCheck.data);
              }
            }}
          >
            <ControlBlock
              title="Group name"
              description={description}
              input={(fieldProps) => (
                <TextInput
                  {...fieldProps}
                  ref={nameInputRef}
                  name="name"
                  required
                  minLength={1}
                  error={nameError}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            />
            <ActionError subject="Group" verb={verb} error={error} />
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}
