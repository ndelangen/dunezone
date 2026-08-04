import { Button } from '@mantine/core';
import type { ButtonProps } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Plus } from 'lucide-react';

import styles from './CreateFactionCta.module.css';

export function CreateFactionCta({
  children = 'Create your own faction',
  size = 'md',
  withArrow = false,
  attention = false,
}: {
  children?: string;
  size?: ButtonProps['size'];
  withArrow?: boolean;
  attention?: boolean;
}) {
  return (
    <Button
      color="confirm"
      className={attention ? styles.attention : undefined}
      size={size}
      leftSection={withArrow ? undefined : <Plus size={size === 'sm' ? 15 : 17} aria-hidden />}
      rightSection={
        withArrow ? <ArrowRight size={size === 'sm' ? 15 : 17} aria-hidden /> : undefined
      }
      renderRoot={(rootProps) => <Link {...rootProps} to="/factions/create" />}
    >
      {children}
    </Button>
  );
}
