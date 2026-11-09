import { Stack, Text, ThemeIcon } from '@mantine/core';
import { LabeledAction } from '@ui/control/LabeledAction';
import { Surface } from '@ui/surface';
import { Lightbulb, MessageCirclePlus } from 'lucide-react';

import styles from './ToolSuggestion.module.css';

/** Under the tools catalogue: a way to ask for the tool that is not there yet. */
export function ToolSuggestion({ href }: Readonly<{ href: string }>) {
  return (
    <Surface as="section" aria-label="Suggest a tool" padding="lg" className={styles.suggest}>
      <ThemeIcon size={56} radius="50%" variant="light" color="dune" aria-hidden>
        <Lightbulb />
      </ThemeIcon>
      <Stack gap={4} className={styles.suggestWords}>
        <Text fw={700}>Missing a tool?</Text>
        <Text size="sm" c="dimmed">
          Tell us what you keep track of on paper, and it may be the next one here.
        </Text>
      </Stack>
      <LabeledAction
        emphasis="strong"
        icon={<MessageCirclePlus size={17} />}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        Suggest a tool
      </LabeledAction>
    </Surface>
  );
}
