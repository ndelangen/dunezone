import { z } from 'zod';

export const BIDDING_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const biddingCodeSchema = z.string().regex(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
export const biddingDeviceSchema = z.object({ id: z.uuid(), secret: z.string().regex(/^[a-f0-9]{64}$/) });
export const biddingTableAddressSchema = z.object({
  code: biddingCodeSchema,
  tableId: z.uuid(),
  centralSecret: z.string().regex(/^[a-f0-9]{64}$/),
});
export type BiddingDevice = z.infer<typeof biddingDeviceSchema>;
export type BiddingTableAddress = z.infer<typeof biddingTableAddressSchema>;
export type BiddingRole = 'central' | 'remote';

export const BIDDING_FRAME_BYTES = 262_144;
export const BIDDING_REMOTE_LIMIT = 24;
export const BIDDING_PROTOCOL_VERSION = 2;
export const BIDDING_REPLACED = 4001;
export const BIDDING_REFUSED = 4003;
export const BIDDING_PING = 'bidding:ping';
export const BIDDING_PONG = 'bidding:pong';
export const biddingPath = (code: string, operation: 'create' | 'socket') => `/__play/bidding/${code}/${operation}`;
export const biddingPathPattern = /^\/__play\/bidding\/([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6})\/(create|socket)$/;
export const biddingCreateSchema = biddingTableAddressSchema.omit({ code: true });

export const biddingPacketSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('app'), data: z.unknown() }).strict(),
  z.object({ kind: z.enum(['offer', 'answer']), negotiationId: z.uuid(), sdp: z.string().max(32_768) }).strict(),
]);
export type BiddingPacket = z.infer<typeof biddingPacketSchema>;
export const biddingDirectFrameSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('app'), data: z.unknown() }).strict(),
  z
    .object({
      kind: z.literal('chunk'),
      id: z.uuid(),
      part: z.int().min(0).max(127),
      total: z.int().min(1).max(128),
      data: z.string().max(2048),
    })
    .strict(),
]);
export const biddingClientFrameSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('join'),
      role: z.enum(['central', 'remote']),
      protocol: z.int().min(1).optional(),
      tableId: z.uuid().optional(),
      device: biddingDeviceSchema,
      centralSecret: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
      centralInstanceId: z.uuid().optional(),
      generation: z.int().min(1).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('relay'),
      to: z.union([z.enum(['central', 'remotes']), z.uuid(), z.array(z.uuid()).min(1).max(BIDDING_REMOTE_LIMIT)]),
      packet: biddingPacketSchema,
    })
    .strict(),
]);
export type BiddingClientFrame = z.infer<typeof biddingClientFrameSchema>;
const peerSchema = z.object({ deviceId: z.uuid(), connectionId: z.uuid() });
export const biddingServerFrameSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.enum(['welcome', 'presence']),
      tableId: z.uuid(),
      connectionId: z.uuid(),
      centralConnectionId: z.uuid().nullable(),
      remotes: z.array(peerSchema).max(BIDDING_REMOTE_LIMIT),
    })
    .strict(),
  z
    .object({
      type: z.literal('relay'),
      from: z.union([z.literal('central'), z.uuid()]),
      connectionId: z.uuid(),
      packet: biddingPacketSchema,
    })
    .strict(),
]);
export type BiddingServerFrame = z.infer<typeof biddingServerFrameSchema>;

/** UTF-8 limits apply equally to relay and direct frames. */
export function biddingFrameFits(frame: string): boolean {
  return frame.length <= BIDDING_FRAME_BYTES && new TextEncoder().encode(frame).byteLength <= BIDDING_FRAME_BYTES;
}
