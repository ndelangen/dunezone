import { Anchor, List, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';

import { publicPageHead } from '@app/routes/publicPage';

export const Route = createFileRoute('/_app/privacy/')({
  ssr: true,
  head: () =>
    publicPageHead({
      name: 'Privacy',
      pathname: '/privacy',
      description: 'What Dune Zone keeps private, what everyone can see, your data rights, and the code of conduct.',
      social: { kind: 'Dune Zone', shape: 'portrait' },
    }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PageLayout>
      <PageLayout.Header>
        <SimpleGrid cols={{ base: 1, sm: 2 }} maw="58rem" spacing="xl" w="100%">
          <Stack gap="sm" justify="center">
            <PageTitle eyebrow="Public and private" title="Privacy" />
            <Text size="lg">
              Signing in creates a public profile. Anything you publish can be seen and shared by anyone.
            </Text>
          </Stack>
          <Surface padding="lg">
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
          </Surface>
        </SimpleGrid>
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="xl">
          <Card padding="xl" title="Who is responsible for your data">
            <Stack gap="md">
              <Text>
                Dune Zone is operated by Norbert de Langen, who is the controller responsible for the personal data
                described on this page.
              </Text>
              <Text>
                For privacy questions or data requests, email{' '}
                <Anchor href="mailto:support@dune.zone">support@dune.zone</Anchor>.
              </Text>
            </Stack>
          </Card>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Surface padding="xl">
              <Stack gap="md">
                <Title order={2}>What we keep private</Title>
                <Text>We need a small amount of private information to run your account:</Text>
                <List spacing="sm">
                  <List.Item>
                    An email address retained from an earlier sign-in, if one was supplied. Current sign-in requests
                    identity access only.
                  </List.Item>
                  <List.Item>Whether you signed in with Google or Discord, and the account ID they give us.</List.Item>
                  <List.Item>The sign-in records needed to keep you logged in and protect your account.</List.Item>
                  <List.Item>
                    Basic technical details such as your IP address, browser, when you visited, and errors that
                    happened.
                  </List.Item>
                </List>
                <Text>
                  Your email address is only used for your account and sign-in. It will not appear on your profile or
                  anywhere else on the public website.
                </Text>
              </Stack>
            </Surface>

            <Surface padding="xl">
              <Stack gap="md">
                <Title order={2}>What everyone can see</Title>
                <Text>Your public profile can show:</Text>
                <List spacing="sm">
                  <List.Item>Your screen name, profile picture, and profile link.</List.Item>
                  <List.Item>When you joined and when your public work was created or changed.</List.Item>
                  <List.Item>Your active group memberships.</List.Item>
                  <List.Item>The factions, groups, and rulesets you create, own, or help maintain.</List.Item>
                  <List.Item>The questions you ask, the answers you give, and whether an answer was picked.</List.Item>
                  <List.Item>Activity totals and the links between you and the things you contribute.</List.Item>
                </List>
                <Text>
                  The first time you sign in, we use your sign-in provider's name and available profile picture to set
                  up your public profile.
                </Text>
              </Stack>
            </Surface>
          </SimpleGrid>

          <Surface padding="xl">
            <Stack gap="md">
              <Title order={2}>Your choices</Title>
              <List spacing="sm">
                <List.Item>You can change your screen name and profile picture in your profile settings.</List.Item>
                <List.Item>Changing your screen name may also change the link to your profile.</List.Item>
                <List.Item>Do not share anything here that you want to keep private.</List.Item>
              </List>
            </Stack>
          </Surface>

          <Surface padding="xl">
            <Stack gap="md">
              <Title order={2}>Your data rights</Title>
              <Text>The GDPR gives you rights over your personal data.</Text>
              <Text>
                You can ask us what personal data we have about you. You can also ask us to correct it, give you a copy,
                or erase it. Where the law applies, you can ask us to restrict processing, provide a portable copy, or
                stop processing based on our legitimate interests.
              </Text>
              <Text fw={700}>
                Deleting your account through the website closes it and hides your public profile. It does not
                automatically erase all stored personal data. Contact us if you want your personal data erased.
              </Text>
              <Text>
                When you close your account, you can transfer the Groups, factions, and rulesets you own to another
                owner, or remove them from public view. Work you contributed to but do not own can remain. We will
                assess an erasure request separately, including personal information in that work.
              </Text>
              <Text>
                We may ask you to prove that the account is yours. We normally respond to rights requests within one
                month. If a request needs more time or a legal exception applies, we will explain why. We cannot erase
                copies that other people made while your work was public.
              </Text>
              <Text>
                To make a request, email <Anchor href="mailto:support@dune.zone">support@dune.zone</Anchor>. Do not
                include your password or other private sign-in details in your message.
              </Text>
              <Text>
                You can also complain to the{' '}
                <Anchor href="https://autoriteitpersoonsgegevens.nl/en">Autoriteit Persoonsgegevens</Anchor>, the Dutch
                data protection authority, or the data protection authority where you live or work in the EU.
              </Text>
            </Stack>
          </Surface>

          <Surface padding="xl">
            <Stack gap="md">
              <Title order={2}>What we do with the data</Title>
              <Text>
                We only use the data to let you sign in, run the website, show who made each contribution, keep the
                website safe, fix problems, and understand website traffic and performance.
              </Text>
              <Text>
                We process the account and contribution data needed to provide the service you request under GDPR
                Article 6(1)(b). We rely on legitimate interests under Article 6(1)(f) for security, troubleshooting,
                and limited traffic measurement: protecting accounts, preventing abuse, and understanding how to keep
                the website useful and working. You can object to processing based on those interests.
              </Text>
              <Text>
                Google or Discord handles sign-in. Convex stores application data. Cloudflare hosts and protects the
                website and provides Web Analytics. These providers receive the information needed for those jobs.
              </Text>
              <Text>
                We do not sell your data. Your profile and contributions are free for people to view, but we do not sell
                access to them.
              </Text>
            </Stack>
          </Surface>

          <Card padding="xl" title="Website analytics">
            <Stack gap="md">
              <Text>
                We use Cloudflare Web Analytics to understand which pages people visit and how quickly the website
                responds. Measurements cover page views, referring websites, country, browser, device type, operating
                system, and page performance. This includes visitors in the European Union.
              </Text>
              <Text>
                Cloudflare says Web Analytics uses no cookies or local storage and does not track individual visitors
                across visits or websites. We do not send your account ID, email address, or profile details as
                analytics fields, or join the reports to your account. Page paths can include public profile or content
                names. Cloudflare also receives the connection information needed to deliver the website and receive
                measurements, including your IP address; that is separate from identifying visitors in analytics.
              </Text>
              <Text>
                The analytics dashboard makes the previous six months of reports available. This reporting window is
                separate from the retention of account data and security logs. Read{' '}
                <Anchor href="https://developers.cloudflare.com/web-analytics/about/">
                  about Cloudflare Web Analytics
                </Anchor>{' '}
                and its <Anchor href="https://developers.cloudflare.com/web-analytics/faq/">data history</Anchor>.
              </Text>
            </Stack>
          </Card>

          <Card padding="xl" title="How long data stays">
            <Stack gap="md">
              <Text>
                We keep account and contribution records while they are needed to run your account and the work you
                share. Closing an account marks its records as deleted; stored records can remain until an erasure
                request is handled. Shared work can remain under another owner.
              </Text>
              <Text>
                We use security logs to diagnose failures and investigate abuse, and backups to recover from data loss
                or service failure. Their retention depends on the provider's configured storage window, the recovery
                window needed, and whether records are needed for an active security investigation or legal obligation.
                We will explain any exception that affects an erasure request.
              </Text>
            </Stack>
          </Card>

          <Card padding="xl" title="Providers and international processing">
            <Stack gap="md">
              <Text>
                Our providers may process information outside the European Economic Area, including in the United
                States. Their data-protection terms describe the safeguards for international transfers, including the
                European Commission&apos;s standard contractual clauses where applicable. You can read the{' '}
                <Anchor href="https://www.cloudflare.com/cloudflare-customer-dpa/">
                  Cloudflare data processing addendum
                </Anchor>{' '}
                and the{' '}
                <Anchor href="https://www.convex.com/data-protection-addendum">Convex data protection addendum</Anchor>,
                or contact us for information about the safeguards used for your data.
              </Text>
            </Stack>
          </Card>

          <Surface padding="xl">
            <Stack gap="md">
              <Title order={2}>Code of conduct</Title>
              <Text>Be kind and treat other people with respect.</Text>
              <Text>We do not allow:</Text>
              <List spacing="sm">
                <List.Item>Harassment, bullying, threats, or hateful behaviour.</List.Item>
                <List.Item>
                  Attacks on people because of who they are, where they come from, or what they believe.
                </List.Item>
                <List.Item>Sharing someone else&apos;s private information.</List.Item>
                <List.Item>Spam, scams, impersonation, or attempts to damage the website.</List.Item>
                <List.Item>Illegal content or anything that puts another person at risk.</List.Item>
              </List>
              <Text fw={700}>These rules are not optional.</Text>
              <Text>
                We may remove content and suspend or delete accounts when these rules are broken. We will not knowingly
                allow a violation to remain on Dune Zone.
              </Text>
            </Stack>
          </Surface>

          <Surface padding="xl">
            <Stack gap="md">
              <Title order={2}>Copyright</Title>
              <Text>
                Do not upload or publish something if doing so would infringe another person&apos;s copyright.
              </Text>
              <Text>
                Only share work that you made, have permission to use, or are allowed to use by law. We may remove work
                that breaks this rule.
              </Text>
              <Text>
                We view original, non-commercial fan-made game assets that transform existing material into something
                new as fair use. That is our view, not a promise that every derivative work is legally fair use. Each
                work and each use is different.
              </Text>
              <Text>
                Uploading an official image, scan, book, rules text, or other person&apos;s work without meaningful
                changes is not allowed unless you have permission or another clear legal right to use it.
              </Text>
            </Stack>
          </Surface>

          <Surface padding="xl">
            <Stack gap="md">
              <Title order={2}>A free hobby project</Title>
              <Text>Dune Zone is a hobby project. You can use it free of charge.</Text>
              <Text>
                We will do our best to keep it working, but there is no uptime guarantee. The website may be slow,
                unavailable, or stop running without notice.
              </Text>
              <Text>Please do not use Dune Zone as the only place where you keep something important.</Text>
            </Stack>
          </Surface>

          <Text c="dimmed" size="sm">
            Last updated 13 October 2026. If anything changes, we will update this page.
          </Text>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
