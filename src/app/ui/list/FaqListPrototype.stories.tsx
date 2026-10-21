import { Anchor, Badge, Group, NumberInput, Radio, Stack, Switch, Text } from '@mantine/core';
import preview from '@sb/preview';
import { Section } from '@ui/block/Section';
import { formatStableDate } from '@ui/content/dates';
import { FAQ_TAG_LABELS } from '@ui/content/faqTagLabels';
import { InlineFormattedTextSource } from '@ui/content/FormattedText';
import { ProfileLink } from '@ui/content/ProfileLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { Surface } from '@ui/surface';
import { SectionedSurface } from '@ui/surface/SectionedSurface';
import { Box, Check, MessageCircle, Quote } from 'lucide-react';
import { useReducer } from 'react';
import type { CSSProperties, MouseEvent } from 'react';

import styles from './FaqListPrototype.module.css';
import type { PrototypeFaqItem, PrototypePerson } from './FaqListPrototype.stories.fixture';
import { prototypeFaqItems } from './FaqListPrototype.stories.fixture';

/** Three revised prototypes combining accepted-answer previews, author links and asset relationships. */
type Variant = 'rail' | 'reading' | 'compact';
const concepts = {
  rail: {
    title: 'A · Answer rail',
    description: 'An answer-count rail beside the question, accepted answer and its context.',
  },
  reading: {
    title: 'B · Answer and context',
    description: 'Give the answer room to read, with people and assets alongside it on wide containers.',
  },
  compact: {
    title: 'C · Compact discussion',
    description: 'A shorter row with an answer excerpt and the same people and asset links.',
  },
};
type Props = { variant: Variant; comparison?: boolean };
type State = { width: number; across: boolean; empty: boolean; excerptLength: number; selected: string | null };
type Event =
  | { kind: 'resize'; width: number }
  | { kind: 'scope'; across: boolean }
  | { kind: 'empty'; empty: boolean }
  | { kind: 'excerpt'; length: number }
  | { kind: 'select'; selected: string };

function reducer(state: State, event: Event): State {
  switch (event.kind) {
    case 'resize':
      return { ...state, width: event.width };
    case 'scope':
      return { ...state, across: event.across };
    case 'empty':
      return { ...state, empty: event.empty };
    case 'excerpt':
      return { ...state, excerptLength: event.length };
    case 'select':
      return { ...state, selected: event.selected };
  }
}

type ListProps = {
  items: PrototypeFaqItem[];
  across: boolean;
  excerptLength: number;
  onOpen: (item: PrototypeFaqItem) => void;
};

function Question({ item, onOpen }: { item: PrototypeFaqItem; onOpen: ListProps['onOpen'] }) {
  return (
    <Anchor
      className={styles.question}
      underline="never"
      href={'/rulesets/' + item.ruleset.slug + '/faq/' + item.slug}
      onClick={(event) => {
        event.preventDefault();
        onOpen(item);
      }}
    >
      <InlineFormattedTextSource source={item.question} />
    </Anchor>
  );
}

function Summary({ item, excerptLength }: { item: PrototypeFaqItem; excerptLength: number }) {
  const accepted = item.faq_answers.find((answer) => answer._id === item.accepted_answer_id);
  if (!accepted) {
    return (
      <Text size="sm" c="dimmed">
        {item.faq_answers.length ? 'No accepted answer yet.' : 'No answers yet.'}
      </Text>
    );
  }
  const excerpt =
    accepted.answer.length > excerptLength ? accepted.answer.slice(0, excerptLength).trimEnd() + '…' : accepted.answer;
  return (
    <div className={styles.excerpt}>
      <Quote size={15} aria-hidden />
      <Text size="sm">{excerpt}</Text>
    </div>
  );
}

function Person({ person }: { person: PrototypePerson }) {
  return <ProfileLink name={person.name} slug={person.slug} image={person.image} className={styles.person} />;
}

function People({ item }: { item: PrototypeFaqItem }) {
  const accepted = item.faq_answers.find((answer) => answer._id === item.accepted_answer_id);
  const answerers = accepted ? [item.answerPeople[accepted.answered_by]!] : Object.values(item.answerPeople);
  return (
    <div className={styles.people}>
      <div className={styles.byline}>
        <Text component="span" size="xs" c="dimmed">
          Asked by:
        </Text>
        {item.asker_profile ? (
          <Person
            person={{
              name: item.asker_profile.username ?? 'Contributor',
              slug: item.asker_profile.slug,
              image: item.asker_profile.avatar_url,
            }}
          />
        ) : (
          <Text size="xs">Former contributor</Text>
        )}
      </div>
      <div className={styles.byline}>
        <Text component="span" size="xs" c="dimmed">
          Answered by:
        </Text>
        {answerers.length ? (
          answerers.map((person) => <Person key={person.slug} person={person} />)
        ) : (
          <Text size="xs" c="dimmed">
            Nobody yet
          </Text>
        )}
      </div>
    </div>
  );
}

