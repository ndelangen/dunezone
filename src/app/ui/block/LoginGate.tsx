import { Anchor, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';

export interface LoginGateProps {
  /** What signing in would let the reader do, as the tail of "Log in to ...": "create a faction", "start a group", "view migration activity". */
  action: string;
}

/**
 * Tells a signed-out reader that signing in is what stands between them and this page.
 *
 * The load state that is nobody's fault: the page works, the data is fine, and the reader is not the audience yet.
 * Caller hands the verb phrase, since only the page knows what it is for;
 * this owns the sentence around it and the one destination, which is allowed to be hardcoded here for the same reason `ProfileLink`'s is, that the destination is the component's name.
 *
 * It exists because nine routes wrote this sentence and three of them spelled the link as a themed anchor while six left it as the browser's default blue one, so the same offer looked like two different things depending on where you met it.
 */
export function LoginGate({ action }: LoginGateProps) {
  return (
    <Text>
      <Anchor renderRoot={(rootProps) => <Link {...rootProps} to="/auth/login" />}>Log in</Anchor> to {action}.
    </Text>
  );
}
