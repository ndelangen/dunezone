import { Stack, Text, Textarea } from '@mantine/core';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ControlBlock } from '@ui/control/ControlBlock';
import type { ConnectedTabsItem } from '@ui/surface/ConnectedTabs';

/**
 * The one chapter every asset editor shares: About, the off-face prose (CONTEXT.md: About).
 *
 * It is a chapter rather than a field inside an existing one because it is the only thing an editor holds that never reaches the artifact.
 * The treachery editor's chapters are Head, Icon, Decals and Body, all face vocabulary, and the token and deck editors keep Identity for what a thing *is* rather than for what explains it.
 *
 * Built as a whole tab item rather than a bare control so the label, the glyph and the copy cannot drift between the three editors that mount it.
 */
export function aboutChapter(about: string, onChange: (about: string) => void): ConnectedTabsItem<'about'> {
  return {
    value: 'about',
    label: 'About',
    icon: <TopicIcon topic="about" size={21} />,
    panel: (
      <Stack gap="lg">
        <ControlBlock
          title="About"
          description="Rule details that do not belong on the artwork. Shown on this asset's page, never on the face."
          input={
            <Stack gap="xs">
              <Textarea
                aria-label="About"
                autosize
                minRows={4}
                value={about}
                onChange={(event) => onChange(event.currentTarget.value)}
              />
              <Text size="xs" c="dimmed">
                Optional. Line breaks are kept; there is no formatting.
              </Text>
            </Stack>
          }
        />
      </Stack>
    ),
  };
}