function RelatedAssets({ item }: { item: PrototypeFaqItem }) {
  return (
    <div className={styles.relations}>
      <Text component="span" size="xs" c="dimmed">
        Relates to:
      </Text>
      {item.relatedAssets.length ? (
        item.relatedAssets.map((asset) => (
          <Anchor key={asset.href} href={asset.href} size="xs" underline="never" className={styles.asset}>
            <Box size={13} aria-hidden />
            {asset.name}
          </Anchor>
        ))
      ) : (
        <Text component="span" size="xs" c="dimmed">
          No linked assets
        </Text>
      )}
    </div>
  );
}

function Metadata({ item, across }: { item: PrototypeFaqItem; across: boolean }) {
  return (
    <Group gap="xs" className={styles.metadata}>
      {across ? (
        <Text size="xs" fw={600}>
          {item.ruleset.name}
        </Text>
      ) : null}
      {(item.tags ?? []).map((tag) => (
        <Badge key={tag} size="xs" variant="outline" color="dune">
          {FAQ_TAG_LABELS[tag]}
        </Badge>
      ))}
      <Text component="time" size="xs" dateTime={item.created_at}>
        {formatStableDate(item.created_at)}
      </Text>
    </Group>
  );
}

function AnswerStatus({ item }: { item: PrototypeFaqItem }) {
  const count = item.faq_answers.length;
  return (
    <StatusBadge
      tone={item.accepted_answer_id ? 'positive' : 'neutral'}
      icon={item.accepted_answer_id ? <Check size={12} aria-hidden /> : <MessageCircle size={12} aria-hidden />}
    >
      {count} {count === 1 ? 'answer' : 'answers'}
    </StatusBadge>
  );
}

function AnswerRail({ item }: { item: PrototypeFaqItem }) {
  return (
    <div
      className={styles.rail}
      aria-label={
        (item.accepted_answer_id ? 'Accepted answer, ' : 'Open discussion, ') + item.faq_answers.length + ' answers'
      }
    >
      <Text size="xl" fw={700}>
        {item.faq_answers.length}
      </Text>
      {item.accepted_answer_id ? (
        <Check size={16} aria-label="Accepted answer" />
      ) : (
        <MessageCircle size={16} aria-label="Open discussion" />
      )}
    </div>
  );
}

function RailRow({ item, across, excerptLength, onOpen }: Omit<ListProps, 'items'> & { item: PrototypeFaqItem }) {
  return (
    <div className={styles.railRow}>
      <AnswerRail item={item} />
      <Stack gap="sm">
        <Question item={item} onOpen={onOpen} />
        <Summary item={item} excerptLength={excerptLength} />
        <People item={item} />
        <RelatedAssets item={item} />
        <Metadata item={item} across={across} />
      </Stack>
    </div>
  );
}

function ReadingRow({ item, across, excerptLength, onOpen }: Omit<ListProps, 'items'> & { item: PrototypeFaqItem }) {
  return (
    <div className={styles.readingRow}>
      <div className={styles.readingHeading}>
        <Question item={item} onOpen={onOpen} />
        <AnswerStatus item={item} />
      </div>
      <div className={styles.readingAnswer}>
        <Summary item={item} excerptLength={excerptLength} />
        <Metadata item={item} across={across} />
      </div>
      <div className={styles.readingContext}>
        <People item={item} />
        <RelatedAssets item={item} />
      </div>
    </div>
  );
}

function CompactRow({ item, across, excerptLength, onOpen }: Omit<ListProps, 'items'> & { item: PrototypeFaqItem }) {
  return (
    <div className={styles.compactRow}>
      <div className={styles.compactHeading}>
        <Question item={item} onOpen={onOpen} />
        <AnswerStatus item={item} />
      </div>
      <Summary item={item} excerptLength={excerptLength} />
      <div className={styles.compactContext}>
        <People item={item} />
        <RelatedAssets item={item} />
      </div>
      <Metadata item={item} across={across} />
    </div>
  );
}

