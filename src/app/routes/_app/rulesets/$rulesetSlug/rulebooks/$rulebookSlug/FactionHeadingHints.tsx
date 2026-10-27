import { Tooltip } from '@mantine/core';
import type { RefObject } from 'react';
import { useEffect, useReducer, useState } from 'react';

/* Frozen publication markup cannot supply React children to Tooltip, so the app binds its shared pane to each faction heading. */
function FactionHeadingTooltip({ target }: { target: HTMLElement }) {
  const [opened, setOpened] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    const tabIndex = target.getAttribute('tabindex');
    let hovering = false;
    const focus = () => setOpened(true);
    /* Mantine retains its hover state while this heading controls focus or Escape dismissal. */
    const blur = () => setOpened((current) => (current === false && hovering ? false : undefined));
    const enter = () => {
      hovering = true;
      if (target.ownerDocument.activeElement === target) {
        setOpened(true);
      }
    };
    const leave = () => {
      hovering = false;
      if (target.ownerDocument.activeElement !== target) {
        setOpened(undefined);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpened(false);
      }
    };
    target.setAttribute('tabindex', '0');
    target.addEventListener('focus', focus);
    target.addEventListener('blur', blur);
    target.addEventListener('keydown', escape);
    target.addEventListener('mouseenter', enter);
    target.addEventListener('mouseleave', leave);
    return () => {
      if (tabIndex === null) {
        target.removeAttribute('tabindex');
      } else {
        target.setAttribute('tabindex', tabIndex);
      }
      target.removeEventListener('focus', focus);
      target.removeEventListener('blur', blur);
      target.removeEventListener('keydown', escape);
      target.removeEventListener('mouseenter', enter);
      target.removeEventListener('mouseleave', leave);
    };
  }, [target]);
  return <Tooltip target={target} label={target.dataset.factionName} opened={opened} withArrow />;
}

function factionHeadingTargets(_current: HTMLElement[], event: { kind: 'bind'; targets: HTMLElement[] }) {
  return event.targets;
}

export function FactionHeadingHints({ root, content }: { root: RefObject<HTMLDivElement | null>; content: unknown }) {
  const [targets, bind] = useReducer(factionHeadingTargets, []);
  useEffect(() => {
    bind({ kind: 'bind', targets: [...(root.current?.querySelectorAll<HTMLElement>('h2[data-faction-name]') ?? [])] });
  }, [root, content]);
  return targets.map((target) => (
    <FactionHeadingTooltip
      key={`${target.closest('[data-rulebook-page-id]')?.getAttribute('data-rulebook-page-id')}:${target.dataset.rulebookBlockId}`}
      target={target}
    />
  ));
}
