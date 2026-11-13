import { Accordion, Text } from '@mantine/core';
import type { ReactNode } from 'react';

import styles from './Disclosure.module.css';

interface DisclosureProps {
  /** The one line shown while shut, and the name of the toggle. */
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}

/**
 * One line that opens to more on a press, for an extra the reader need not see every time.
 *
 * It draws no box of its own.
 * The caller's box is the toggle, padding included: the hit area is stretched over the nearest positioned ancestor, so nothing else in that box can be pressed.
 * The title is quiet unless the caller's box sets `--disclosure-color`, `--disclosure-font-size` or `--disclosure-font-weight`.
 */
export function Disclosure({ title, icon, children }: DisclosureProps) {
  return (
    <Accordion
      classNames={{ item: styles.item, control: styles.control, label: styles.label, content: styles.content }}
    >
      <Accordion.Item value="only">
        <Accordion.Control icon={icon}>
          <Text inherit truncate>
            {title}
          </Text>
        </Accordion.Control>
        <Accordion.Panel>{children}</Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
