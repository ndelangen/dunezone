import { Anchor, Box, Checkbox, Group, List, Popover, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { INHERITABLE_FIELDS } from '@shared/factions/variantFields';
import type { InheritableField } from '@shared/factions/variantFields';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ActionError } from '@ui/block/ActionError';
import { Disclosure } from '@ui/block/Disclosure';
import { FormError } from '@ui/block/FormError';
import { Notice } from '@ui/block/Notice';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { Breadcrumb } from '@ui/content/Breadcrumb';
import { EmptyNote } from '@ui/content/EmptyNote';
import { Pending } from '@ui/content/Pending';
import { ControlBlock } from '@ui/control/ControlBlock';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Eye, GitBranch, Merge, Search, X } from 'lucide-react';
import { useReducer } from 'react';
import type { CSSProperties, Dispatch, ReactNode } from 'react';

import { mutationErrorMessage } from '@db/core/mutationError';
import { useAttachFactionVariant, useMergeFaction, useMergePreviews, useMergeReferences } from '@db/factionMerge';
import type { MergeFaction, MergePlacement, MergePreview, MergeVariant } from '@db/factionMerge';
import { LiveFactionSearch } from '@app/pickers/LiveFactionSearch';
import { pageHead } from '@app/routes/pageTitle';

export const Route = createFileRoute('/_app/admin/faction-merge')({
  head: () => pageHead('Merge factions'),
  component: FactionMergePage,
});

/* Each inheritable field under the name the faction editor gives its Use parent variant choice. */
const FIELD_LABELS: Record<InheritableField, string> = {
  factionLeader: 'Faction leader',
  leaders: 'Supporting leaders',
  decals: 'Decals',
  planet: 'Planets',
  troops: 'Troops',
  'rules.startText': 'Starting instructions',
  'rules.revivalText': 'Revival instructions',
  'rules.spiceCount': 'Starting spice',
  'rules.treacheryTracker': 'Treachery tracker',
  'rules.advantages': 'Faction advantages',
  'rules.fate': 'Fate',
  'rules.alliance': 'Alliance advantage',
  extras: 'Faction Extras',
  extraPhases: 'Faction phases',
  'complexity.manual': 'Complexity',
};

