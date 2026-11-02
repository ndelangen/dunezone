import { Stack, Text } from '@mantine/core';
import type { TablePiece } from '@shared/play/model';
import { FormattedTextSource } from '@ui/content/FormattedText';

import { pieceName } from '../../multiplayer/HandPiece';

/** What a piece is called where the inventory names it: a token by its own name, a card stack by its label, which never names a hidden face. */
export function inventoryName(piece: TablePiece): string {
  return piece.kind === 'card' ? piece.label : pieceName(piece);
}

/** A piece's tooltip: its name and count, and for a tech token what it does, as its author described it on the asset; both read the top item, the one its face shows. */
export function PieceTooltipLabel({ piece }: Readonly<{ piece: TablePiece }>) {
  const description = piece.items.at(-1)?.artwork?.description;
  return (
    <Stack gap={4}>
      <Text size="sm" fw={700}>
        {inventoryName(piece)}
        {piece.items.length > 1 ? ` × ${piece.items.length}` : ''}
      </Text>
      {description && <FormattedTextSource source={description} size="sm" />}
    </Stack>
  );
}
