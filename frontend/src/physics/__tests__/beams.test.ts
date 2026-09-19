import { describe, expect, it } from 'vitest'
import { screenFrame, toScreenFrame, WORLD_FRAME, buildBeamTree, branchPoint } from '../beams'
import type { Apparatus } from '../types'

function app(id: string, xStart: number, angleDeg = 0, attachTo = 'root'): Apparatus {
  return { id, attachTo, xStart, length: 0.12, angleDeg, gradient: 1500, b0: 0.5, gap: 0.006, blockedPort: null }
}

describe('screenFrame', () => {
  it('falls back to the world frame without apparatuses', () => {
    expect(screenFrame([], 500)).toEqual(WORLD_FRAME)
  })

  it('single apparatus at 0° is the identity frame', () => {
    const f = screenFrame([app('a', 0.25)], 500)
    expect(f.theta).toBe(0)
    expect(f.ny).toBeCloseTo(0)
    expect(f.nz).toBeCloseTo(1)
    expect(f.cy).toBeCloseTo(0)
    expect(f.cz).toBeCloseTo(0)
    const { s, t } = toScreenFrame(f, 0.002, -0.003)
    expect(s).toBeCloseTo(-0.003)
    expect(t).toBeCloseTo(0.002)
  })

  it('orients by the most downstream apparatus and its beam center', () => {
    const v = 500
    const a = app('a', 0.25, 0)
    const b = app('b', 0.45, 90, 'a:up')
    const f = screenFrame([a, b], v)
    // last apparatus at 90°: axis n = (0, -sin90, cos90) = (0, -1, 0)
    expect(f.theta).toBeCloseTo(Math.PI / 2)
    expect(f.ny).toBeCloseTo(-1)
    expect(f.nz).toBeCloseTo(0)
    // center sits on the deflected 'a:up' branch (above the axis in world Z)
    const center = branchPoint(buildBeamTree([a, b], v), 'a', 'up', 0.45, v)
    expect(f.cy).toBeCloseTo(center.y)
    expect(f.cz).toBeCloseTo(center.z)
    expect(f.cz).toBeGreaterThan(0)
    // a hit displaced along the last detector axis (+n = -Y world) is pure s
    const eps = 1e-3
    const hit = toScreenFrame(f, f.cy - eps, f.cz)
    expect(hit.s).toBeCloseTo(eps)
    expect(hit.t).toBeCloseTo(0)
    // a world-Z displacement only lands on the transverse axis t
    const hit2 = toScreenFrame(f, f.cy, f.cz + eps)
    expect(hit2.s).toBeCloseTo(0)
    expect(hit2.t).toBeCloseTo(eps)
  })
})
