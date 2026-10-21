import { Accordion, Anchor, Badge, Group, Radio, Stack, Switch, Text } from '@mantine/core';
import preview from '@sb/preview';
import { Section } from '@ui/block/Section';
import { formatStableDate } from '@ui/content/dates';
import { FAQ_TAG_LABELS } from '@ui/content/faqTagLabels';
import { InlineFormattedTextSource } from '@ui/content/FormattedText';
import { StatusBadge } from '@ui/content/StatusBadge';
import { Surface } from '@ui/surface';
import { SectionedSurface } from '@ui/surface/SectionedSurface';
import { ArrowUpRight, Check, MessageCircle, Quote } from 'lucide-react';
import { useReducer } from 'react';
import type { CSSProperties } from 'react';

import type { RelatedFaqItem } from '@db/faq';

import { FaqList } from './FaqList';
import styles from './FaqListPrototype.module.css';
import { prototypeFaqItems } from './FaqListPrototype.stories.fixture';

/** Five isolated FAQ list prototypes; production FaqList stays unchanged until a design is chosen. */
type Variant = 'current' | 'reading' | 'rail' | 'preview' | 'index' | 'expandable';
const concepts = {
  current: { title: 'Current component', description: 'The existing FAQ list, using the same sample questions.' },
  reading: { title: 'A · Reading rows', description: 'The question leads. Its context stays on one quiet line below.' },
  rail: { title: 'B · Answer rail', description: 'An answer-count column makes settled questions easy to scan.' },
  preview: {
    title: 'C · Answer previews',
    description: 'Show a short accepted answer before asking readers to open the question.',
  },
  index: {
    title: 'D · Compact index',
    description: 'Aligned columns on wide containers become stacked rows in small ones.',
  },
  expandable: {
    title: 'E · Expandable list',
    description: 'Scan the questions, expand one for context, then open the discussion.',
  },
};

type PrototypeProps = { variant: Variant; comparison?: boolean };
type State = { width: number; across: boolean; empty: boolean; selected: string | null };
type Event =
  | { kind: 'resize'; width: number }
  | { kind: 'scope'; across: boolean }
  | { kind: 'empty'; empty: boolean }
  | { kind: 'open'; question: string };

function reducer(state: State, event: Event): State {
  switch (event.kind) {
    case 'resize':
      return { ...state, width: event.width };
    case 'scope':
      return { ...state, across: event.across };
    case 'empty':
      return { ...state, empty: event.empty };
    case 'open':
      return { ...state, selected: event.question };
  }
}

type ListProps = { items: RelatedFaqItem[]; across: boolean; onOpen: (item: RelatedFaqItem) => void };

function Question({ item, onOpen }: { item: RelatedFaqItem; onOpen: ListProps['onOpen'] }) {
  return (
    <Anchor
      className={styles.question}
      href={`/rulesets/${item.ruleset.slug}/faq/${item.slug}`}
      onClick={(event) => {
        event.preventDefault();
        onOpen(item);
      }}
    >
      <InlineFormattedTextSource source={item.question} />
    </Anchor>
  );
}

function Tags({ item }: { item: RelatedFaqItem }) {
  return (
    <Group gap="xs">
      {(item.tags ?? []).map((tag) => (
        <Badge key={tag} size="xs" variant="outline" color="dune">
          {FAQ_TAG_LABELS[tag]}
        </Badge>
      ))}
    </Group>
  );
}

function Context({ item, across, author = true }: { item: RelatedFaqItem; across: boolean; author?: boolean }) {
  return (
    <Group gap="xs" className={styles.context}>
      {across ? (
        <Text component="span" size="xs" fw={600}>
          {item.ruleset.name}
        </Text>
      ) : null}
      {author ? (
        <Text component="span" size="xs">
          {item.asker_profile?.username ?? 'Former contributor'}
        </Text>
      ) : null}
      <Text component="time" size="xs" dateTime={item.created_at}>
        {formatStableDate(item.created_at)}
      </Text>
    </Group>
  );
}

