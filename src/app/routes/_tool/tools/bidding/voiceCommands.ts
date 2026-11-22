export type VoiceCommand = { type: 'bid'; amount: number } | { type: 'raise' } | { type: 'pass' } | { type: 'reset' };

const amounts = [
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
  'TEN',
  'ELEVEN',
  'TWELVE',
  'THIRTEEN',
  'FOURTEEN',
  'FIFTEEN',
  'SIXTEEN',
  'SEVENTEEN',
  'EIGHTEEN',
  'NINETEEN',
  'TWENTY',
];

/** Only aliases from the fixed phrase list are actionable. */
export function voiceCommand(keyword: string): VoiceCommand | null {
  if (keyword === 'BID_PLUS_ONE') {
    return { type: 'raise' };
  }
  if (keyword === 'PASS') {
    return { type: 'pass' };
  }
  if (keyword === 'RESET') {
    return { type: 'reset' };
  }
  if (!keyword.startsWith('BID_')) {
    return null;
  }
  const index = amounts.indexOf(keyword.slice(4));
  return index < 0 ? null : { type: 'bid', amount: index + 1 };
}

/** A changed opportunity fences all audio captured before it, even if the same faction returns. */
export class VoiceCapture<Context> {
  private epoch = 0;
  private key: string | null = null;
  private context: Context | null = null;

  set(context: Context | null, key: string | null): number {
    if (key !== this.key || context === null) {
      this.epoch += 1;
      this.key = key;
      this.context = context === null ? null : structuredClone(context);
    }
    return this.epoch;
  }

  current(): number {
    return this.epoch;
  }

  take(epoch: number): Context | null {
    return epoch === this.epoch ? this.context : null;
  }
}