function fieldLabel(field: string) {
  return (FIELD_LABELS as Record<string, string | undefined>)[field] ?? field;
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

const NO_PARENT = 'none';
/* Two columns once the pane has room for two inputs side by side. */
const PAIR = { base: 1, '30rem': 2 } as const;

/** A faction as the search hands it over: one of its variants, by which the page then reads the whole Faction. */
type Picked = { id: string; name: string };
/** What the admin changed on one moving variant; a field left out keeps what the page offers first. */
type RowDraft = { name?: string; parentId?: string | null };
type Merged = { into: string; variants: { name: string; slug: string }[] };
type Draft = {
  keep: Picked | null;
  duplicate: Picked | null;
  /** Ticked, the page moves one of the kept faction's own variants instead of merging another faction into it. */
  reparent: boolean;
  movingId: string | null;
  picker: 'keep' | 'duplicate' | null;
  rows: Record<string, RowDraft>;
  review: boolean;
  busy: boolean;
  error: Error | null;
  merged: Merged | null;
};
type Event =
  | { type: 'picker'; open: Draft['picker'] }
  | { type: 'keep'; faction: Picked }
  | { type: 'duplicate'; faction: Picked }
  | { type: 'reparent'; value: boolean }
  | { type: 'moving'; id: string | null }
  | { type: 'row'; id: string; change: RowDraft }
  | { type: 'review'; value: boolean }
  | { type: 'started' }
  | { type: 'failed'; error: Error; merged: Merged | null; next: string | null }
  | { type: 'merged'; merged: Merged };

const EMPTY: Draft = {
  keep: null,
  duplicate: null,
  reparent: false,
  movingId: null,
  picker: null,
  rows: {},
  review: false,
  busy: false,
  error: null,
  merged: null,
};

function reduceDraft(state: Draft, event: Event): Draft {
  /* Any new choice starts the plan over: the names and parents belonged to the variants shown before. */
  const fresh = { picker: null, rows: {}, review: false, error: null, merged: null } as const;
  switch (event.type) {
    case 'picker':
      return { ...state, picker: event.open };
    case 'keep':
      return { ...state, ...fresh, keep: event.faction, movingId: null };
    case 'duplicate':
      return { ...state, ...fresh, duplicate: event.faction };
    case 'reparent':
      return { ...state, ...fresh, reparent: event.value };
    case 'moving':
      return { ...state, ...fresh, movingId: event.id };
    case 'row':
      return {
        ...state,
        rows: { ...state.rows, [event.id]: { ...state.rows[event.id], ...event.change } },
        review: false,
        error: null,
      };
    case 'review':
      return { ...state, review: event.value, error: null };
    case 'started':
      return { ...state, busy: true, error: null, merged: null };
    case 'failed':
      return {
        ...state,
        busy: false,
        review: false,
        error: event.error,
        merged: event.merged,
        /* What already merged is no longer the duplicate's, so the page reads the duplicate by a variant still in it. */
        duplicate: state.duplicate && event.next ? { ...state.duplicate, id: event.next } : state.duplicate,
      };
    case 'merged':
      return { ...state, ...fresh, busy: false, duplicate: null, movingId: null, merged: event.merged };
  }
}

type Controls = Readonly<{ draft: Draft; dispatch: Dispatch<Event> }>;
type Submit = (placements: readonly MergePlacement[], into: string) => void;

function FactionMergePage() {
  const [draft, dispatch] = useReducer(reduceDraft, EMPTY);
  const attach = useAttachFactionVariant();
  /* A faction merges one variant without a parent at a time, each with its branch; the first refusal stops the rest. */
  const submit = async (placements: readonly MergePlacement[], into: string) => {
    dispatch({ type: 'started' });
    const variants: Merged['variants'] = [];
    for (const [index, placement] of placements.entries()) {
      try {
        const { slug } = await attach(placement);
        variants.push({ name: placement.name.trim(), slug });
      } catch (error) {
        dispatch({
          type: 'failed',
          error: error instanceof Error ? error : new Error(String(error)),
          merged: variants.length > 0 ? { into, variants } : null,
          next: index > 0 ? placement.factionId : null,
        });
        return;
      }
    }
    dispatch({ type: 'merged', merged: { into, variants } });
  };
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
          <MergedNotice merged={draft.merged} />
          <Section title="Choose the factions">
            <Surface padding="md">
              <Choices draft={draft} dispatch={dispatch} />
            </Surface>
          </Section>
          <ActionError
            subject={draft.reparent ? 'Variant' : 'Factions'}
            verb={draft.reparent ? 'change' : 'merge'}
            error={draft.error}
          />
          {draft.busy ? <Pending>{draft.reparent ? 'Moving the variant…' : 'Merging the factions…'}</Pending> : null}
          {!draft.busy && draft.keep ? (
            <KeptFaction
              keep={draft.keep}
              draft={draft}
              dispatch={dispatch}
              onSubmit={(...args) => void submit(...args)}
            />
          ) : null}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

/** What the last write did, with the page of each variant it placed. */
function MergedNotice({ merged }: Readonly<{ merged: Merged | null }>) {
  if (!merged) {
    return null;
  }
  return (
    <Notice tone="positive" live title={`${plural(merged.variants.length, 'variant')} now in ${merged.into}`}>
      <List size="sm" spacing={2}>
        {merged.variants.map((variant) => (
          <List.Item key={variant.slug} icon={<GitBranch size={14} aria-hidden />}>
            <Anchor
              inherit
              renderRoot={(props) => <Link {...props} to="/factions/$factionId" params={{ factionId: variant.slug }} />}
            >
              {variant.name}
            </Anchor>
          </List.Item>
        ))}
      </List>
    </Notice>
  );
}

/** The faction to keep, and what goes into it: another faction, or one of its own variants to move. */
function Choices({ draft, dispatch }: Controls) {
  return (
    <Stack gap="md">
      <FactionChoice
        title="Faction to keep"
        side="keep"
        chosen={draft.keep}
        other={draft.duplicate}
        draft={draft}
        dispatch={dispatch}
      />
      <Checkbox
        color="selected"
        disabled={draft.busy}
        checked={draft.reparent}
        onChange={(event) => dispatch({ type: 'reparent', value: event.currentTarget.checked })}
        label="Move one of its own variants under another parent instead"
      />
      {draft.reparent ? (
        draft.keep ? (
          <MovingVariant keep={draft.keep} draft={draft} dispatch={dispatch} />
        ) : null
      ) : (
        <FactionChoice
          title="Faction to merge into it"
          side="duplicate"
          chosen={draft.duplicate}
          other={draft.keep}
          draft={draft}
          dispatch={dispatch}
        />
      )}
    </Stack>
  );
}

function FactionChoice({
  title,
  side,
  chosen,
  other,
  draft,
  dispatch,
}: Controls & Readonly<{ title: string; side: 'keep' | 'duplicate'; chosen: Picked | null; other: Picked | null }>) {
  const open = draft.picker === side;
  const action = chosen ? 'Change faction' : 'Choose faction';
  return (
    <ControlBlock
      title={title}
      input={
        <Group gap="sm">
          {chosen ? <Text fw={700}>{chosen.name}</Text> : null}
          <Popover
            opened={open}
            onChange={(next) => dispatch({ type: 'picker', open: next ? side : null })}
            width={420}
            styles={{ dropdown: { maxWidth: 'calc(100vw - var(--space-md) * 2)' } }}
            position="bottom-start"
            trapFocus
            closeOnEscape
          >
            <Popover.Target>
              <LabeledAction
                icon={<Search size={16} />}
                accessibleName={`${action}: ${title.toLowerCase()}`}
                disabledReason={draft.busy ? 'The merge is running.' : undefined}
                onClick={() => dispatch({ type: 'picker', open: open ? null : side })}
              >
                {action}
              </LabeledAction>
            </Popover.Target>
            <Popover.Dropdown>
              {open ? (
                <LiveFactionSearch
                  seated={[chosen?.id, other?.id].filter((id) => id !== undefined)}
                  onPick={(faction) => dispatch({ type: side, faction: { id: faction.id, name: faction.name } })}
                />
              ) : null}
            </Popover.Dropdown>
          </Popover>
        </Group>
      }
    />
  );
}

/** The kept faction's own live variants, one of which moves. */
function MovingVariant({ keep, draft, dispatch }: Controls & Readonly<{ keep: Picked }>) {
  const faction = useMergeFaction(keep.id);
  return (
    <ControlBlock
      title="Variant to move"
      input={(field) => (
        <Select
          {...field}
          placeholder="Choose the variant to move"
          searchable
          disabled={draft.busy || !faction}
          data={(faction?.variants ?? [])
            .filter((variant) => !variant.isDeleted)
            .map((variant) => ({ value: variant._id, label: variant.name }))}
          value={draft.movingId}
          onChange={(id) => dispatch({ type: 'moving', id })}
        />
      )}
    />
  );
}

type PlanControls = Controls & Readonly<{ onSubmit: Submit }>;

function KeptFaction({ keep, ...controls }: PlanControls & Readonly<{ keep: Picked }>) {
  const target = useMergeFaction(keep.id);
  const { draft } = controls;
  if (target === undefined) {
    return <Pending>Loading the faction to keep…</Pending>;
  }
  if (target === null) {
    return <EmptyNote>The faction to keep no longer exists. Choose another.</EmptyNote>;
  }
  if (draft.reparent) {
    const moving = target.variants.find((variant) => variant._id === draft.movingId && !variant.isDeleted);
    return moving ? <Plan target={target} source={null} roots={[moving]} {...controls} /> : null;
  }
  return draft.duplicate ? <DuplicateFaction target={target} duplicate={draft.duplicate} {...controls} /> : null;
}

function DuplicateFaction({
  target,
  duplicate,
  ...controls
}: PlanControls & Readonly<{ target: MergeFaction; duplicate: Picked }>) {
  const source = useMergeFaction(duplicate.id);
  if (source === undefined) {
    return <Pending>Loading the faction to merge…</Pending>;
  }
  if (source === null) {
    return <EmptyNote>The faction to merge no longer exists. Choose another.</EmptyNote>;
  }
  if (source.familyId === target.familyId) {
    return (
      <Notice tone="caution" title="Both choices are the same faction">
        Choose another faction to merge, or tick the box to move one of its variants under another parent.
      </Notice>
    );
  }
  const roots = movingRoots(source.variants);
  if (roots.length === 0) {
    return <EmptyNote>{`${source.name} has no live variant to merge.`}</EmptyNote>;
  }
  return <Plan target={target} source={source} roots={roots} {...controls} />;
}

function parentOf(variants: readonly MergeVariant[], variant: MergeVariant) {
  return variant.parentId ? variants.find((candidate) => candidate._id === variant.parentId) : undefined;
}

/**
 * The live variants with no live variant above them: merging each, with its branch, moves every live variant of the Faction.
 * A deleted variant between two live ones moves along with the branch it is in.
 */
function movingRoots(variants: readonly MergeVariant[]) {
  return variants.filter((variant) => {
    if (variant.isDeleted) {
      return false;
    }
    /* The step count bounds the walk, should stored parents ever form a ring. */
    let above = parentOf(variants, variant);
    for (let steps = 0; above && steps < variants.length; steps += 1) {
      if (!above.isDeleted) {
        return false;
      }
      above = parentOf(variants, above);
    }
    return true;
  });
}

/** The variant and every variant below it, live or deleted. */
function branchIds(variants: readonly MergeVariant[], rootId: string) {
  const branch = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const variant of variants) {
      if (variant.parentId && branch.has(variant.parentId) && !branch.has(variant._id)) {
        branch.add(variant._id);
        grew = true;
      }
    }
  }
  return branch;
}