function AnswerStatus({ item }: { item: RelatedFaqItem }) {
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

function AnswerPreview({ item }: { item: RelatedFaqItem }) {
  const accepted = item.faq_answers.find((answer) => answer._id === item.accepted_answer_id);
  return accepted ? (
    <div className={styles.answerPreview}>
      <Quote size={15} aria-hidden />
      <Text size="sm" lineClamp={3}>
        <InlineFormattedTextSource source={accepted.answer} />
      </Text>
    </div>
  ) : (
    <Text size="sm" c="dimmed">
      {item.faq_answers.length ? 'Discussion is open. No accepted answer yet.' : 'No answers yet.'}
    </Text>
  );
}

function ReadingRows({ items, across, onOpen }: ListProps) {
  return (
    <SectionedSurface>
      {items.map((item) => (
        <SectionedSurface.Row
          key={item._id}
          onActivate={() => onOpen(item)}
          ariaLabel={`Open question: ${item.question}`}
        >
          <div className={styles.readingRow}>
            <div className={styles.readingQuestion}>
              <Question item={item} onOpen={onOpen} />
            </div>
            <div className={styles.readingStatus}>
              <AnswerStatus item={item} />
            </div>
            <div className={styles.readingMeta}>
              <Context item={item} across={across} />
              <Tags item={item} />
            </div>
          </div>
        </SectionedSurface.Row>
      ))}
    </SectionedSurface>
  );
}

function AnswerRail({ items, across, onOpen }: ListProps) {
  return (
    <SectionedSurface>
      {items.map((item) => (
        <SectionedSurface.Row
          key={item._id}
          onActivate={() => onOpen(item)}
          ariaLabel={`Open question: ${item.question}`}
        >
          <div className={styles.railRow}>
            <div className={styles.railCount} data-accepted={Boolean(item.accepted_answer_id)}>
              <Text fw={700} fz="xl">
                {item.faq_answers.length}
              </Text>
              <Text size="xs">
                {item.accepted_answer_id ? <Check size={14} aria-label="Accepted answer" /> : 'replies'}
              </Text>
            </div>
            <Stack gap="xs">
              <Question item={item} onOpen={onOpen} />
              <Tags item={item} />
              <Context item={item} across={across} />
            </Stack>
          </div>
        </SectionedSurface.Row>
      ))}
    </SectionedSurface>
  );
}

function AnswerPreviews({ items, across, onOpen }: ListProps) {
  return (
    <SectionedSurface>
      {items.map((item) => (
        <SectionedSurface.Row
          key={item._id}
          onActivate={() => onOpen(item)}
          ariaLabel={`Open question: ${item.question}`}
        >
          <div className={styles.previewRow}>
            <Stack gap="sm">
              <Question item={item} onOpen={onOpen} />
              <AnswerPreview item={item} />
              <Context item={item} across={across} />
            </Stack>
            <Stack gap="sm" className={styles.previewAside}>
              <AnswerStatus item={item} />
              <Tags item={item} />
            </Stack>
          </div>
        </SectionedSurface.Row>
      ))}
    </SectionedSurface>
  );
}

function CompactIndex({ items, across, onOpen }: ListProps) {
  return (
    <Surface padding="lg">
      <div className={styles.indexHeader} aria-hidden>
        <Text size="xs" fw={700}>
          QUESTION
        </Text>
        <Text size="xs" fw={700}>
          {across ? 'RULESET' : 'TAGS'}
        </Text>
        <Text size="xs" fw={700}>
          ANSWERS
        </Text>
        <Text size="xs" fw={700}>
          ASKED BY
        </Text>
      </div>
      <div className={styles.indexList}>
        {items.map((item) => (
          <div key={item._id} className={styles.indexRow}>
            <div className={styles.indexQuestion}>
              <Question item={item} onOpen={onOpen} />
            </div>
            <div className={styles.indexRuleset}>
              {across ? (
                <Text size="xs" fw={600}>
                  {item.ruleset.name}
                </Text>
              ) : (
                <Tags item={item} />
              )}
            </div>
            <div className={styles.indexCount}>
              <AnswerStatus item={item} />
            </div>
            <div className={styles.indexAuthor}>
              <Context item={item} across={false} />
            </div>
          </div>
        ))}
      </div>
    </Surface>
  );
}

function ExpandableList({ items, across, onOpen }: ListProps) {
  return (
    <Surface padding="sm">
      <Accordion defaultValue={items[0]?._id} className={styles.accordion}>
        {items.map((item) => (
          <Accordion.Item key={item._id} value={item._id}>
            <Accordion.Control>
              <div className={styles.accordionQuestion}>
                <Text fw={600}>
                  <InlineFormattedTextSource source={item.question} />
                </Text>
                <AnswerStatus item={item} />
              </div>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <AnswerPreview item={item} />
                <Tags item={item} />
                <Context item={item} across={across} />
                <Anchor
                  href={`/rulesets/${item.ruleset.slug}/faq/${item.slug}`}
                  onClick={(event) => {
                    event.preventDefault();
                    onOpen(item);
                  }}
                  className={styles.openLink}
                >
                  Open question <ArrowUpRight size={14} aria-hidden />
                </Anchor>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Surface>
  );
}

function PrototypeList({ variant, ...props }: ListProps & { variant: Variant }) {
  if (props.items.length === 0 && variant !== 'current') {
    return (
      <Surface padding="lg">
        <Text size="sm" c="dimmed">
          No questions yet.
        </Text>
      </Surface>
    );
  }
  switch (variant) {
    case 'reading':
      return <ReadingRows {...props} />;
    case 'rail':
      return <AnswerRail {...props} />;
    case 'preview':
      return <AnswerPreviews {...props} />;
    case 'index':
      return <CompactIndex {...props} />;
    case 'expandable':
      return <ExpandableList {...props} />;
    case 'current':
      return props.across ? (
        <FaqList
          items={props.items}
          onOpenQuestion={(slug) => props.onOpen(props.items.find((item) => item.slug === slug)!)}
          emptyLabel="No questions yet."
        />
      ) : (
        <FaqList
          items={props.items}
          rulesetSlug="dreamrules"
          onOpenQuestion={(slug) => props.onOpen(props.items.find((item) => item.slug === slug)!)}
          emptyLabel="No questions yet."
        />
      );
  }
}

function FaqListPrototypeWorkbench({ variant, comparison = false }: PrototypeProps) {
  const [state, dispatch] = useReducer(reducer, { width: 960, across: true, empty: false, selected: null });
  const items = state.empty ? [] : prototypeFaqItems;
  const variants: Variant[] = comparison ? ['reading', 'rail', 'preview', 'index', 'expandable'] : [variant];
  return (
    <div className={styles.workbench}>
      <Section
        title={comparison ? 'FAQ list comparison' : concepts[variant].title}
        eyebrow="Design prototype"
        description={
          comparison ? 'Five structures, with the same questions and container width.' : concepts[variant].description
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
            <Group gap="lg">
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
              Widths refer to the component's container. The browser can stay wide. Sample questions and answers are
              illustrative.
            </Text>
          </Stack>
        </Surface>
        <div className={styles.stage} style={{ '--prototype-width': `${state.width}px` } as CSSProperties}>
          {variants.map((current) => (
            <Section
              key={current}
              title={comparison ? concepts[current].title : 'Questions'}
              hiddenHeading={!comparison}
              description={comparison ? concepts[current].description : undefined}
            >
              <PrototypeList
                variant={current}
                items={items}
                across={state.across}
                onOpen={(item) => dispatch({ kind: 'open', question: item.question })}
              />
            </Section>
          ))}
        </div>
        <Text size="xs" c="dimmed" role="status">
          {state.selected
            ? `Selected question: ${state.selected}`
            : 'Open a question to preview selection. This prototype does not navigate or save data.'}
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
  args: { variant: 'reading', comparison: false },
  argTypes: { variant: { control: false }, comparison: { control: false } },
});

export const Comparison = meta.story({ args: { variant: 'reading', comparison: true } });
export const Current = meta.story({ args: { variant: 'current' } });
export const AReadingRows = meta.story({ args: { variant: 'reading' } });
export const BAnswerRail = meta.story({ args: { variant: 'rail' } });
export const CAnswerPreviews = meta.story({ args: { variant: 'preview' } });
export const DCompactIndex = meta.story({ args: { variant: 'index' } });
export const EExpandableList = meta.story({ args: { variant: 'expandable' } });