function PrototypeList({ variant, ...props }: ListProps & { variant: Variant }) {
  if (!props.items.length) {
    return (
      <Surface padding="lg">
        <Text size="sm" c="dimmed">
          No questions yet.
        </Text>
      </Surface>
    );
  }
  const RowContent = { rail: RailRow, reading: ReadingRow, compact: CompactRow }[variant];
  return (
    <SectionedSurface>
      {props.items.map((item) => (
        <SectionedSurface.Row
          key={item._id}
          onActivate={() => props.onOpen(item)}
          ariaLabel={'Open question: ' + item.question}
        >
          <RowContent item={item} {...props} />
        </SectionedSurface.Row>
      ))}
    </SectionedSurface>
  );
}

function FaqListPrototypeWorkbench({ variant, comparison = false }: Props) {
  const [state, dispatch] = useReducer(reducer, {
    width: 960,
    across: true,
    empty: false,
    excerptLength: 180,
    selected: null,
  });
  const variants: Variant[] = comparison ? ['rail', 'reading', 'compact'] : [variant];
  const selectLink = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const link = event.target.closest('a');
    if (!link) {
      return;
    }
    event.preventDefault();
    const href = link.getAttribute('href') ?? '';
    const label = href.startsWith('/profiles/') ? link.lastElementChild?.textContent : link.textContent;
    const kind = href.startsWith('/profiles/') ? 'Profile: ' : href.startsWith('/assets/') ? 'Asset: ' : '';
    dispatch({ kind: 'select', selected: kind + (label?.trim() ?? 'Link') });
  };
  return (
    <div className={styles.workbench}>
      <Section
        title={comparison ? 'FAQ list comparison' : concepts[variant].title}
        eyebrow="Design prototype"
        description={
          comparison
            ? 'Three new designs combining answer previews, people and related assets.'
            : concepts[variant].description
        }
      >
        <Surface padding="md">
          <Stack gap="sm">
            <Radio.Group
              label="Container width"
              value={String(state.width)}
              onChange={(value) => dispatch({ kind: 'resize', width: Number(value) })}
            >
              <Group gap="md">
                <Radio value="320" label="Narrow · 320px" />
                <Radio value="560" label="Medium · 560px" />
                <Radio value="960" label="Wide · 960px" />
              </Group>
            </Radio.Group>
            <Group gap="lg" align="end">
              <NumberInput
                label="Accepted answer excerpt"
                value={state.excerptLength}
                min={80}
                max={400}
                step={20}
                suffix=" characters"
                w={190}
                onChange={(value) => {
                  if (typeof value === 'number') {
                    dispatch({ kind: 'excerpt', length: value });
                  }
                }}
              />
              <Switch
                label="Show ruleset labels"
                checked={state.across}
                onChange={(event) => dispatch({ kind: 'scope', across: event.currentTarget.checked })}
              />
              <Switch
                label="Empty list"
                checked={state.empty}
                onChange={(event) => dispatch({ kind: 'empty', empty: event.currentTarget.checked })}
              />
            </Group>
            <Text size="xs" c="dimmed">
              All rows open the question. People and assets have their own links. Sample content is illustrative.
            </Text>
          </Stack>
        </Surface>
        <div
          className={styles.stage}
          style={{ '--prototype-width': state.width + 'px' } as CSSProperties}
          onClickCapture={selectLink}
        >
          {variants.map((current) => (
            <Section
              key={current}
              title={comparison ? concepts[current].title : 'Questions'}
              hiddenHeading={!comparison}
              description={comparison ? concepts[current].description : undefined}
            >
              <PrototypeList
                variant={current}
                items={state.empty ? [] : prototypeFaqItems}
                across={state.across}
                excerptLength={state.excerptLength}
                onOpen={(item) => dispatch({ kind: 'select', selected: 'Question: ' + item.question })}
              />
            </Section>
          ))}
        </div>
        <Text size="xs" c="dimmed" role="status">
          {state.selected
            ? 'Selected: ' + state.selected
            : 'Click a row, a person or an asset to preview its destination.'}
        </Text>
      </Section>
    </div>
  );
}

const meta = preview.meta({
  title: 'FaqList/Prototypes',
  component: FaqListPrototypeWorkbench,
  parameters: { layout: 'padded' },
  globals: { backgrounds: { value: 'light', grid: false } },
  args: { variant: 'rail', comparison: false },
  argTypes: { variant: { control: false }, comparison: { control: false } },
});
export const Comparison = meta.story({ args: { variant: 'rail', comparison: true } });
export const AAnswerRail = meta.story({ args: { variant: 'rail' } });
export const BAnswerAndContext = meta.story({ args: { variant: 'reading' } });
export const CCompactDiscussion = meta.story({ args: { variant: 'compact' } });