/** What blocks the review, in the words its button gives as the reason; nothing when the plan may be reviewed. */
function blockedReason(
  placements: readonly MergePlacement[],
  roots: readonly MergeVariant[],
  previews: Record<string, MergePreview | Error | undefined>,
  isSettled: boolean,
  reparent: boolean
) {
  const answers = placements.map((placement) => previews[placement.factionId]);
  if (answers.some((answer) => answer instanceof Error)) {
    return 'Fix what the preview refuses first.';
  }
  if (!isSettled || answers.includes(undefined)) {
    return 'The preview is loading.';
  }
  if (answers.some((answer) => !(answer instanceof Error) && answer?.branch.some((entry) => entry.nameClash))) {
    return 'Give every variant a name the faction does not have yet.';
  }
  const unchanged = placements.every(
    (placement, index) => placement.parentId === roots[index]!.parentId && placement.name.trim() === roots[index]!.name
  );
  return reparent && unchanged ? 'Choose another parent or name first.' : undefined;
}

/**
 * The plan for every moving variant: one pane each, then what is true of the write as a whole and its review.
 * `source` is the faction being merged, or null when a variant moves inside the kept faction.
 */
function Plan({
  target,
  source,
  roots,
  draft,
  dispatch,
  onSubmit,
}: PlanControls & Readonly<{ target: MergeFaction; source: MergeFaction | null; roots: readonly MergeVariant[] }>) {
  const liveTargets = target.variants.filter((variant) => !variant.isDeleted);
  const firstParent = liveTargets.some((variant) => variant._id === target.defaultVariantId)
    ? target.defaultVariantId
    : null;
  const placements: MergePlacement[] = roots.map((root) => {
    const row = draft.rows[root._id];
    const offered = source ? firstParent : root.parentId;
    return {
      factionId: root._id,
      familyId: target.familyId,
      parentId: row?.parentId === undefined ? offered : row.parentId,
      name: row?.name ?? root.name,
    };
  });
  const { previews, isSettled } = useMergePreviews(placements);
  const moved = new Set(roots.flatMap((root) => [...branchIds(source?.variants ?? [], root._id)]));
  const leftBehind = (source?.variants ?? []).filter((variant) => !moved.has(variant._id)).length;
  return (
    <>
      {roots.map((root, index) => {
        const branch = branchIds(target.variants, root._id);
        return (
          <Section
            key={root._id}
            title={source ? `${source.name} · ${root.name}` : root.name}
            icon={<GitBranch size={18} aria-hidden />}
          >
            <Surface padding="md">
              <VariantPane
                placement={placements[index]!}
                preview={previews[root._id]}
                targetName={target.name}
                parents={liveTargets.filter((variant) => !branch.has(variant._id))}
                onChange={(change) => dispatch({ type: 'row', id: root._id, change })}
              />
            </Surface>
          </Section>
        );
      })}
      <Section title={source ? 'The whole merge' : 'The whole move'}>
        <Surface padding="md">
          <Stack gap="md">
            {source ? (
              <Text size="sm">
                {roots.length === 1
                  ? `1 variant of ${source.name} merges into ${target.name}, with the variants under it.`
                  : `${roots.length} variants of ${source.name} merge into ${target.name}, each with the variants under it.`}
                {leftBehind > 0
                  ? ` ${plural(leftBehind, 'deleted variant')} ${leftBehind === 1 ? 'stays' : 'stay'} behind in ${source.name}.`
                  : ''}
              </Text>
            ) : null}
            <Review
              target={target}
              source={source}
              placements={placements}
              blocked={blockedReason(placements, roots, previews, isSettled, source === null)}
              reviewing={draft.review}
              onReview={(value) => dispatch({ type: 'review', value })}
              onConfirm={() => onSubmit(placements, target.name)}
            />
          </Stack>
        </Surface>
      </Section>
    </>
  );
}

