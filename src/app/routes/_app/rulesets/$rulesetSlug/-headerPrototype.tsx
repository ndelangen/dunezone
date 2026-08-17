/*
 * PROTOTYPE — throwaway. Three variants of the merged ruleset PageHeader (wayfinder #434), switchable via
 * `?variant=A|B|C` on the real ruleset detail route so they are judged against real data and real density.
 *
 * The question: what does the band look like once "At a glance" and "Stewardship" move into it? Already decided
 * before this prototype — three real stats, owner once, the maintaining group as a link with a compact membership
 * badge, and no "Request membership" button. Open: whether the band stays compact, how the stats read at header
 * scale, and how it degrades narrow.
 *
 * The winner gets rewritten properly into the route; the losers and the switcher go to the prototype branch.
 */
import { Anchor, Avatar, Box, Divider, Group, Image, Stack, Text, Title } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { ProfileLink } from '@ui/content/ProfileLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { TopicIcon } from '@ui/content/TopicIcon';
import { Stats } from '@ui/list/Stats';
import { Surface } from '@ui/surface';
import { CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, Layers3, UsersRound } from 'lucide-react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import type { AssignedGroupSummary } from '@db/groups';
import type { RulesetDetailPageData } from '@db/rulesets';

type ProfileSummary = RulesetDetailPageData['owner'];

import styles from '../RulesetDetail.module.css';

export const HEADER_VARIANTS = ['A', 'B', 'C'] as const;
export type HeaderVariant = (typeof HEADER_VARIANTS)[number];

const VARIANT_NAMES: Record<HeaderVariant, string> = {
  A: 'Stat rail on the right',
  B: 'Stats as a byline under the title',
  C: 'One dense meta line, small cover',
};

export type HeaderPrototypeProps = {
  name: string;
  imageCover: string | null;
  owner: ProfileSummary | null;
  assignedGroup: AssignedGroupSummary | null;
  membership: 'none' | 'pending' | 'active';
  factionCount: number;
  questionCount: number;
  answeredCount: number;
};

function statItems({ factionCount, questionCount, answeredCount }: HeaderPrototypeProps) {
  return [
    {
      key: 'factions',
      icon: <Layers3 size={17} aria-hidden />,
      value: factionCount,
      label: `${factionCount} ${factionCount === 1 ? 'faction' : 'factions'}`,
      name: 'factions',
    },
    {
      key: 'questions',
      icon: <CircleHelp size={17} aria-hidden />,
      value: questionCount,
      label: `${questionCount} ${questionCount === 1 ? 'question' : 'questions'}`,
      name: 'questions',
    },
    {
      key: 'answered',
      icon: <CheckCircle2 size={17} aria-hidden />,
      value: answeredCount,
      label: `${answeredCount} answered ${answeredCount === 1 ? 'question' : 'questions'}`,
      name: 'answered',
    },
  ];
}

/** The membership chip beside the group. Absent when the viewer is neither member nor pending. */
function MembershipChip({ membership }: { membership: HeaderPrototypeProps['membership'] }) {
  if (membership === 'active') {
    return <StatusBadge tone="positive">Member</StatusBadge>;
  }
  if (membership === 'pending') {
    return <StatusBadge tone="pending">Pending</StatusBadge>;
  }
  return null;
}

function GroupLink({ assignedGroup }: { assignedGroup: AssignedGroupSummary | null }) {
  if (!assignedGroup) {
    return (
      <Text size="sm" c="dimmed">
        No maintaining group
      </Text>
    );
  }
  return (
    <Anchor
      size="sm"
      fw={600}
      /* White, not the dune accent: this line sits on artwork, so the accent loses against the sand while the owner's name beside it reads white. */
      c="white"
      renderRoot={(rootProps) => <Link {...rootProps} to="/groups/$groupSlug" params={{ groupSlug: assignedGroup.slug }} />}
    >
      {assignedGroup.name}
    </Anchor>
  );
}

function Cover({ imageCover, name, size }: { imageCover: string | null; name: string; size: 'full' | 'chip' }) {
  return (
    <Surface className={size === 'full' ? styles.rulesetHeadCover : styles.protoCoverChip}>
      {imageCover ? (
        <Image src={imageCover} fallbackSrc="/image/background/card-large.jpg" alt={`Cover for ${name}`} className={styles.coverImage} />
      ) : null}
      <span className={styles.rulesetHeadGlyph}>
        <TopicIcon topic="rulesets" size={size === 'full' ? 28 : 18} />
      </span>
    </Surface>
  );
}

/**
 * The ruleset's own cover as an avatar — no topic glyph over it.
 * Rounded square rather than a circle, since a cover is artwork and a circular crop eats its corners;
 * `Avatar` still supplies the fallback when a ruleset has no cover.
 */
function CoverAvatar({ imageCover, name }: { imageCover: string | null; name: string }) {
  return <Avatar src={imageCover} alt={`Cover for ${name}`} radius="md" size={32} name={name} color="dune" />;
}

function Breadcrumb() {
  return (
    <Anchor size="sm" fw={600} renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}>
      Rulesets
    </Anchor>
  );
}

function OwnerLine({ owner }: { owner: ProfileSummary | null }) {
  return owner ? (
    <ProfileLink slug={owner.slug} username={owner.username} avatar_url={owner.avatar_url} />
  ) : (
    <Text size="sm">Unknown</Text>
  );
}

/**
 * A — the stats keep their labelled column, pushed to the right of the band as a rail.
 *
 * Two fixes over the first draft, both about the band's context rather than the arrangement:
 * the rail sits on its own `Surface`, because `Stats`' column labels are `c="dimmed"` for a Card's dark ground and
 * vanish over the dune artwork — and the band is a grid that drops the rail onto its own row when narrow, since a
 * `nowrap` row squeezed the title into one letter per line at 375px.
 */
