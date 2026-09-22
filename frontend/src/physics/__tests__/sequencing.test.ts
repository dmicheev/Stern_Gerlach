import { describe, expect, it } from 'vitest'
import { RequestSeq } from '../sequencing'

/**
 * Guards the worker race-condition fix: a slow computation finishing after a
 * newer request was issued must never be applied.
 */
describe('RequestSeq (worker stale-result guard)', () => {
  it('issues monotonically increasing ids', () => {
    const seq = new RequestSeq()
    expect(seq.next()).toBe(1)
    expect(seq.next()).toBe(2)
    expect(seq.next()).toBe(3)
  })

  it('simulated out-of-order arrival: UI stays on the newer result B', () => {
    const seq = new RequestSeq()
    const idA = seq.next() // user moves gradient -> calc A starts
    const idB = seq.next() // user moves again -> calc B starts (A not cancelled)

    // B finishes first and is current
    expect(seq.isCurrent(idB)).toBe(true)
    let applied: 'A' | 'B' | null = null
    if (seq.isCurrent(idB)) applied = 'B'
    expect(applied).toBe('B')

    // A finishes later and must be dropped
    expect(seq.isCurrent(idA)).toBe(false)
    if (seq.isCurrent(idA)) applied = 'A'
    expect(applied).toBe('B')
  })

  it('responses to an errored request do not poison the next one', () => {
    const seq = new RequestSeq()
    const bad = seq.next() // this request will throw in the worker
    const good = seq.next() // retry / new config
    expect(seq.isCurrent(bad)).toBe(false)
    expect(seq.isCurrent(good)).toBe(true)
  })
})
