/**
 * The room's one Durable Object alarm, as this instance last set it.
 * The battle deadline, delivery retries, pass expiries and a pending provisioning confirmation all share it.
 */
export class RoomAlarm {
  /* The alarm this instance last set, or null for none; undefined until it sets one, since the stored alarm is then unknown. */
  private at: number | null | undefined;

  constructor(private readonly storage: DurableObjectStorage) {}

  /** The alarm that fired is no longer stored. */
  fired() {
    this.at = undefined;
  }

  /** Sets the alarm to `at`, or clears it for null; only a change reaches storage. */
  schedule(at: number | null): Promise<void> {
    if (at === this.at) {
      return Promise.resolve();
    }
    this.at = at;
    return (at === null ? this.storage.deleteAlarm() : this.storage.setAlarm(at)).catch((error: unknown) => {
      /* A write that failed leaves the stored alarm unknown, so the next schedule writes again. */
      this.at = undefined;
      throw error;
    });
  }

  /** Arms the alarm for `at` whatever this instance last set, so work in flight stays recoverable. */
  async arm(at: number) {
    this.at = undefined;
    await this.storage.setAlarm(at);
  }

  /** Clears the alarm once the work it guarded has settled. */
  async clear() {
    await this.storage.deleteAlarm();
    this.at = null;
  }
}
