import styles from './FactList.module.css';

interface Fact {
  label: string;
  value: string;
}

export interface FactListProps {
  /** The facts, in reading order. */
  facts: readonly Fact[];
}

/**
 * A printed line of facts, each a small caption over its value, ruled off above: the line along a ticket's foot.
 *
 * Callers own the facts;
 * this component owns that they are a description list and how they wrap.
 */
export function FactList({ facts }: FactListProps) {
  return (
    <dl className={styles.facts}>
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
