import { Anchor, Divider, Stack, Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';

import { pageHead } from '@app/routes/pageTitle';

export const Route = createFileRoute('/_app/admin/')({
  head: () => pageHead('Admin tools'),
  component: AdminIndex,
});

function AdminIndex() {
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle title="Admin tools" subtitle="Find the tool for the job and what it changes." />
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="lg">
          <Stack gap="lg">
            <Section
              title="Accounts"
              action={<Anchor renderRoot={(props) => <Link {...props} to="/admin/accounts" />}>Open accounts</Anchor>}
            >
              <Text>
                Find profiles, combine duplicate accounts and resume interrupted merges. A merge moves content and
                sign-in methods into the profile you keep.
              </Text>
            </Section>
            <Divider />
            <Section
              title="Card presets"
              action={
                <Anchor renderRoot={(props) => <Link {...props} to="/admin/presets" />}>Open card presets</Anchor>
              }
            >
              <Text>
                Edit the shared designs used by cards and Discovery tokens. Saving a preset updates linked artwork and
                queues it for publication.
              </Text>
            </Section>
            <Divider />
            <Section
              title="Game debugger"
              action={
                <Anchor renderRoot={(props) => <Link {...props} to="/admin/game-debugger" />}>
                  Open game debugger
                </Anchor>
              }
            >
              <Text>
                Open a bug-report file to inspect the captured table, compare server and browser state, and read saved
                events, errors and redacted conversations.
              </Text>
            </Section>
            <Divider />
            <Section
              title="Migration activity"
              action={
                <Anchor renderRoot={(props) => <Link {...props} to="/admin/migrations" />}>
                  Open migration activity
                </Anchor>
              }
            >
              <Text>
                Inspect data migration progress, processed counts and errors. Sync refreshes the recorded status; it
                does not start a migration.
              </Text>
            </Section>
            <Divider />
            <Section
              title="Publication jobs"
              action={
                <Anchor renderRoot={(props) => <Link {...props} to="/admin/jobs" />}>Open publication jobs</Anchor>
              }
            >
              <Text>
                Inspect queued, running and failed artwork publications. Pause or resume pickup of waiting jobs when
                investigating the publisher.
              </Text>
            </Section>
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}
