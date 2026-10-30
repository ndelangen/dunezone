import { Slider, Stack, Text } from '@mantine/core';
import { PHYSICAL_SIZE_MAX, PHYSICAL_SIZE_MIN } from '@shared/assets/schema';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import type { ConnectedTabsItem } from '@ui/surface/ConnectedTabs';

/**
 * The one chapter every asset editor shares: About, the off-face prose (CONTEXT.md: About).
 *
 * It is a chapter rather than a field inside an existing one because it is the only thing an editor holds that never reaches the artifact.
 * The treachery editor's chapters are Head, Icon, Decals and Body, all face vocabulary, and the token and deck editors keep Identity for what a thing *is* rather than for what explains it.
 *
 * Built as a whole tab item rather than a bare control so the label, the glyph and the copy cannot drift between the three editors that mount it.
 */
export function aboutChapter(
  about: string,
  onChange: (about: string) => void,
  physicalSize?: PhysicalSizeField
): ConnectedTabsItem<'about'> {
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
              <FormattedTextInput aria-label="About" minRows={4} value={about} onChange={onChange} />
              <Text size="xs" c="dimmed">
                Optional. Use *bold*, -italics-, _underline_, paragraphs, or dash lists.
              </Text>
            </Stack>
          }
        />
        {physicalSize && <PhysicalSizeControl {...physicalSize} />}
      </Stack>
    ),
  };
}

/** A token's size in play as a share of the standard size; absent means standard. */
type PhysicalSizeField = { value: number | undefined; onChange: (physicalSize: number | undefined) => void };

/* Standard is stored as no value at all, so a token nobody resized keeps the shape it was saved with. */
function PhysicalSizeControl({ value, onChange }: PhysicalSizeField) {
  return (
    <ControlBlock
      title="Physical size"
      description={
        "This token's size on a private side-table, against a standard token.\nMake it small for a marker that sits on a card's track."
      }
      input={
        <Slider
          aria-label="Physical size"
          min={PHYSICAL_SIZE_MIN * 100}
          max={PHYSICAL_SIZE_MAX * 100}
          step={5}
          value={(value ?? 1) * 100}
          onChange={(percent) => onChange(percent === 100 ? undefined : percent / 100)}
          label={(percent) => `${percent}%`}
          marks={[{ value: 100, label: 'Standard' }]}
          mb="lg"
        />
      }
    />
  );
}
