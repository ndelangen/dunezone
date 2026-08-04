import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, BookOpen } from 'lucide-react';

import { useCurrentProfile } from '@db/profiles';
import { loadRulesetDetailPage, useRulesetDetailPage } from '@db/rulesets';
import { FormTooltip } from '@app/components/form/FormTooltip';
import { ButtonGroup, Toolbar } from '@app/components/generic/layout';
import { BlockCover } from '@app/components/generic/surfaces';
import { Card } from '@app/components/generic/surfaces/Card';
import { UIButton } from '@app/components/generic/ui/UIButton';
import { RulesetSettingsForm } from '@app/components/rulesets/RulesetSettingsForm';
import { PageLayout } from '@app/components/shell';

import styles from './edit.module.css';

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/edit')({
  loader: async ({ params }) => {
    const detailPage = await loadRulesetDetailPage(params.rulesetSlug);
    if (!detailPage) {
      return { notFound: true as const };
    }
    return { notFound: false as const, detailPage };
  },
  component: RulesetEditPage,
});

function RulesetEditPage() {
  const { rulesetSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const detailSeed =
    !loaderData.notFound && loaderData.detailPage ? loaderData.detailPage : undefined;
  const page = useRulesetDetailPage(rulesetSlug, { initialData: detailSeed });
  const profile = useCurrentProfile();

  const header = page.ruleset ? (
    <div className={styles.pageHead}>
      <div className={styles.rulesetHeadCover}>
        <BlockCover src={page.ruleset.image_cover} alt={`Cover for ${page.ruleset.name}`} />
      </div>
      <div className={styles.pageHeadText}>
        <h1 className={styles.rulesetTitle}>Edit {page.ruleset.name}</h1>
      </div>
    </div>
  ) : (
    <h1>Edit ruleset</h1>
  );
  const toolbar = (
    <Toolbar>
      <Toolbar.Left>
        <ButtonGroup>
          <FormTooltip content="Back to rulesets">
            <UIButton variant="nav" to="/rulesets" aria-label="Back to rulesets">
              <ArrowLeft size={16} aria-hidden />
            </UIButton>
          </FormTooltip>
          {page.ruleset ? (
            <FormTooltip content="View ruleset">
              <UIButton
                variant="secondary"
                to="/rulesets/$rulesetSlug"
                params={{ rulesetSlug: page.ruleset.slug }}
                aria-label="View ruleset"
              >
                <BookOpen size={16} aria-hidden />
              </UIButton>
            </FormTooltip>
          ) : null}
        </ButtonGroup>
      </Toolbar.Left>
    </Toolbar>
  );

  if (loaderData.notFound) {
    return (
      <PageLayout header={header} toolbar={toolbar}>
        <Card>
          <p>Ruleset not found.</p>
        </Card>
      </PageLayout>
    );
  }

  if (!page.ruleset) {
    return (
      <PageLayout header={header} toolbar={toolbar}>
        <Card>
          <p>Ruleset not found.</p>
        </Card>
      </PageLayout>
    );
  }

  const r = page.ruleset;
  const viewerUserId = profile.data?.user_id;

  if (profile.isPending) {
    return (
      <PageLayout header={header} toolbar={toolbar}>
        Loading profile…
      </PageLayout>
    );
  }

  if (!viewerUserId) {
    return (
      <PageLayout header={header} toolbar={toolbar}>
        <Card>
          <p>
            <Link to="/auth/login">Log in</Link> to edit this ruleset.
          </p>
        </Card>
      </PageLayout>
    );
  }

  if (!page.canAccess) {
    return (
      <PageLayout header={header} toolbar={toolbar}>
        <Card>
          <p>Only the ruleset owner or an active member of its group can edit this ruleset.</p>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout header={header} toolbar={toolbar}>
      <Card>
        <RulesetSettingsForm key={r.slug} initial={r} canRename={r.owner_id === viewerUserId} />
      </Card>
    </PageLayout>
  );
}
