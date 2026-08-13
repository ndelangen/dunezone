import { List, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';

export const Route = createFileRoute('/_app/privacy/')({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PageLayout>
      <PageLayout.Header>
        <SimpleGrid cols={{ base: 1, sm: 2 }} maw="58rem" spacing="xl" w="100%">
          <Stack gap="sm" justify="center">
            <Text fw={700} size="xs" tt="uppercase">
              Public and private
            </Text>
            <h1>Privacy</h1>
            <Text size="lg">
              Signing in creates a public profile. Anything you publish can be seen and shared by
              anyone.
            </Text>
          </Stack>
          <Paper bg="rgba(255, 255, 255, 0.82)" p="lg" radius="md" shadow="sm">
            <Stack gap="sm">
              <Title order={2} size="h3">
                Two firm promises
              </Title>
              <List spacing="xs">
                <List.Item>We never show your email address.</List.Item>
                <List.Item>We never sell your data.</List.Item>
              </List>
              <Text c="dimmed" size="sm">
                There is no private-profile setting.
              </Text>
            </Stack>
          </Paper>
        </SimpleGrid>
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="xl">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Surface padding="xl">
              <Stack gap="md">
                <Title order={2}>What we keep private</Title>
                <Text>We need a small amount of private information to run your account:</Text>
                <List spacing="sm">
                  <List.Item>
                    Your email address, if Google or Discord gives it to us when you sign in.
                  </List.Item>
                  <List.Item>
                    Whether you signed in with Google or Discord, and the account ID they give us.
                  </List.Item>
                  <List.Item>
                    The sign-in records needed to keep you logged in and protect your account.
                  </List.Item>
                  <List.Item>
                    Basic technical details such as your IP address, browser, when you visited, and
                    errors that happened.
                  </List.Item>
                </List>
                <Text>
                  Your email address is only used for your account and sign-in. It will not appear
                  on your profile or anywhere else on the public website.
                </Text>
              </Stack>
            </Surface>

            <Surface padding="xl">
              <Stack gap="md">
                <Title order={2}>What everyone can see</Title>
                <Text>Your public profile can show:</Text>
                <List spacing="sm">
                  <List.Item>Your screen name, profile picture, and profile link.</List.Item>
                  <List.Item>
                    When you joined and when your public work was created or changed.
                  </List.Item>
                  <List.Item>Your active group memberships.</List.Item>
                  <List.Item>
                    The factions, groups, and rulesets you create, own, or help maintain.
                  </List.Item>
                  <List.Item>
                    The questions you ask, the answers you give, and whether an answer was picked.
                  </List.Item>
                  <List.Item>
                    Activity totals and the links between you and the things you contribute.
                  </List.Item>
                </List>
                <Text>
                  The first time you sign in, we use the name and picture from Google or Discord to
                  set up your public profile.
                </Text>
              </Stack>
            </Surface>
          </SimpleGrid>

          <Surface padding="xl">
            <Stack gap="md">
              <Title order={2}>Your choices</Title>
              <List spacing="sm">
                <List.Item>
                  You can change your screen name and profile picture in your profile settings.
                </List.Item>
                <List.Item>
                  Changing your screen name may also change the link to your profile.
                </List.Item>
                <List.Item>Do not share anything here that you want to keep private.</List.Item>
              </List>
            </Stack>
          </Surface>

          <Surface padding="xl">
            <Stack gap="md">
              <Title order={2}>Your data rights</Title>
              <Text>We follow the GDPR rules that protect your personal data.</Text>
              <Text>
                You can ask us what personal data we have about you. You can also ask us to correct
                it, give you a copy, or delete it.
              </Text>
              <Text fw={700}>
                If you ask us to delete your data, we will remove your account, profile,
                contributions, memberships, sign-in details, and any other personal data we control.
              </Text>
              <Text>
                We may first ask you to prove that the account is yours. It can take a little longer
                for deleted data to disappear from backups and security logs. We cannot delete
                copies that other people made while your work was public.
              </Text>
              <Text>
                To make a request, contact the Dune Zone site owner. Do not include your password or
                other private sign-in details in your message.
              </Text>
            </Stack>
          </Surface>

          <Surface padding="xl">
            <Stack gap="md">
              <Title order={2}>What we do with the data</Title>
              <Text>
                We only use the data to let you sign in, run the website, show who made each
                contribution, keep the website safe, and fix problems.
              </Text>
              <Text>
                Google or Discord handles sign-in. Convex stores the data. Cloudflare helps deliver
                the website. They receive the information they need to do those jobs.
              </Text>
              <Text>
                We do not sell your data. Your profile and contributions are free for people to
                view, but we do not sell access to them.
              </Text>
            </Stack>
          </Surface>

          <Surface padding="xl">
            <Stack gap="md">
              <Title order={2}>Code of conduct</Title>
              <Text>Be kind and treat other people with respect.</Text>
              <Text>We do not allow:</Text>
              <List spacing="sm">
                <List.Item>Harassment, bullying, threats, or hateful behaviour.</List.Item>
                <List.Item>
                  Attacks on people because of who they are, where they come from, or what they
                  believe.
                </List.Item>
                <List.Item>Sharing someone else&apos;s private information.</List.Item>
                <List.Item>
                  Spam, scams, impersonation, or attempts to damage the website.
                </List.Item>
                <List.Item>Illegal content or anything that puts another person at risk.</List.Item>
              </List>
              <Text fw={700}>These rules are not optional.</Text>
              <Text>
                We may remove content and suspend or delete accounts when these rules are broken. We
                will not knowingly allow a violation to remain on Dune Zone.
              </Text>
            </Stack>
          </Surface>

          <Surface padding="xl">
            <Stack gap="md">
              <Title order={2}>Copyright</Title>
              <Text>
                Do not upload or publish something if doing so would infringe another person&apos;s
                copyright.
              </Text>
              <Text>
                Only share work that you made, have permission to use, or are allowed to use by law.
                We may remove work that breaks this rule.
              </Text>
              <Text>
                We view original, non-commercial fan-made game assets that transform existing
                material into something new as fair use. That is our view, not a promise that every
                derivative work is legally fair use. Each work and each use is different.
              </Text>
              <Text>
                Uploading an official image, scan, book, rules text, or other person&apos;s work
                without meaningful changes is not allowed unless you have permission or another
                clear legal right to use it.
              </Text>
            </Stack>
          </Surface>

          <Surface padding="xl">
            <Stack gap="md">
              <Title order={2}>A free hobby project</Title>
              <Text>Dune Zone is a hobby project. You can use it free of charge.</Text>
              <Text>
                We will do our best to keep it working, but there is no uptime guarantee. The
                website may be slow, unavailable, or stop running without notice.
              </Text>
              <Text>
                Please do not use Dune Zone as the only place where you keep something important.
              </Text>
            </Stack>
          </Surface>

          <Text c="dimmed" size="sm">
            Last updated 27 July 2026. If anything changes, we will update this page.
          </Text>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
