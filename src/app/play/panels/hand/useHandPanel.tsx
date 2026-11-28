import { HandPanel } from './HandPanel';
import { useHandActions } from './useHandActions';
import type { HandProps } from './useHandActions';

/** The Hand window's content at a live table: the viewer's hand, and what each piece's menu and drags send. */
export function ConnectedHandPanel(props: HandProps) {
  return <HandPanel actions={useHandActions(props)} />;
}
