import { Anchor, Code, List, Stack, Text } from '@mantine/core';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { PageLayout } from '@ui/layout/PageLayout';
import { Bullets } from '@ui/list/Bullets';
import { BookOpenCheck, Database, Dices, Globe, HardDrive, ImageUp } from 'lucide-react';

import { publicPageHead } from '@app/routes/publicPage';
import { ContributingGuide } from '@app/widgets/contributing-guide/ContributingGuide';

export const Route = createFileRoute('/_app/contributing/deployment')({
  ssr: true,
  head: () =>
    publicPageHead({
      name: 'How Dune Zone ships',
      pathname: '/contributing/deployment',
      description: 'What happens between a merge to main and the change being live on dune.zone.',
      social: { kind: 'Dune Zone', shape: 'portrait' },
    }),
  component: DeploymentPage,
});

const DOCS = 'https://github.com/ndelangen/dunezone/blob/main';

const STAGES = [
  {
    title: 'A merge to main starts the release',
    detail:
      'The deploy workflow first asks production which commit it runs, and stops early when that commit or a later one is already live.',
  },
  {
    title: 'The database goes first',
    detail:
      'It checks that any schema narrowing is safe, deploys the Convex functions and schema, then runs the required migrations.',
  },
  {
    title: 'The site is built once',
    detail:
      'Generated images, vectors and 3D pieces are rebuilt and compared with what is committed, then the app is built against the production database.',
  },
  {
    title: 'The game Worker, then the site Worker',
    detail:
      'Hosted games deploy first, new image variants are uploaded, then the site goes live. Each step waits until Cloudflare reports the new version and its health check names the merged commit.',
  },
  {
    title: 'Storybook follows',
    detail: 'The same commit is published to storybook.dune.zone, with no secrets in it.',
  },
  {
    title: 'Stale pictures are redrawn',
    detail:
      'When a renderer changed, its revision went up, and every published image of that kind is queued to be drawn again in the background.',
  },
  {
    title: 'The dev database catches up',
    detail:
      'The shared development deployment gets the new functions, reloaded from an anonymised snapshot when needed.',
  },
];

const PLACES = [
  {
    icon: <Globe size={18} />,
    title: 'Site and publisher Worker',
    detail: 'Serves dune.zone, renders public pages on the server and draws asset images every five minutes.',
  },
  { icon: <Dices size={18} />, title: 'Game Worker', detail: 'Runs one room per hosted game, holding its live table.' },
  {
    icon: <Database size={18} />,
    title: 'Convex',
    detail: 'Holds every record, the sign-in and the publication jobs.',
  },
  { icon: <HardDrive size={18} />, title: 'R2 storage', detail: 'Keeps one current image per published asset.' },
  { icon: <BookOpenCheck size={18} />, title: 'Storybook Worker', detail: 'Serves storybook.dune.zone.' },
];

const SECTIONS = [
  { id: 'release', label: 'From merge to live' },
  { id: 'where', label: 'Where it runs' },
  { id: 'images', label: 'Published images' },
  { id: 'schema', label: 'Changing the database' },
  { id: 'trouble', label: 'When something goes wrong' },
  { id: 'more', label: 'Read more' },
];

function DeploymentPage() {
  const navigate = useNavigate();
  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack gap="sm" maw="48rem">
          <PageTitle eyebrow="Contributing" title="How it ships" />
          <Text size="lg">
            Every merge to main is a release. Nobody presses a button: the workflow deploys the database, both Workers
            and Storybook, and checks each one before moving on.
          </Text>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <ContributingGuide
          onPageChange={(page) => void navigate({ to: page.to })}
          current="deployment"
          sections={SECTIONS}
        >
          <Stack gap="xl">
            <Section
              id="release"
              title="From merge to live"
              description="In this order, and each step waits for the one before."
            >
              <>
                <List type="ordered" spacing="md">
                  {STAGES.map((stage) => (
                    <List.Item key={stage.title}>
                      <Text fw={700}>{stage.title}</Text>
                      <Text size="sm" c="dimmed">
                        {stage.detail}
                      </Text>
                    </List.Item>
                  ))}
                </List>
              </>
            </Section>
            <Section id="where" title="Where it runs">
              <>
                <Bullets gap="xl" columns={{ base: 1, sm: 2 }}>
                  {PLACES.map((place) => (
                    <Bullets.Item key={place.title} icon={place.icon} title={place.title} detail={place.detail} />
                  ))}
                </Bullets>
              </>
            </Section>
            <Section
              id="images"
              title="Published images"
              description="Card, token and sheet pictures are drawn by the same renderers the app uses."
            >
              <>
                <Bullets gap="md">
                  <Bullets.Item
                    icon={<ImageUp size={18} />}
                    title="Saving an asset queues a job"
                    detail="Convex stores a publication job; every five minutes the publisher picks up to twenty, screenshots the renderer in a browser and stores the image."
                  />
                  <Bullets.Item
                    icon={<ImageUp size={18} />}
                    title="A renderer revision redraws a whole kind"
                    detail={
                      <>
                        Raising a number in <Code>renderer-revisions.ts</Code> marks every image of that kind stale, and
                        the release queues them all.
                      </>
                    }
                  />
                  <Bullets.Item
                    icon={<ImageUp size={18} />}
                    title="Administrators can stop pickup"
                    detail="The jobs page under the admin area switches whether the publisher takes new work."
                  />
                </Bullets>
              </>
            </Section>
            <Section
              id="schema"
              title="Changing the database"
              description="A breaking change ships in steps, so old and new code never disagree about a record."
            >
              <>
                <List type="ordered" spacing="xs">
                  <List.Item>Widen the schema so it accepts both shapes, and deploy code that reads both.</List.Item>
                  <List.Item>Migrate the records; every deploy runs the migrations it lists.</List.Item>
                  <List.Item>Check that no record of the old shape is left.</List.Item>
                  <List.Item>Narrow the schema and remove the old reading code.</List.Item>
                </List>
              </>
            </Section>
            <Section id="trouble" title="When something goes wrong" description="We fix forward; there is no rollback.">
              <>
                <Stack gap="sm">
                  <Text>
                    A fix ships as a new release, the same way as any other change. The game Worker and the site Worker
                    move together and are never rolled back on their own.
                  </Text>
                  <Text>
                    Browser files from earlier releases stay available for at least seven days, so a page that is
                    already open keeps working after a deploy.
                  </Text>
                </Stack>
              </>
            </Section>
            <Section id="more" title="Read more">
              <>
                <List spacing="xs">
                  <List.Item>
                    <Anchor href={`${DOCS}/docs/deployment.md`}>Deployment</Anchor>, every step in full
                  </List.Item>
                  <List.Item>
                    <Anchor href={`${DOCS}/docs/convex-migrations.md`}>Convex migrations</Anchor>
                  </List.Item>
                  <List.Item>
                    <Anchor href={`${DOCS}/workers/publisher/README.md`}>The publisher</Anchor>
                  </List.Item>
                  <List.Item>
                    <Anchor href={`${DOCS}/docs/technical/play-operations.md`}>Running hosted games</Anchor>
                  </List.Item>
                </List>
              </>
            </Section>
          </Stack>
        </ContributingGuide>
      </PageLayout.Content>
    </PageLayout>
  );
}
