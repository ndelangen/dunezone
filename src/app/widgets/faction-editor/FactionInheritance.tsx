import { Group, Radio, Stack, Text } from '@mantine/core';
import type { InheritableField } from '@shared/factions/variantFields';
import { complexityOutOfTen } from '@ui/content/complexity';
import { EmptyNote } from '@ui/content/EmptyNote';
import { FormattedTextSource } from '@ui/content/FormattedText';
import { ControlBlock } from '@ui/control/ControlBlock';
import type { ControlBlockProps } from '@ui/control/ControlBlock';
import { CornerDownRight } from 'lucide-react';
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { Faction } from '@db/factions';

import styles from './FactionInheritance.module.css';

/**
 * What a variant with a parent takes from it, as the editor's page hands it over.
 * `inherited` belongs to the draft: the page keeps it beside the form and saves the two together.
 */
export type FactionInheritance = {
  parentName: string;
  /** The parent's current data, shown read-only for each field that follows it. */
  parent: Faction;
  inherited: readonly InheritableField[];
  onChange: (field: InheritableField, followsParent: boolean) => void;
};

const InheritanceContext = createContext<FactionInheritance | null>(null);

/** Hands the chapters below the variant's inheritance; without it every field is the variant's own, as on a variant with no parent. */
export const FactionInheritanceProvider = InheritanceContext.Provider;

function Lines({ lines, empty }: { lines: string[]; empty?: string }) {
  if (lines.length === 0) {
    return <EmptyNote>{empty ?? 'None.'}</EmptyNote>;
  }
  return (
    <Stack gap={2}>
      {lines.map((line, index) => (
        <Text key={`${line}-${index}`} size="sm">
          {line}
        </Text>
      ))}
    </Stack>
  );
}

function Prose({ source }: { source: string }) {
  return source.trim() ? <FormattedTextSource source={source} size="sm" /> : <EmptyNote>Empty.</EmptyNote>;
}

/** The parent's value for each field, in a few lines: enough to decide whether to keep following it. */
const parentValues: Record<InheritableField, (parent: Faction) => ReactNode> = {
  factionLeader: (parent) => <Lines lines={[parent.factionLeader.name].filter(Boolean)} empty="No name." />,
  leaders: (parent) => (
    <Lines
      lines={parent.leaders.map((leader) => `${leader.name} · strength ${leader.strength ?? '?'}`)}
      empty="No supporting leaders."
    />
  ),
  decals: (parent) => (
    <Lines
      lines={parent.decals.length > 0 ? [`${parent.decals.length} on the alliance card`] : []}
      empty="No decals."
    />
  ),
  planet: (parent) => <Lines lines={(parent.planet ?? []).map((planet) => planet.name)} empty="No planets." />,
  troops: (parent) => (
    <Lines lines={parent.troops.map((troop) => `${troop.name} ×${troop.count}`)} empty="No troop types." />
  ),
  'rules.startText': (parent) => <Prose source={parent.rules.startText} />,
  'rules.revivalText': (parent) => <Prose source={parent.rules.revivalText} />,
  'rules.spiceCount': (parent) => <Lines lines={[`${parent.rules.spiceCount} spice`]} />,
  'rules.treacheryTracker': (parent) => <Lines lines={[parent.rules.treacheryTracker ? 'On' : 'Off']} />,
  'rules.advantages': (parent) => (
    <Lines
      lines={parent.rules.advantages.map((advantage, index) => advantage.title?.trim() || `Advantage ${index + 1}`)}
      empty="No faction advantages."
    />
  ),
  'rules.fate': (parent) => (
    <Stack gap={2}>
      {parent.rules.fate.title ? (
        <Text size="sm" fw={700}>
          {parent.rules.fate.title}
        </Text>
      ) : null}
      <Prose source={parent.rules.fate.text} />
    </Stack>
  ),
  'rules.alliance': (parent) => <Prose source={parent.rules.alliance.text} />,
  extras: (parent) => <Lines lines={(parent.extras ?? []).map((extra) => extra.slug)} empty="No Extras." />,
  extraPhases: (parent) => (
    <Lines
      lines={(parent.extraPhases ?? []).map((phase, index) => phase.title?.trim() || `Phase ${index + 1}`)}
      empty="No faction phases."
    />
  ),
  'complexity.manual': ({ complexity }) => (
    <Lines
      lines={[
        complexity?.manual == null
          ? 'Automatic, from the rules text.'
          : `${complexityOutOfTen(complexity.manual)}/10, set by hand.`,
      ]}
    />
  ),
};

function InheritanceChoice({
  title,
  followsParent,
  onChange,
}: {
  title: string;
  followsParent: boolean;
  onChange: (followsParent: boolean) => void;
}) {
  return (
    <Radio.Group value={followsParent ? 'parent' : 'custom'} onChange={(value) => onChange(value === 'parent')}>
      {/* Named here because Mantine puts a label given to the group on a wrapper that has no role. */}
      <Group gap="md" wrap="nowrap" role="group" aria-label={`${title}: use parent variant or custom`}>
        <Radio size="xs" value="parent" label="Use parent variant" color="selected" />
        <Radio size="xs" value="custom" label="Custom" color="selected" />
      </Group>
    </Radio.Group>
  );
}

/**
 * One field a variant may take from its parent, for a chapter that places the choice in the field's own header (#2927).
 * `choice` is the Use parent variant or Custom control, and `parentValue` replaces the field's controls while it follows the parent: the parent's value, read-only.
 * Both are null outside a variant with a parent, where every field is the variant's own.
 */
export function useInheritableField(field: InheritableField, title: string) {
  const inheritance = useContext(InheritanceContext);
  if (!inheritance) {
    return { choice: null, parentValue: null };
  }
  const followsParent = inheritance.inherited.includes(field);
  const choice = (
    <InheritanceChoice
      title={title}
      followsParent={followsParent}
      onChange={(next) => inheritance.onChange(field, next)}
    />
  );
  if (!followsParent) {
    return { choice, parentValue: null };
  }
  const parentValue = (
    <div className={styles.following}>
      <ControlBlock
        title={title}
        tool={choice}
        input={
          <Stack
            gap="xs"
            className={styles.inherited}
            role="group"
            aria-label={`${title}, from ${inheritance.parentName}, read-only`}
          >
            <Group gap="xs" wrap="nowrap">
              <CornerDownRight size={14} aria-hidden />
              <Text size="xs" c="dimmed">
                {`From ${inheritance.parentName}, the parent variant. Read-only here.`}
              </Text>
            </Group>
            {parentValues[field](inheritance.parent)}
          </Stack>
        }
      />
    </div>
  );
  return { choice, parentValue };
}

/** A `ControlBlock` for a field a variant may take from its parent: the choice sits in its header, and the parent's value takes its place while the field follows the parent. */
export function InheritableControlBlock({
  field,
  ...block
}: Omit<ControlBlockProps, 'tool'> & { field: InheritableField }) {
  const { choice, parentValue } = useInheritableField(field, block.title);
  return parentValue ?? <ControlBlock {...block} tool={choice} />;
}

/** An inheritable field whose controls have no header of their own: this gives them one, named `title`, to hold the choice. */
export function InheritableFactionField({
  field,
  title,
  children,
}: {
  field: InheritableField;
  title: string;
  children: ReactNode;
}) {
  const { choice, parentValue } = useInheritableField(field, title);
  if (parentValue) {
    return parentValue;
  }
  return choice ? <ControlBlock title={title} tool={choice} input={children} /> : children;
}
