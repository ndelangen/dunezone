import { Group } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { IconAction } from '@ui/control/IconAction';
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
          <IconAction
            label="Back to profiles"
            variant="light"
            color="gray"
            size="lg"
            renderRoot={(rootProps) => <Link {...rootProps} to="/profiles" />}
            icon={<ArrowLeft size={16} aria-hidden />}
          />
          <IconAction
            label="View public profile"
            variant="light"
            color="dune"
            size="lg"
            renderRoot={(rootProps) => (
              <Link {...rootProps} to="/profiles/$profileSlug" params={{ profileSlug: ownSlug }} />
            )}
            icon={<User size={16} aria-hidden />}
          />
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