const DETAIL = { '--disclosure-font-size': 'var(--mantine-font-size-sm)' } as CSSProperties;

/**
 * One line of the preview that opens to the full list on a press.
 * A Disclosure stretches its toggle over the nearest positioned box, so each line is its own.
 */
function Detail({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <Box pos="relative" style={DETAIL}>
      <Disclosure title={title}>{children}</Disclosure>
    </Box>
  );
}

function FieldList({ fields }: Readonly<{ fields: readonly string[] }>) {
  return (
    <List size="sm" spacing={2}>
      {fields.map((field) => (
        <List.Item key={field}>{fieldLabel(field)}</List.Item>
      ))}
    </List>
  );
}

/** One moving variant: its name and parent in the faction it joins, then what the preview says the move does to it. */
function VariantPane({
  placement,
  preview,
  targetName,
  parents,
  onChange,
}: Readonly<{
  placement: MergePlacement;
  preview: MergePreview | Error | undefined;
  targetName: string;
  parents: readonly MergeVariant[];
  onChange: (change: RowDraft) => void;
}>) {
  const answer = preview instanceof Error ? undefined : preview;
  const parent = parents.find((variant) => variant._id === placement.parentId);
  return (
    <Stack gap="md">
      <SimpleGrid type="container" cols={PAIR} spacing="md">
        <ControlBlock
          title="Variant name"
          description={`What sets this variant apart from the others.\nIt is always shown beside ${targetName}, so leave that name out.`}
          warning={
            answer?.branch[0]?.nameClash
              ? `${targetName} already has a variant called “${answer.branch[0].name}”.`
              : undefined
          }
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
          input={(field) => (
            <Select
              {...field}
              allowDeselect={false}
              data={[
                { value: NO_PARENT, label: 'No parent' },
                ...parents.map((variant) => ({ value: variant._id, label: variant.name })),
              ]}
              value={placement.parentId ?? NO_PARENT}
              onChange={(value) => onChange({ parentId: value === NO_PARENT ? null : value })}
            />
          )}
        />
      </SimpleGrid>
      {preview instanceof Error ? (
        <FormError title="This placement is refused">{mutationErrorMessage(preview)}</FormError>
      ) : null}
      {preview === undefined ? <Pending>Loading the preview…</Pending> : null}
      {answer ? <PreviewLines placement={placement} preview={answer} parentName={parent?.name} /> : null}
    </Stack>
  );
}

