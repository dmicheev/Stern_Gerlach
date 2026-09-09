import { describe, expect, it } from 'vitest'
import { adaptiveZRangeMm, Z_RANGE_MIN, Z_RANGE_MAX } from '../scale'

describe('adaptiveZRangeMm', () => {
  it('keeps the minimum range for small deflections', () => {
    expect(adaptiveZRangeMm(0)).toBe(Z_RANGE_MIN)
    expect(adaptiveZRangeMm(50)).toBe(Z_RANGE_MIN)
    expect(adaptiveZRangeMm(74)).toBe(Z_RANGE_MIN) // 74*1.08 = 79.9 -> floor 80
  })

  it('quantizes upward in 20 mm steps with 8% headroom', () => {
    expect(adaptiveZRangeMm(75)).toBe(100) // 81 -> 100
    expect(adaptiveZRangeMm(100)).toBe(120) // 108 -> 120
    expect(adaptiveZRangeMm(160)).toBe(180)
    expect(adaptiveZRangeMm(175)).toBe(200) // 189 -> 200
  })

  it('caps at the maximum range', () => {
    expect(adaptiveZRangeMm(500)).toBe(Z_RANGE_MAX)
    expect(adaptiveZRangeMm(1e6)).toBe(Z_RANGE_MAX)
  })
})
