import { Button, Group, Stack, Text } from '@mantine/core';
import preview from '@sb/preview';
import { useState } from 'react';

import { BackModesVariant } from './BackModesPrototype';
import type { BackMode } from './BackModesPrototype';
import { initialTokenDraft } from './TokenEditor';

/*
 * PROTOTYPE — wayfinder #594, map #590. Throwaway, not a kit story.
 *
 * Three candidate presentations of the token back's three modes. Storybook rather than the app,
 * because judging the control needs no database and the dev deployment holds no tokens anyway.
 * The picker is stubbed: 591 filtered it to same-type tokens whose back is authored, and with no
 * such tokens in any environment the real one renders empty regardless of presentation.
 */

const TYPE = 'token-disc';

/** A draft with both faces composed, so the "authored" and "same as front" tiles have something to draw. */
function sampleDraft() {
  const draft = initialTokenDraft(TYPE);
  return {
    ...draft,
    name: 'Spice Blow',
    front: { ...draft.front, top: 'SPICE', bottomFirst: 'BLOW' },
    back: draft.back.mode === 'custom' ? { ...draft.back, face: { ...draft.back.face, top: 'DUNE' } } : draft.back,
  };
}

/** Stands in for the real AssetPicker, which needs same-type tokens with authored backs to show anything. */
function StubPicker(disabled: boolean) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Text size="sm" c={disabled ? 'dimmed' : undefined}>
        No token chosen yet
      </Text>
      <Button variant="light" size="compact-sm" disabled={disabled}>
        Choose
      </Button>
      <Text size="xs" c="dimmed">
        (stub: real picker previews back faces)
      </Text>
    </Group>
  );
}

function Harness({ variant }: { variant: string }) {
  const draft = sampleDraft();
  const [mode, setMode] = useState<BackMode>('authored');
  return (
    <Stack gap="md" style={{ maxWidth: 560 }}>
      <BackModesVariant
        variant={variant}
        draft={draft}
        type={TYPE}
        backPicker={StubPicker}
        mode={mode}
        setMode={setMode}
      />
      <Text size="xs" c="dimmed">
        mode: {mode}
      </Text>
    </Stack>
  );
}

const meta = preview.meta({
  title: 'Back modes prototype (#594)',
  component: Harness,
});

/** #588's proposal: a same-front-and-back switch, with the remaining two-way choice underneath. */
export const AToggleThenChoose = meta.story({ args: { variant: 'A' } });

/** One flat control naming all three modes at once. */
export const BThreeWayControl = meta.story({ args: { variant: 'B' } });

/** No abstract control: three tiles drawn with the real renderer, chosen by looking. */
export const CChooseByLooking = meta.story({ args: { variant: 'C' } });