/** What the preview says of one variant: the fields that stay custom, then one line each for what is equal, what moves along and what is rewritten. */
function PreviewLines({
  placement,
  preview,
  parentName,
}: Readonly<{ placement: MergePlacement; preview: MergePreview; parentName: string | undefined }>) {
  const along = preview.branch.slice(1);
  const deleted = along.filter((entry) => entry.isDeleted).length;
  const clashes = along.filter((entry) => entry.nameClash);
  return (
    <>
      {parentName === undefined ? (
        <Text size="sm">{`Without a parent, all ${INHERITABLE_FIELDS.length} fields stay custom and no ids change.`}</Text>
      ) : (
        <>
          {preview.custom.length > 0 ? (
            <Stack gap="xs">
              <Text size="sm">
                {`${plural(preview.custom.length, 'field')} ${preview.custom.length === 1 ? 'differs' : 'differ'} from ${parentName} and ${preview.custom.length === 1 ? 'stays' : 'stay'} custom:`}
              </Text>
              <FieldList fields={preview.custom} />
            </Stack>
          ) : (
            <Text size="sm">{`Every field equals ${parentName}.`}</Text>
          )}
          {preview.followed.length > 0 ? (
            <Detail
              title={`${plural(preview.followed.length, 'equal field')} ${preview.followed.length === 1 ? 'follows' : 'follow'} the parent`}
            >
              <Stack gap="xs">
                <Text size="sm">{`Equal to ${parentName}, so each switches to Use parent variant:`}</Text>
                <FieldList fields={preview.followed} />
              </Stack>
            </Detail>
          ) : null}
        </>
      )}
      {clashes.map((entry) => (
        <Notice key={entry._id} tone="caution" title={`“${entry.name}” is taken`}>
          {`${preview.targetName} already has a variant called “${entry.name}”, and this one moves along under its own name. Rename it on its own page first.`}
        </Notice>
      ))}
      {along.length > 0 ? (
        <Detail
          title={`${plural(along.length, 'variant')} ${along.length === 1 ? 'moves' : 'move'} along${deleted > 0 ? `, ${deleted} deleted` : ''}`}
        >
          <List size="sm" spacing={2}>
            {along.map((entry) => (
              <List.Item key={entry._id} icon={<GitBranch size={14} aria-hidden />}>
                {entry.isDeleted ? `${entry.name}, deleted` : entry.name}
              </List.Item>
            ))}
          </List>
        </Detail>
      ) : null}
      {preview.branch.some((entry) => entry.changesIds) ? (
        <References placement={placement} />
      ) : (
        <Text size="sm">No references to rewrite.</Text>
      )}
    </>
  );
}

