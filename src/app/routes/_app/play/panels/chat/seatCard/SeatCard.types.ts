import type { Mention } from '../mentions';

/** What a seat's card shows and offers: the seat, and the ways to its faction information and its player's chat. */
export type SeatCardProps = Readonly<{
  mention: Mention;
  /** Brings up the seat's faction information; absent where there is nothing to bring it up in. */
  onInfo?: () => void;
  /** Opens the chat with the seat's player; absent for the viewer's own seat, or where the viewer has no chat with them. */
  onChat?: () => void;
}>;
