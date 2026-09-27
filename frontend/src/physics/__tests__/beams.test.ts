import { describe, expect, it } from 'vitest'
import { screenFrame, toScreenFrame, WORLD_FRAME, buildBeamTree, branchPoint, beamSegments } from '../beams'
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

describe('recombiner merged beams', () => {
  it('recombiner sits on the splitter axis; merged beam rides it straight', () => {
    const v = 500
    const a = app('a', 0.2, 0)
    const r = { ...app('r', 0.5, 0, 'a:up'), kind: 'recombiner' as const, length: 0.2 }
    const tree = buildBeamTree([a, r], v)
    const rn = tree.byId.get('r')!
    // recombiner is centered on the parent splitter's axis, not on a branch
    expect(rn.cy).toBeCloseTo(0)
    expect(rn.cz).toBeCloseTo(0)
    // it is registered on both sibling beams
    expect(tree.beams.get('a:up')!.map((n) => n.app.id)).toContain('r')
    expect(tree.beams.get('a:down')!.map((n) => n.app.id)).toContain('r')
    // merged beam point = splitter axis (straight, no kick)
    const m = branchPoint(tree, 'a', 'merged', 0.8, v)
    expect(m.y).toBeCloseTo(0)
    expect(m.z).toBeCloseTo(0)
  })

  it('beam segments converge into the recombiner and continue as one merged beam', () => {
    const v = 500
    const a = app('a', 0.2, 0)
    const r = { ...app('r', 0.5, 0, 'a:up'), kind: 'recombiner' as const, length: 0.2 }
    const segs = beamSegments(buildBeamTree([a, r], v), 0.9, v)
    // sibling beams end at the recombiner entry (x = 0.5, center z = 0)
    const endsAtRec = segs.filter((s) => Math.abs(s.to[0] - 0.5) < 1e-9)
    expect(endsAtRec.length).toBeGreaterThanOrEqual(2)
    for (const s of endsAtRec) {
      expect(Math.abs(s.to[2])).toBeLessThan(1e-9)
    }
    // exactly one merged continuation from the recombiner exit to the screen
    const merged = segs.filter((s) => Math.abs(s.from[0] - 0.7) < 1e-9 && Math.abs(s.to[0] - 0.9) < 1e-9)
    expect(merged).toHaveLength(1)
    expect(Math.abs(merged[0].from[2])).toBeLessThan(1e-9)
  })
})
