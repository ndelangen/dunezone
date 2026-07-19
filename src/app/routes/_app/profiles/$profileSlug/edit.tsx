import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, User } from 'lucide-react';

import { useCurrentProfile } from '@db/profiles';
import { FormTooltip } from '@app/components/form/FormTooltip';
import { ButtonGroup, Toolbar } from '@app/components/generic/layout';
import { Card } from '@app/components/generic/surfaces/Card';
import { UIButton } from '@app/components/generic/ui/UIButton';
import { ProfileSettingsForm } from '@app/components/profile/ProfileSettingsForm';
import { PageLayout } from '@app/components/shell';

export const Route = createFileRoute('/_app/profiles/$profileSlug/edit')({
  component: ProfileSettingsPage,
});

function ProfileSettingsPage() {
  const { profileSlug } = Route.useParams();
  const profile = useCurrentProfile();

  if (!profile.data) {
    return (
      <PageLayout>
        <Card>
          <p>
            <Link to="/auth/login">Log in</Link> to edit your profile.
          </p>
        </Card>
      </PageLayout>
    );
  }

  if (profile.data.slug !== profileSlug) {
    return (
      <PageLayout>
        <Card>
          <p>You can only edit your own profile.</p>
          <p>
            <Link to="/profiles/$profileSlug/edit" params={{ profileSlug: profile.data.slug }}>
              Go to your profile settings
            </Link>
          </p>
        </Card>
      </PageLayout>
    );
  }

  const toolbar = (
    <Toolbar>
      <Toolbar.Left>
        <ButtonGroup>
          <FormTooltip content="Back to profiles">
            <UIButton variant="nav" to="/profiles" aria-label="Back to profiles">
              <ArrowLeft size={16} aria-hidden />
            </UIButton>
          </FormTooltip>
          <FormTooltip content="View public profile">
            <UIButton
              variant="secondary"
              to="/profiles/$profileSlug"
              params={{ profileSlug: profile.data.slug }}
              aria-label="View public profile"
            >
              <User size={16} aria-hidden />
            </UIButton>
          </FormTooltip>
        </ButtonGroup>
      </Toolbar.Left>
    </Toolbar>
  );

  return (
    <PageLayout toolbar={toolbar}>
      <Card>
        <ProfileSettingsForm key={profile.data.slug} initial={profile.data} />
      </Card>
    </PageLayout>
  );
}
