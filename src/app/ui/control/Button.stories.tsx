import { Button } from '@mantine/core';
import type { ButtonProps } from '@mantine/core';
import preview from '@sb/preview';

/* Mantine's Button is polymorphic, which the story factory cannot infer, so the stories render a plain one. */
function PlainButton(props: Pick<ButtonProps, 'loading' | 'disabled'>) {
  return <Button {...props}>Save changes</Button>;
}

/*
 * Mantine's Button under our theme. Its loading and disabled looks are its own, so the actions built on it
 * (`ConfirmDeleteButton`, `SubmitAction`) test that they turn them on rather than capturing them again (ADR-0005).
 */
const meta = preview.meta({
  title: 'Button',
  component: PlainButton,
  parameters: { layout: 'centered' },
});

export const Default = meta.story({});

/** While its action runs: a spinner in place of the words, and no second press. */
export const Loading = meta.story({ args: { loading: true } });

export const Disabled = meta.story({ args: { disabled: true } });
