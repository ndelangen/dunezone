import { Input, Stack, VisuallyHidden } from '@mantine/core';
import type { FaqTag } from '@shared/faq/tags';
import { DEFAULT_FAQ_TAG, FAQ_TAG_VALUES } from '@shared/faq/tags';
import { FAQ_TAG_LABELS } from '@ui/content/faqTagLabels';

import styles from './FaqTagFieldset.module.css';

interface ControlledProps {
  /** The checked tags. Providing it makes the fieldset controlled; `onToggle` comes with it. */
  value: readonly FaqTag[];
  /** Fires when a tag's checkbox flips. The caller owns the selection. */
  onToggle: (tag: FaqTag, checked: boolean) => void;
}

interface UncontrolledProps {
  value?: undefined;
  onToggle?: undefined;
}

export type FaqTagFieldsetProps = ControlledProps | UncontrolledProps;

/**
 * The one vocabulary of FAQ tags, rendered identically wherever a question is tagged.
 * Owns the labelled fieldset, the hidden legend, and the tag wording, so the ask form and the edit session cannot drift apart.
 * Uncontrolled without props: the inputs are a form field named `tags` with the default tag pre-checked, read at submit time.
 * Controlled with `value` and `onToggle`: the caller's editing session owns the selection.
 */
export function FaqTagFieldset(props: FaqTagFieldsetProps) {
  return (
    <Input.Wrapper label="Tags">
      <Stack component="fieldset" gap="xs" className={styles.tagFieldset}>
        <VisuallyHidden component="legend">FAQ tags</VisuallyHidden>
        {FAQ_TAG_VALUES.map((tag) => (
          <label key={tag} className={styles.tagOption}>
            {props.value === undefined ? (
              <input type="checkbox" name="tags" value={tag} defaultChecked={tag === DEFAULT_FAQ_TAG} />
            ) : (
              <input
                type="checkbox"
                checked={props.value.includes(tag)}
                onChange={(event) => props.onToggle(tag, event.target.checked)}
              />
            )}
            <span>{FAQ_TAG_LABELS[tag]}</span>
          </label>
        ))}
      </Stack>
    </Input.Wrapper>
  );
}
