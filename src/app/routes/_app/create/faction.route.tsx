import { Anchor, Button, Code, Group, List, Stack, Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { TopicIcon } from '@ui/content/TopicIcon';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { PageLayout } from '@ui/layout/PageLayout';
import { ArrowRight, Lightbulb } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { publicPageHead } from '@app/routes/publicPage';
import { factionAuthoringChapters } from '@app/widgets/faction-editor/factionAuthoringContract';
import type { FactionAuthoringChapterId } from '@app/widgets/faction-editor/factionAuthoringContract';
import { AllianceCard } from '@game/assets/faction/alliance/Alliance';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { card as cardSize } from '@game/data/sizes';

import styles from './faction.module.css';

export const Route = createFileRoute('/_app/create/faction')({
  ssr: true,
  head: () =>
    publicPageHead({
      name: 'How to create a custom faction for the Dune board game',
      kind: 'Tutorial',
      pathname: '/create/faction',
      description:
        'A step-by-step tutorial for making your own homebrew Dune faction: name, logo, leaders, troops, alliance, rules and advantages, then a printable faction sheet to share.',
      social: { kind: 'Tutorial', shape: 'portrait' },
      trail: [{ name: 'Create custom content', pathname: '/create' }],
    }),
  component: FactionTutorialPage,
});

type Step = {
  id: string;
  topic: TopicIconTopic;
  title: string;
  /** The faction creator tab this step happens on; its label comes from the creator itself, so a renamed tab renames the step. */
  chapter?: FactionAuthoringChapterId;
  body: ReactNode;
  tip?: ReactNode;
};

function chapterLabel(chapter: FactionAuthoringChapterId): string {
  return factionAuthoringChapters.find((candidate) => candidate.id === chapter)!.label;
}

const STEPS: readonly Step[] = [
  {
    id: 'sign-in',
    topic: 'identity',
    title: 'Sign in and open the faction creator',
    body: (
      <>
        <Text>
          A faction belongs to the account that made it, so the creator asks you to{' '}
          <Anchor renderRoot={(props) => <Link {...props} to="/auth/login" />}>sign in</Anchor> first. Then open{' '}
          <Anchor renderRoot={(props) => <Link {...props} to="/factions/create" />}>the faction creator</Anchor>.
        </Text>
        <Text>
          The creator is one form split into tabs. The left side holds the fields; the right side draws the piece you
          are working on, so every change shows up as you type. You do not have to fill the tabs in order, and nothing
          is public until you save.
        </Text>
      </>
    ),
    tip: (
      <>
        Rather start from a faction that already exists? Use <strong>Load existing faction</strong> in the toolbar to
        copy any faction from the catalogue into your draft, then change what you like. The copy is yours; the original
        stays as it was.
      </>
    ),
  },
  {
    id: 'identity',
    topic: 'identity',
    chapter: 'identity',
    title: 'Name it and give it a look',
    body: (
      <>
        <Text>
          The <strong>name</strong> is printed on every piece and becomes the faction&rsquo;s web address, so pick it
          before you share a link. Names may repeat; each faction still gets an address of its own.
        </Text>
        <Text>
          Pick a <strong>logo</strong> from the symbol library. It goes on the faction token, the leader tokens and the
          shield. Then choose a <strong>background</strong>: a texture with two colours laid over it, which every token
          and card is painted on. The <strong>faction sheet theme</strong> colour is for headings on the sheet.
        </Text>
      </>
    ),
    tip: (
      <>
        Two colours close in brightness read as one rich texture; far apart, they read as a pattern. The{' '}
        <Anchor
          renderRoot={(props) => (
            <Link {...props} to="/blog/$postSlug" params={{ postSlug: 'dune-board-game-style-guide' }} />
          )}
        >
          style guide
        </Anchor>{' '}
        lists the colours and textures of every official faction.
      </>
    ),
  },
  {
    id: 'faction-leader',
    topic: 'factionLeader',
    chapter: 'factionLeader',
    title: 'Choose a faction leader',
    body: (
      <Text>
        Every faction has one faction leader, the character who stands for it. Give them a name and a portrait from the
        portrait library. The faction leader is drawn on the faction shield.
      </Text>
    ),
  },
  {
    id: 'leaders',
    topic: 'leaders',
    chapter: 'leaders',
    title: 'Add supporting leaders',
    body: (
      <>
        <Text>
          Supporting leaders are the ones that fight in battles. Five is what the official factions have, but anything
          from none to ten works. Each one needs a name, a portrait and a <strong>strength</strong>: a whole number, a
          single character such as <Code>X</Code>, or blank to leave it off.
        </Text>
        <Text>Drag the rows to change their order. Each leader becomes a leader token and a traitor card.</Text>
      </>
    ),
  },
  {
    id: 'planets',
    topic: 'planets',
    chapter: 'worlds',
    title: 'Add planets, if your faction has a home',
    body: (
      <Text>
        This tab is optional. A planet has a name, an illustration from the planet library and a short description, and
        it is listed on the faction&rsquo;s page.
      </Text>
    ),
  },
  {
    id: 'troops',
    topic: 'troops',
    chapter: 'forces',
    title: 'Define your troops',
    body: (
      <>
        <Text>
          Most factions have one kind of troop; some have elite troops too. For each kind, pick an icon, describe it and
          set how many tokens are in the box. That count is printed on the sheet as <Code>×20</Code>.
        </Text>
        <Text>
          Then set its battle values: its strength, its strength when supported with spice, and what that support costs.
          A troop that does not fight in battles can say so. If your troop flips to a second side, like the Bene
          Gesserit&rsquo;s advisors and fighters, add a back face with values of its own.
        </Text>
      </>
    ),
  },
  {
    id: 'alliance',
    topic: 'alliance',
    chapter: 'alliance',
    title: 'Write the alliance advantage',
    body: (
      <Text>
        This is the help your faction gives its allies. The text is printed on the alliance card, next to your troop and
        logo. Decals are optional small symbols for the card&rsquo;s corners.
      </Text>
    ),
  },
  {
    id: 'rules',
    topic: 'rules',
    chapter: 'rules',
    title: 'Write the setup and special rules',
    body: (
      <>
        <Text>
          <strong>Starting instructions</strong> say where your troops begin and anything else that happens at setup.{' '}
          <strong>Starting spice</strong> is a number of its own. <strong>Revival instructions</strong> say how many
          troops come back each turn for free.
        </Text>
        <Text>
          The last part is the faction&rsquo;s special Karama power. You can rename the section to Fate if that suits
          your faction better, and give the rule a title of its own.
        </Text>
      </>
    ),
    tip: (
      <>
        Rule text understands a little formatting: <Code>*bold*</Code>, <Code>-italic-</Code> and{' '}
        <Code>_underline_</Code>. The special rule, advantages and alliance text also take a line starting with{' '}
        <Code>- </Code> for a list; setup and revival stay one paragraph each. Words the{' '}
        <Anchor renderRoot={(props) => <Link {...props} to="/glossary" />}>glossary</Anchor> prefers are hinted as you
        type, so your rules read like the rest of the game.
      </>
    ),
  },
  {
    id: 'advantages',
    topic: 'advantages',
    chapter: 'advantages',
    title: 'List the faction advantages',
    body: (
      <Text>
        Advantages are the rules that make your faction play differently. Add one per rule, with an optional title. If
        an advantage can be boosted with a Karama card, describe that in its Karama field. Drag them into the order you
        want them read.
      </Text>
    ),
  },
  {
    id: 'phases',
    topic: 'turn',
    chapter: 'phases',
    title: 'Add your own phases, if you need them',
    body: (
      <Text>
        Optional. If your faction adds a step to the turn, such as a prediction at setup or an action before bidding,
        declare it here with a name and instructions. It is placed before the turn phase or setup step you choose, so
        players know when it happens.
      </Text>
    ),
  },
  {
    id: 'extras',
    topic: 'contents',
    chapter: 'extras',
    title: 'Bring your own cards and tokens',
    body: (
      <Text>
        Some factions need pieces nothing else has: a deck of their own, or special tokens. Make those first with the{' '}
        <Anchor renderRoot={(props) => <Link {...props} to="/assets" />}>card and token creators</Anchor>, then pick
        them here. They come along with the faction when a game is set up.
      </Text>
    ),
  },
  {
    id: 'complexity',
    topic: 'complexityIntermediate',
    chapter: 'complexity',
    title: 'Check the complexity rating',
    body: (
      <Text>
        Dune Zone works out how hard your faction is to play from its rules. If you know better, set the rating by hand;
        readers then see your rating instead.
      </Text>
    ),
  },
  {
    id: 'save',
    topic: 'result',
    title: 'Review the sheet and save',
    body: (
      <>
        <Text>
          Open <strong>Review faction sheet</strong> in the toolbar to see the whole faction as one printable sheet.
          Anything missing is listed at the top of the page; pick a warning to jump to the field.
        </Text>
        <Text>
          Then press <strong>Save faction</strong>. Your faction gets its own page in the{' '}
          <Anchor renderRoot={(props) => <Link {...props} to="/factions" />}>faction catalogue</Anchor>, and within a
          few minutes its faction sheet PDF and images are ready to download and print.
        </Text>
      </>
    ),
  },
  {
    id: 'share',
    topic: 'groups',
    title: 'Share it and keep improving it',
    body: (
      <>
        <Text>
          Send the faction&rsquo;s link to your play group, or print the faction sheet. After the first save you can
          give the faction to a <Anchor renderRoot={(props) => <Link {...props} to="/groups/create" />}>Group</Anchor>,
          so friends can edit it with you.
        </Text>
        <Text>
          A <Anchor renderRoot={(props) => <Link {...props} to="/rulesets" />}>Ruleset</Anchor> collects the factions
          and Rulebooks a group plays with; ask its maintainers to add yours, or start a Ruleset of your own. Each time
          you save, the sheet and images are drawn again, so they always match the latest version.
        </Text>
      </>
    ),
  },
];

/* A made-up faction for the illustration, built from library artwork like any reader's would be. */
const SAMPLE_BACKGROUND: ComponentProps<typeof LeaderToken>['background'] = {
  colors: ['#9c5a1c', '#5a2e0c'],
  definition: 0.5,
  image: '/image/texture/021.jpg',
  influence: 1,
  invert: true,
};

/**
 * Three pieces the creator draws from one faction: a leader token, a troop token and the alliance card.
 * They are drawn by the game's own renderers, so the picture cannot drift from what the creator makes.
 */
function WhatYouMake() {
  return (
    <figure
      className={styles.pieces}
      aria-label="A leader token, a troop token and an alliance card from one sample faction"
    >
      <div className={styles.disc}>
        <LeaderToken
          background={SAMPLE_BACKGROUND}
          image="/image/leader/alien/eeriva.png"
          logo="/vector/generic/axes.svg"
          name="Warden Ishara"
          strength="5"
        />
      </div>
      <div className={styles.disc}>
        <TroopToken
          background={SAMPLE_BACKGROUND}
          image="/vector/troop/desert-pathfinder.svg"
          star={undefined}
          hue={undefined}
          striped={false}
        />
      </div>
      <div className={styles.card}>
        <CanvasScale canvasWidth={cardSize.width} canvasHeight={cardSize.height} rounded>
          <AllianceCard
            background={SAMPLE_BACKGROUND}
            logo="/vector/generic/axes.svg"
            title="Sand Wardens"
            troop="/vector/troop/desert-pathfinder.svg"
            decals={[]}
            text={'Your ally may move one extra territory.\n\nYou may give your ally spice at any time.'}
          />
        </CanvasScale>
      </div>
      <figcaption className={styles.caption}>
        One faction, many pieces: a leader token, a troop token and the alliance card, all drawn from the same form.
      </figcaption>
    </figure>
  );
}

function FactionTutorialPage() {
  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack gap="sm">
          <PageTitle eyebrow="Tutorial" title="Create a custom Dune faction" />
          <Text size="lg">
            Make a homebrew faction for the Dune board game, step by step, and get its faction sheet, shield, tokens and
            cards to print or share.
          </Text>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <div className={styles.layout}>
          <nav className={styles.contents} aria-label="Tutorial steps">
            <Text size="sm" fw={700} mb="xs">
              In this tutorial
            </Text>
            <List type="ordered" size="sm" spacing={4}>
              {STEPS.map((step) => (
                <List.Item key={step.id}>
                  <Anchor href={`#${step.id}`} size="sm">
                    {step.title}
                  </Anchor>
                </List.Item>
              ))}
            </List>
          </nav>
          <Stack gap="xl" className={styles.steps}>
            <Section title="What you will make">
              <Stack gap="md">
                <Text>
                  A faction on Dune Zone is one form. From it, the site draws everything you need at the table: the
                  faction sheet, the shield, a token and a traitor card for every leader, the troop tokens, the faction
                  token and the alliance card. Change the logo once and every piece follows.
                </Text>
                <WhatYouMake />
                <Text>
                  You need an account and an idea. A first faction takes about half an hour; the rules take as long as
                  your playtesting does.
                </Text>
              </Stack>
            </Section>
            {STEPS.map((step, index) => (
              <Section
                key={step.id}
                id={step.id}
                eyebrow={step.chapter ? `Step ${index + 1} · ${chapterLabel(step.chapter)} tab` : `Step ${index + 1}`}
                title={step.title}
                icon={<TopicIcon topic={step.topic} size={20} />}
              >
                <Stack gap="sm" className={styles.prose}>
                  {step.body}
                  {step.tip ? (
                    <aside className={styles.tip}>
                      <Lightbulb size={18} aria-hidden className={styles.tipIcon} />
                      <Text size="sm">{step.tip}</Text>
                    </aside>
                  ) : null}
                </Stack>
              </Section>
            ))}
            <Section title="Ready?">
              <Stack gap="md">
                <Text>
                  Open the creator and start with a name. You can save, leave and come back to it as often as you like.
                </Text>
                <Group>
                  <Button
                    rightSection={<ArrowRight size={16} aria-hidden />}
                    renderRoot={(props) => <Link {...props} to="/factions/create" />}
                  >
                    Create your faction
                  </Button>
                  <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/create" />}>
                    More things to make
                  </Button>
                </Group>
              </Stack>
            </Section>
          </Stack>
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}
