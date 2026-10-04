/* Throwaway entry: the large renderer loads only after the visitor asks to join the demo. */
import { Button, Group, Text, Badge, Stack } from '@mantine/core';
import { lazy, Suspense, useState } from 'react';

import styles from './live.module.css';
const ConnectedDemo = lazy(() => import('./ConnectedDemo'));

export default function LiveDemo() {
  const [member, setMember] = useState(new URLSearchParams(location.search).get('role') === 'member');
  const [started, setStarted] = useState(false);
  return (
    <div className={styles.demo}>
      <div className={styles.table}>
        {started ? (
          <Suspense
            fallback={
              <Text ta="center" pt="xl">
                Opening the real 3D table…
              </Text>
            }
          >
            <ConnectedDemo key={String(member)} member={member} />
          </Suspense>
        ) : (
          <Stack align="center" justify="center" h="100%">
            <Text size="xl">There's room at the table.</Text>
            <Text>Explore the real board. See other visitors move the pieces.</Text>
            <Button onClick={() => setStarted(true)}>Wake up the table</Button>
          </Stack>
        )}
      </div>
      <Group justify="center" gap="md" mt="md">
        <Badge color="teal">Live table · prototype</Badge>
        <Text size="sm">
          {member ? 'Your cursor is visible. Drag a piece.' : 'You are watching. Guests stay invisible.'}
        </Text>
        <Button
          size="xs"
          variant="light"
          onClick={() => {
            setMember(!member);
            setStarted(true);
          }}
        >
          {member ? 'Simulate guest' : 'Simulate signed-in visitor'}
        </Button>
      </Group>
      <Text ta="center" size="xs" c="dimmed" mt="xs">
        Local experiment. Simulated sign-in. One shared room, reset every five minutes. Full games are still coming
        soon.
      </Text>
    </div>
  );
}
