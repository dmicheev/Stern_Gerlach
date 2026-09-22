/**
 * Monotonic request sequencing for worker messages.
 *
 * Every request gets a fresh increasing id; a response is only accepted if
 * its id is still the latest one issued on that channel. This makes stale
 * out-of-order results (a slow computation finishing after a newer one)
 * impossible to apply to the UI.
 */
export class RequestSeq {
  private current = 0

  /** id for a new request (monotonically increasing, starts at 1) */
  next(): number {
    return ++this.current
  }

  /** true iff `id` refers to the most recent request (not superseded) */
  isCurrent(id: number): boolean {
    return id === this.current
  }
}
