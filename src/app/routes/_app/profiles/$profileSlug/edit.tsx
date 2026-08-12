import { ActionIcon, Group } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { FormTooltip } from '@ui/control/FormTooltip';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, User } from 'lucide-react';

import { useCurrentProfile } from '@db/profiles';
import { PageLayout } from '@app/components/layout/PageLayout';
import { ProfileSettingsForm } from '@app/components/profile/ProfileSettingsForm';

export const Route = createFileRoute('/_app/profiles/$profileSlug/edit')({
  component: ProfileSettingsPage,
});

function ProfileSettingsPage() {
  const { profileSlug } = Route.useParams();
  const profile = useCurrentProfile();

  if (!profile.data) {
    return (
      <PageLayout>
        <Surface padding="lg">
          <p>
            <Link to="/auth/login">Log in</Link> to edit your profile.
          </p>
        </Surface>
      </PageLayout>
    );
  }

  if (profile.data.slug !== profileSlug) {
    return (
      <PageLayout>
        <Surface padding="lg">
          <p>You can only edit your own profile.</p>
          <p>
            <Link to="/profiles/$profileSlug/edit" params={{ profileSlug: profile.data.slug }}>
              Go to your profile settings
            </Link>
          </p>
        </Surface>
      </PageLayout>
    );
  }

  /* Hoisted: narrowing on `profile.data` does not survive into the renderRoot closure. */
  const ownSlug = profile.data.slug;

  const toolbar = (
    <Toolbar>
      <Toolbar.Left>
        <Group gap="xs" wrap="nowrap">
          <FormTooltip content="Back to profiles">
            <ActionIcon
              variant="light"
              color="gray"
              size="lg"
              aria-label="Back to profiles"
              renderRoot={(rootProps) => <Link {...rootProps} to="/profiles" />}
            >
              <ArrowLeft size={16} aria-hidden />
            </ActionIcon>
          </FormTooltip>
          <FormTooltip content="View public profile">
            <ActionIcon
              variant="light"
              color="dune"
              size="lg"
              aria-label="View public profile"
              renderRoot={(rootProps) => (
                <Link
                  {...rootProps}
                  to="/profiles/$profileSlug"
                  params={{ profileSlug: ownSlug }}
                />
              )}
            >
              <User size={16} aria-hidden />
            </ActionIcon>
          </FormTooltip>
        </Group>
      </Toolbar.Left>
    </Toolbar>
  );

  return (
    <PageLayout toolbar={toolbar}>
      <Surface padding="lg">
        <ProfileSettingsForm key={profile.data.slug} initial={profile.data} />
      </Surface>
    </PageLayout>
  );
}