/** The Rulebook drafts and Editions that point at leaders and troops the variant gives up, as one line that opens to the list. */
function References({ placement }: Readonly<{ placement: MergePlacement }>) {
  const drafts = useMergeReferences(placement, 'drafts');
  const editions = useMergeReferences(placement, 'editions');
  if (!drafts.isDone || !editions.isDone) {
    return <Pending>Counting the references to rewrite…</Pending>;
  }
  const rows = [...drafts.rows, ...editions.rows];
  if (rows.length === 0) {
    return <Text size="sm">No references to rewrite.</Text>;
  }
  const total = rows.reduce((sum, row) => sum + row.references, 0);
  return (
    <Detail title={`${plural(total, 'reference')} to rewrite`}>
      <List size="sm" spacing={2}>
        {rows.map((row, index) => (
          <List.Item key={`${row.rulebookName}-${row.edition ?? 'draft'}-${index}`}>
            {`${row.rulebookName}, ${row.edition === null ? 'draft' : `Edition ${row.edition}`}: ${row.references}`}
          </List.Item>
        ))}
      </List>
    </Detail>
  );
}

/** The review in place, as the account merge has it: Review, then the write or Cancel. */
function Review({
  target,
  source,
  placements,
  blocked,
  reviewing,
  onReview,
  onConfirm,
}: Readonly<{
  target: MergeFaction;
  source: MergeFaction | null;
  placements: readonly MergePlacement[];
  blocked: string | undefined;
  reviewing: boolean;
  onReview: (value: boolean) => void;
  onConfirm: () => void;
}>) {
  if (!reviewing || blocked) {
    return (
      <Group>
        <LabeledAction
          emphasis="strong"
          icon={<Eye size={16} />}
          disabledReason={blocked}
          onClick={() => onReview(true)}
        >
          {source ? 'Review merge' : 'Review move'}
        </LabeledAction>
      </Group>
    );
  }
  const moving = placements[0]!;
  const parent = target.variants.find((variant) => variant._id === moving.parentId);
  return (
    <>
      {source ? (
        <Text>
          <strong>{target.name}</strong> keeps its name and address. Every live variant of{' '}
          <strong>{source.name}</strong> moves into it, and every reference to a leader or troop it gives up is
          rewritten. The address of {source.name} will lead to {target.name} once it has no live variant left.
        </Text>
      ) : (
        <Text>
          <strong>{moving.name.trim()}</strong>
          {parent ? (
            <>
              {' '}
              moves under <strong>{parent.name}</strong>
            </>
          ) : (
            ' becomes a variant without a parent'
          )}{' '}
          in {target.name}, with the variants under it. Every reference to a leader or troop it gives up is rewritten.
        </Text>
      )}
      <Text size="sm">This is a production write. It cannot be undone.</Text>
      <Group>
        <LabeledAction intent="negative" emphasis="strong" icon={<Merge size={16} />} onClick={onConfirm}>
          {source ? `Merge into ${target.name}` : 'Move variant'}
        </LabeledAction>
        <LabeledAction icon={<X size={16} />} onClick={() => onReview(false)}>
          Cancel
        </LabeledAction>
      </Group>
    </>
  );
}
