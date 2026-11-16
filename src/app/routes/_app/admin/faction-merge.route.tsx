import { Anchor, Box, Checkbox, Group, List, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { INHERITABLE_FIELD_LABELS } from '@shared/factions/variantFields';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ActionError } from '@ui/block/ActionError';
import { Disclosure } from '@ui/block/Disclosure';
import { Notice } from '@ui/block/Notice';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { Breadcrumb } from '@ui/content/Breadcrumb';
import { EmptyNote } from '@ui/content/EmptyNote';
import { Pending } from '@ui/content/Pending';
import { ControlBlock } from '@ui/control/ControlBlock';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PickerField } from '@ui/control/PickerField';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Eye, GitBranch, Merge, X } from 'lucide-react';
import { useReducer, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { mutationErrorMessage } from '@db/core/mutationError';
import { useMergeFaction, useMergePreviews, useMergeReferences, useMergeVariants } from '@db/factionMerge';
import type {
  MergedVariants,
  MergeFaction,
  MergePlacement,
  MergePreview,
  MergePreviewAnswer,
  MergeVariant,
} from '@db/factionMerge';
import { LiveFactionSearch } from '@app/pickers/LiveFactionSearch';
import { pageHead } from '@app/routes/pageTitle';

import { blockedReason, leftBehind, nameProblems, parentChoices, planOf } from './factionMergePlan';
import type { MergePlan, Picked, PlanChoices, PlanState, RowDraft } from './factionMergePlan';

export const Route = createFileRoute('/_app/admin/faction-merge')({
  head: () => pageHead('Merge factions'),
  component: FactionMergePage,
});

const NO_PARENT = 'none';
const NO_REFERENCES = 'No references to rewrite.';
/* Two columns once the pane has room for two inputs side by side. */
const PAIR = { base: 1, '30rem': 2 } as const;

/** The choices, and the placements the admin reviewed, as JSON: any other placements are not reviewed. */
type Draft = PlanChoices & Readonly<{ reviewed: string | null }>;
type Event =
  | { type: 'keep'; faction: Picked | null }
  | { type: 'duplicate'; faction: Picked | null }
  | { type: 'reparent'; value: boolean }
  | { type: 'moving'; id: string | null }
  | { type: 'row'; id: string; change: RowDraft }
  | { type: 'review'; reviewed: string | null }
  | { type: 'merged' };

const EMPTY: Draft = { keep: null, duplicate: null, reparent: false, movingId: null, rows: {}, reviewed: null };
/* Any new choice starts the plan over: the names and parents belonged to the variants shown before. */
const FRESH = { rows: {}, reviewed: null } as const;

const REDUCERS: { [Type in Event['type']]: (state: Draft, event: Extract<Event, { type: Type }>) => Draft } = {
  keep: (state, { faction }) => ({ ...state, ...FRESH, keep: faction, movingId: null }),
  duplicate: (state, { faction }) => ({ ...state, ...FRESH, duplicate: faction }),
  reparent: (state, { value }) => ({ ...state, ...FRESH, reparent: value }),
  moving: (state, { id }) => ({ ...state, ...FRESH, movingId: id }),
  /* An edit un-reviews, so typing a name back to what was reviewed does not bring the write back by itself. */
  row: (state, { id, change }) => ({
    ...state,
    rows: { ...state.rows, [id]: { ...state.rows[id], ...change } },
    reviewed: null,
  }),
  review: (state, { reviewed }) => ({ ...state, reviewed }),
  merged: (state) => ({ ...state, ...FRESH, duplicate: null, movingId: null }),
};

function reduceDraft(state: Draft, event: Event): Draft {
  return (REDUCERS[event.type] as (state: Draft, event: Event) => Draft)(state, event);
}

type Run = ReturnType<typeof useMergeVariants>;

/** The variant by which the page reads the faction to merge: the one a stopped run left in it, since the one first chosen may have moved. */
function sourceIdOf(draft: Draft, stoppedAt: string | null) {
  return draft.reparent ? null : (stoppedAt ?? draft.duplicate?.id ?? null);
}

function FactionMergePage() {
  const [draft, dispatch] = useReducer(reduceDraft, EMPTY);
  const run = useMergeVariants();
  const target = useMergeFaction(draft.keep?.id ?? null);
  const source = useMergeFaction(sourceIdOf(draft, run.stoppedAt));
  const state = planOf({ choices: draft, target, source });
  /* A new choice also lets go of what the last run reported. */
  const choose = (event: Event) => {
    run.reset();
    dispatch(event);
  };
  const submit = (plan: MergePlan) =>
    run.merge(
      { placements: plan.placements, into: plan.target.name },
      {
        onSuccess: () => dispatch({ type: 'merged' }),
        onError: () => dispatch({ type: 'review', reviewed: null }),
      }
    );
  const error = (
    <ActionError
      subject={draft.reparent ? 'Variant' : 'Factions'}
      verb={draft.reparent ? 'change' : 'merge'}
      error={run.error}
    />
  );
  return (
    <PageLayout>
      <PageLayout.Header size="compact" align="start">
        <PageTitle
          breadcrumb={<Breadcrumb to="/admin">Admin tools</Breadcrumb>}
          title="Merge factions"
          lede="Move a duplicate faction's variants into the faction you keep, or give a variant another parent."
        />
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="lg">
          <MergedNotice merged={run.merged} />
          <Surface padding="md">
            {run.isPending ? (
              /* The factions change under the page while the run places one variant after the other, so the fields wait for it. */
              <Pending>{draft.reparent ? 'Moving the variant…' : 'Merging the factions…'}</Pending>
            ) : (
              <Stack gap="md">
                <Choices draft={draft} target={target} onChoose={choose} />
                <PlanBody
                  state={state}
                  reviewed={draft.reviewed}
                  busy={run.isPending}
                  error={error}
                  onRow={(id, change) => dispatch({ type: 'row', id, change })}
                  onReview={(reviewed) => dispatch({ type: 'review', reviewed })}
                  onSubmit={submit}
                />
              </Stack>
            )}
          </Surface>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

/** What the last run placed, with the page of each variant. */
function MergedNotice({ merged }: Readonly<{ merged: Run['merged'] }>) {
  if (!merged) {
    return null;
  }
  return (
    <Notice tone="positive" live title={`Now in ${merged.into}`}>
      <List size="sm" spacing="xs">
        {merged.variants.map((variant) => (
          <List.Item key={variant.slug} icon={<GitBranch size={14} aria-hidden />}>
            <MergedLink variant={variant} />
          </List.Item>
        ))}
      </List>
    </Notice>
  );
}

function MergedLink({ variant }: Readonly<{ variant: MergedVariants['variants'][number] }>) {
  return (
    <Anchor
      inherit
      renderRoot={(props) => <Link {...props} to="/factions/$factionId" params={{ factionId: variant.slug }} />}
    >
      {variant.name}
    </Anchor>
  );
}

/** The faction to keep, and what goes into it: another faction, or one of its own variants to move. */
function Choices({
  draft,
  target,
  onChoose,
}: Readonly<{ draft: Draft; target: MergeFaction | null | undefined; onChoose: (event: Event) => void }>) {
  const seated = [draft.keep?.id, draft.duplicate?.id].filter((id) => id !== undefined);
  return (
    <>
      <FactionField
        title="Faction to keep"
        chosen={draft.keep}
        seated={seated}
        onPick={(faction) => onChoose({ type: 'keep', faction })}
      />
      <Checkbox
        color="selected"
        checked={draft.reparent}
        onChange={(event) => onChoose({ type: 'reparent', value: event.currentTarget.checked })}
        label="Move one of its own variants under another parent instead"
      />
      {draft.reparent ? (
        <ControlBlock
          title="Variant to move"
          input={(field) => (
            <Select
              {...field}
              placeholder="Choose the variant to move"
              searchable
              disabled={!target}
              data={liveOptions(target?.variants ?? [])}
              value={draft.movingId}
              onChange={(id) => onChoose({ type: 'moving', id })}
            />
          )}
        />
      ) : (
        <FactionField
          title="Faction to merge into it"
          chosen={draft.duplicate}
          seated={seated}
          onPick={(faction) => onChoose({ type: 'duplicate', faction })}
        />
      )}
    </>
  );
}

function liveOptions(variants: readonly MergeVariant[]) {
  return variants
    .filter((variant) => !variant.isDeleted)
    .map((variant) => ({ value: variant._id, label: variant.name }));
}

/** One of the two factions, picked from the search every tool shares; a variant of a faction already picked cannot be. */
function FactionField({
  title,
  chosen,
  seated,
  onPick,
}: Readonly<{
  title: string;
  chosen: Picked | null;
  seated: readonly string[];
  onPick: (faction: Picked | null) => void;
}>) {
  return (
    <PickerField
      title={title}
      chosen={chosen?.name ?? 'Choose faction'}
      chooseLabel={`Choose ${title.toLowerCase()}`}
      onClear={chosen ? () => onPick(null) : undefined}
      loadingLabel="Loading factions"
      picker={(close) => (
        <LiveFactionSearch
          seated={seated}
          onePerFaction
          onPick={(faction) => {
            onPick({ id: faction.id, name: faction.name });
            close();
          }}
        />
      )}
    />
  );
}

type PlanHandlers = Readonly<{
  reviewed: string | null;
  busy: boolean;
  /** The last run's refusal, which sits right above the button that would try again. */
  error: ReactNode;
  onRow: (id: string, change: RowDraft) => void;
  onReview: (reviewed: string | null) => void;
  onSubmit: (plan: MergePlan) => void;
}>;

/** The plan, or the line that stands in for it while a faction loads or has nothing to merge. */
function PlanBody({ state, ...handlers }: PlanHandlers & Readonly<{ state: PlanState }>) {
  if (state && 'plan' in state) {
    return <PlanFields plan={state.plan} {...handlers} />;
  }
  return (
    <>
      {state ? <PlanLine state={state} /> : null}
      {handlers.error}
    </>
  );
}

function PlanLine({ state }: Readonly<{ state: { waiting: string } | { note: string } }>) {
  return 'waiting' in state ? <Pending>{state.waiting}</Pending> : <EmptyNote>{state.note}</EmptyNote>;
}

/** Every moving variant's fields and preview, then the review of the write as a whole. */
function PlanFields({
  plan,
  reviewed,
  busy,
  error,
  onRow,
  onReview,
  onSubmit,
}: PlanHandlers & Readonly<{ plan: MergePlan }>) {
  const previews = useMergePreviews(plan.placements);
  const names = nameProblems(plan, previews);
  const blocked = blockedReason({ plan, previews, names });
  const key = JSON.stringify(plan.placements);
  return (
    <>
      {plan.roots.map((root, index) => (
        <VariantGroup key={root._id} plan={plan} root={root}>
          <VariantFields
            plan={plan}
            index={index}
            preview={previews[root._id]}
            nameWarning={names[index]}
            onChange={(change) => onRow(root._id, change)}
          />
        </VariantGroup>
      ))}
      <StaysBehind plan={plan} count={leftBehind(plan, previews)} />
      {error}
      <Review
        plan={plan}
        blocked={blocked}
        reviewing={reviewed === key && !blocked}
        busy={busy}
        onReview={(value) => onReview(value ? key : null)}
        onConfirm={() => onSubmit(plan)}
      />
    </>
  );
}

/** A faction that merges several variants names each one's fields; a single variant needs no heading over its own name. */
function VariantGroup({
  plan,
  root,
  children,
}: Readonly<{ plan: MergePlan; root: MergeVariant; children: ReactNode }>) {
  if (plan.roots.length === 1) {
    return children;
  }
  return (
    <Section title={root.name} icon={<GitBranch size={18} aria-hidden />}>
      {children}
    </Section>
  );
}

function StaysBehind({ plan, count }: Readonly<{ plan: MergePlan; count: number }>) {
  return count > 0 ? <Text size="sm">{`Stays behind in ${plan.source?.name}, deleted: ${count}`}</Text> : null;
}

/** One moving variant: its name and parent in the faction it joins, then what the preview says the move does to it. */
function VariantFields({
  plan,
  index,
  preview,
  nameWarning,
  onChange,
}: Readonly<{
  plan: MergePlan;
  index: number;
  preview: MergePreviewAnswer;
  nameWarning: string | undefined;
  onChange: (change: RowDraft) => void;
}>) {
  const placement = plan.placements[index]!;
  const parents = parentChoices(plan.target, plan.roots[index]!);
  return (
    <Stack gap="sm">
      <SimpleGrid type="container" cols={PAIR} spacing="md">
        <ControlBlock
          title="Variant name"
          description={`What sets this variant apart from the others.\nIt is always shown beside ${plan.target.name}, so leave that name out.`}
          warning={nameWarning}
          input={(field) => (
            <TextInput
              {...field}
              value={placement.name}
              onChange={(event) => onChange({ name: event.currentTarget.value })}
            />
          )}
        />
        <ControlBlock
          title="Parent variant"
          /* The server's refusal of a placement is about where the variant goes. */
          warning={preview instanceof Error ? mutationErrorMessage(preview) : undefined}
          input={(field) => (
            <Select
              {...field}
              allowDeselect={false}
              data={[{ value: NO_PARENT, label: 'No parent' }, ...liveOptions(parents)]}
              value={placement.parentId ?? NO_PARENT}
              onChange={(value) => onChange({ parentId: value === NO_PARENT ? null : value })}
            />
          )}
        />
      </SimpleGrid>
      <PreviewOf placement={placement} preview={preview} />
    </Stack>
  );
}

function PreviewOf({ placement, preview }: Readonly<{ placement: MergePlacement; preview: MergePreviewAnswer }>) {
  if (preview === undefined) {
    return <Pending>Loading the preview…</Pending>;
  }
  return preview instanceof Error ? null : <PreviewLines placement={placement} preview={preview} />;
}

function fieldLabels(fields: readonly string[]) {
  const labels: Partial<Record<string, string>> = INHERITABLE_FIELD_LABELS;
  return fields.map((field) => labels[field] ?? field).join(', ');
}

/** The fields the variant keeps as its own: every one without a parent, and otherwise those that differ from the parent's. */
function customFields(preview: MergePreview, parentId: string | null) {
  if (parentId === null) {
    return 'every field';
  }
  return preview.custom.length > 0 ? fieldLabels(preview.custom) : 'nothing';
}

/** The variants below the moving one, which go where it goes. */
function alongTitle(along: MergePreview['branch']) {
  const deleted = along.filter((entry) => entry.isDeleted).length;
  return deleted > 0 ? `Moves along (${along.length}, ${deleted} deleted)` : `Moves along (${along.length})`;
}

/** What the preview says of one variant, a label first: what stays custom, then one line each for what follows the parent, what moves along and what is rewritten. */
function PreviewLines({ placement, preview }: Readonly<{ placement: MergePlacement; preview: MergePreview }>) {
  const along = preview.branch.slice(1);
  return (
    <>
      <Text size="sm">{`Stays custom: ${customFields(preview, placement.parentId)}`}</Text>
      {preview.followed.length > 0 ? (
        <Detail title={`Follows the parent (${preview.followed.length})`}>
          <Text size="sm">{fieldLabels(preview.followed)}</Text>
        </Detail>
      ) : null}
      {along.length > 0 ? (
        <Detail title={alongTitle(along)}>
          <Text size="sm">
            {along.map((entry) => (entry.isDeleted ? `${entry.name} (deleted)` : entry.name)).join(', ')}
          </Text>
        </Detail>
      ) : null}
      {preview.branch.some((entry) => entry.changesIds) ? (
        <References placement={placement} />
      ) : (
        <Text size="sm">{NO_REFERENCES}</Text>
      )}
    </>
  );
}

const DETAIL = { '--disclosure-font-size': 'var(--mantine-font-size-sm)' } as CSSProperties;

/**
 * One line of the preview that opens to more on a press.
 * A Disclosure stretches its toggle over the nearest positioned box, so each line is its own.
 */
function Detail({ title, onOpen, children }: Readonly<{ title: string; onOpen?: () => void; children: ReactNode }>) {
  return (
    <Box pos="relative" style={DETAIL} onClick={onOpen}>
      <Disclosure title={title}>{children}</Disclosure>
    </Box>
  );
}

/** The references the move rewrites, counted only once the line is opened: the count reads every Rulebook draft and Edition. */
function References({ placement }: Readonly<{ placement: MergePlacement }>) {
  const [opened, setOpened] = useState(false);
  return (
    <Detail title="References to rewrite" onOpen={() => setOpened(true)}>
      {opened ? <ReferenceRows placement={placement} /> : null}
    </Detail>
  );
}

function ReferenceRows({ placement }: Readonly<{ placement: MergePlacement }>) {
  const { rows, isDone } = useMergeReferences(placement);
  if (!isDone) {
    return <Pending>Counting the references…</Pending>;
  }
  if (rows.length === 0) {
    return <Text size="sm">{NO_REFERENCES}</Text>;
  }
  return (
    <Stack gap="xs">
      {rows.map((row, index) => (
        <Text key={`${row.rulebookName}-${row.edition ?? 'draft'}-${index}`} size="sm">
          {`${row.rulebookName}, ${row.edition === null ? 'draft' : `Edition ${row.edition}`}: ${row.references}`}
        </Text>
      ))}
    </Stack>
  );
}

/** The review in place, as the account merge has it: Review, then the write or Cancel. */
function Review({
  plan,
  blocked,
  reviewing,
  busy,
  onReview,
  onConfirm,
}: Readonly<{
  plan: MergePlan;
  blocked: string | undefined;
  reviewing: boolean;
  busy: boolean;
  onReview: (value: boolean) => void;
  onConfirm: () => void;
}>) {
  if (!reviewing) {
    return (
      <Group>
        <LabeledAction
          emphasis="strong"
          icon={<Eye size={16} />}
          disabledReason={blocked}
          onClick={() => onReview(true)}
        >
          {plan.source ? 'Review merge' : 'Review move'}
        </LabeledAction>
      </Group>
    );
  }
  return (
    <>
      {plan.source ? <MergeSummary target={plan.target} source={plan.source} /> : <MoveSummary plan={plan} />}
      <Text size="sm">This is a production write. It cannot be undone.</Text>
      <Group>
        <LabeledAction intent="negative" emphasis="strong" icon={<Merge size={16} />} busy={busy} onClick={onConfirm}>
          {plan.source ? `Merge into ${plan.target.name}` : 'Move variant'}
        </LabeledAction>
        <LabeledAction
          icon={<X size={16} />}
          disabledReason={busy ? 'The merge is running.' : undefined}
          onClick={() => onReview(false)}
        >
          Cancel
        </LabeledAction>
      </Group>
    </>
  );
}

function MergeSummary({ target, source }: Readonly<{ target: MergeFaction; source: MergeFaction }>) {
  return (
    <Text>
      <strong>{target.name}</strong> keeps its name and address. Every live variant of <strong>{source.name}</strong>{' '}
      moves into it, and every reference to a leader or troop it gives up is rewritten. The address of {source.name}{' '}
      will lead to {target.name} once it has no live variant left.
    </Text>
  );
}

function MoveSummary({ plan }: Readonly<{ plan: MergePlan }>) {
  const moving = plan.placements[0]!;
  const parent = plan.target.variants.find((variant) => variant._id === moving.parentId);
  return (
    <Text>
      <strong>{moving.name.trim()}</strong>{' '}
      {parent ? (
        <>
          moves under <strong>{parent.name}</strong>
        </>
      ) : (
        'becomes a variant without a parent'
      )}{' '}
      in {plan.target.name}, with the variants under it. Every reference to a leader or troop it gives up is rewritten.
    </Text>
  );
}