export function HeaderVariantA(props: HeaderPrototypeProps) {
  return (
    <Box className={styles.protoHeadA}>
      <Box className={styles.protoHeadACover}>
        <Cover imageCover={props.imageCover} name={props.name} size="full" />
      </Box>
      <Stack gap={6} miw={0} className={styles.protoHeadAText}>
        <Breadcrumb />
        <Title order={1} className={styles.rulesetTitle}>
          {props.name}
        </Title>
        <Group gap="xs" wrap="wrap">
          <Text size="sm" c="dimmed">
            Maintained by
          </Text>
          <OwnerLine owner={props.owner} />
          <Divider orientation="vertical" />
          <UsersRound size={15} aria-hidden />
          <GroupLink assignedGroup={props.assignedGroup} />
          <MembershipChip membership={props.membership} />
          {/*
            Narrow only: the counts join the line they would otherwise sit above. A compact band holds three rows, and
            the labelled rail needs a fourth — so below the breakpoint the rail gives way to the strip in place.
          */}
          <Box className={styles.protoStatStripInline}>
            <Stats items={statItems(props)} orientation="row" />
          </Box>
        </Group>
      </Stack>
      <Surface padding="sm" className={styles.protoStatRail}>
        <Stats items={statItems(props)} orientation="column" />
      </Surface>
    </Box>
  );
}

/** B — stewardship and the stats become two stacked byline rows under the title; the stats use the row strip. */
export function HeaderVariantB(props: HeaderPrototypeProps) {
  return (
    <Group wrap="nowrap" align="center" gap="lg" className={styles.protoHeadB}>
      <Cover imageCover={props.imageCover} name={props.name} size="full" />
      <Stack gap={8} miw={0} style={{ flex: 1 }}>
        <Breadcrumb />
        <Title order={1} className={styles.rulesetTitle}>
          {props.name}
        </Title>
        <Group gap="xs" wrap="wrap">
          <Text size="sm" c="dimmed">
            Maintained by
          </Text>
          <OwnerLine owner={props.owner} />
          <Text size="sm" c="dimmed">
            in
          </Text>
          <GroupLink assignedGroup={props.assignedGroup} />
          <MembershipChip membership={props.membership} />
        </Group>
        <Group gap="lg" wrap="wrap">
          <Stats items={statItems(props)} orientation="row" />
        </Group>
      </Stack>
    </Group>
  );
}

/** C — the cover drops to a chip, the title leads, and everything else is one dense meta line. */
export function HeaderVariantC(props: HeaderPrototypeProps) {
  return (
    <Stack gap={4} className={styles.protoHeadC}>
      <Breadcrumb />
      {/* The avatar rides with the name, not the breadcrumb: it is the ruleset's identity, and row one stays text-height. */}
      <Group gap="sm" wrap="nowrap" align="center">
        <CoverAvatar imageCover={props.imageCover} name={props.name} />
        <Title order={1} className={styles.rulesetTitle}>
          {props.name}
        </Title>
      </Group>
      <Group gap="sm" wrap="wrap" align="center">
        <Eyebrow>Maintained by</Eyebrow>
        <OwnerLine owner={props.owner} />
        <Divider orientation="vertical" />
        {/*
          A group glyph rather than a group avatar: `UsersRound` is what the Stewardship card, the assign popover and
          the group page already use, and the `groups` table has no image of its own to show.
        */}
        <Group gap={6} wrap="nowrap" align="center">
          <UsersRound size={15} aria-hidden />
          <GroupLink assignedGroup={props.assignedGroup} />
        </Group>
        <MembershipChip membership={props.membership} />
        <Divider orientation="vertical" />
        <Stats items={statItems(props)} orientation="row" />
      </Group>
    </Stack>
  );
}

export function HeaderPrototype({ variant, ...props }: HeaderPrototypeProps & { variant: HeaderVariant }) {
  if (variant === 'A') {
    return <HeaderVariantA {...props} />;
  }
  if (variant === 'B') {
    return <HeaderVariantB {...props} />;
  }
  return <HeaderVariantC {...props} />;
}

/** The floating switcher. Dev-only, and visually nothing like the design it sits over. */
export function HeaderPrototypeSwitcher({
  current,
  onSelect,
}: {
  current: HeaderVariant;
  onSelect: (next: HeaderVariant) => void;
}): ReactNode {
  useEffect(() => {
    const step = (delta: number) => {
      const index = HEADER_VARIANTS.indexOf(current);
      const next = HEADER_VARIANTS[(index + delta + HEADER_VARIANTS.length) % HEADER_VARIANTS.length];
      if (next) {
        onSelect(next);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        step(-1);
      }
      if (event.key === 'ArrowRight') {
        step(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, onSelect]);

  if (!import.meta.env.DEV) {
    return null;
  }

  const step = (delta: number) => {
    const index = HEADER_VARIANTS.indexOf(current);
    const next = HEADER_VARIANTS[(index + delta + HEADER_VARIANTS.length) % HEADER_VARIANTS.length];
    if (next) {
      onSelect(next);
    }
  };

  return (
    <div className={styles.protoSwitcher}>
      <button type="button" aria-label="Previous header variant" onClick={() => step(-1)}>
        <ChevronLeft size={16} aria-hidden />
      </button>
      <span>
        {current} — {VARIANT_NAMES[current]}
      </span>
      <button type="button" aria-label="Next header variant" onClick={() => step(1)}>
        <ChevronRight size={16} aria-hidden />
      </button>
    </div>
  );
}
