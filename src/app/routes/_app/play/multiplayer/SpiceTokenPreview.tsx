import { Badge, Box } from '@mantine/core';
import { SPICE_TOKEN_HREF } from '@shared/play/spiceToken';
import { PublishedImage } from '@ui/content/PublishedImage';

/** The reserve's selected amount, shown both before pickup and at its proposed table position. */
export function SpiceTokenPreview({ amount }: Readonly<{ amount: number }>) {
  return (
    <Box pos="relative" w={64} h={64} aria-hidden>
      <PublishedImage src={SPICE_TOKEN_HREF} name="Spice" aspect={1} radius="50%" />
      <Badge
        pos="absolute"
        bottom={0}
        right={0}
        miw={26}
        maw={64}
        h="auto"
        mih={26}
        px={4}
        size="lg"
        variant="filled"
        ff="C_Advokat_Modern, serif"
        styles={{ label: { whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.2 } }}
      >
        {amount}
      </Badge>
    </Box>
  );
}
