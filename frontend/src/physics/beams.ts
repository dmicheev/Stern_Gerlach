import { AG_MASS, MU_B } from './constants'
import { kindOf, type Apparatus } from './types'

/**
 * Beam tree for the cascade experiment.
 *
 * The source emits the 'root' beam along +X. Each apparatus A on a beam splits
 * it into two branch beams `${A.id}:up` / `${A.id}:down`, deflected along the
 * apparatus axis n(theta). A downstream apparatus must be attached to a
 * specific beam — it is positioned on that branch and only sees its particles.
 * A recombiner (quantum mode) merges the pair `${X}:up`+`${X}:down` of its
 * parent splitter X into the beam `${X}:merged` riding the splitter axis.
 *
 * Branch geometry uses the mean-velocity impulse approximation:
 *   after a magnet of length L and gradient G the branch has
 *   vz = ±a·τ  (a = mu_B·G/m, τ = L/v) and exit offset ±a·τ²/2 along n.
 */

export interface BeamApparatus {
  app: Apparatus
  index: number
  /** transverse center of the magnet (meters, world Y-Z) */
  cy: number
  cz: number
}

export interface BeamTree {
  /** apparatuses sorted by xStart with resolved centers */
  nodes: BeamApparatus[]
  byId: Map<string, BeamApparatus>
  /** beamKey -> apparatuses on that beam, sorted by xStart */
  beams: Map<string, BeamApparatus[]>
  parent: Map<string, { id: string; port: 'up' | 'down' | 'merged' } | null>
}

export const ROOT_BEAM = 'root'

export type BeamPort = 'up' | 'down' | 'merged'

export function parseBeamKey(beamKey: string): { id: string; port: BeamPort } | null {
  if (beamKey === ROOT_BEAM) return null
  const m = /^(.*):(up|down|merged)$/.exec(beamKey)
  return m ? { id: m[1], port: m[2] as BeamPort } : null
}

/** merged beam key of the splitter a recombiner is attached to */
export function mergedBeamKey(recombiner: Apparatus): string | null {
  const key = parseBeamKey(recombiner.attachTo)
  return key && kindOf(recombiner) === 'recombiner' ? `${key.id}:merged` : null
}

/** transverse deflection of a branch, radians-equivalent speed along n̂ */
function branchKick(app: Apparatus, vMean: number): { vz: number; zExit: number } {
  const a = (MU_B * app.gradient) / AG_MASS
  const tau = app.length / vMean
  return { vz: a * tau, zExit: 0.5 * a * tau * tau }
}

export function buildBeamTree(apparatuses: Apparatus[], vMean: number): BeamTree {
  const byId = new Map<string, Apparatus>()
  for (const a of apparatuses) byId.set(a.id, a)

  const nodes: BeamApparatus[] = []
  const beams = new Map<string, BeamApparatus[]>()
  const parent = new Map<string, { id: string; port: BeamPort } | null>()

  // resolve centers iteratively in x-order (parents always precede children
  // in x because children are constrained to start after the parent's exit)
  const sorted = [...apparatuses].sort((a, b) => a.xStart - b.xStart)
  const centers = new Map<string, { y: number; z: number }>()

  const register = (beam: string, node: BeamApparatus) => {
    const list = beams.get(beam) ?? []
    list.push(node)
    beams.set(beam, list)
  }

  for (let i = 0; i < sorted.length; i++) {
    const app = sorted[i]
    const key = parseBeamKey(app.attachTo)
    let cy = 0
    let cz = 0
    if (kindOf(app) === 'recombiner') {
      // the recombiner sits across BOTH branches of its parent splitter,
      // centered on the splitter's beam axis (the pair is symmetric about it)
      const splitter = key ? centers.get(key.id) : undefined
      parent.set(app.id, key)
      cy = splitter?.y ?? 0
      cz = splitter?.z ?? 0
    } else if (key && key.port === 'merged') {
      // the merged beam rides the splitter axis after recombination
      parent.set(app.id, byId.has(key.id) ? key : null)
      const splitter = centers.get(key.id)
      cy = splitter?.y ?? 0
      cz = splitter?.z ?? 0
    } else if (key) {
      const parentNode = nodes.find((n) => n.app.id === key.id)
      const pApp = parentNode?.app
      if (!pApp) {
        // orphan: parent removed — treat as root
        parent.set(app.id, null)
      } else {
        parent.set(app.id, key)
        const t = (pApp.angleDeg * Math.PI) / 180
        const ny = -Math.sin(t)
        const nz = Math.cos(t)
        const s = key.port === 'up' ? 1 : -1
        const pc = centers.get(pApp.id) ?? { y: 0, z: 0 }
        const { vz, zExit } = branchKick(pApp, vMean)
        const drift = (app.xStart - (pApp.xStart + pApp.length)) / vMean
        const d = s * (zExit + vz * drift)
        cy = pc.y + d * ny
        cz = pc.z + d * nz
      }
    } else {
      parent.set(app.id, null)
    }
    centers.set(app.id, { y: cy, z: cz })
    const node: BeamApparatus = { app, index: i, cy, cz }
    nodes.push(node)
    if (kindOf(app) === 'recombiner' && key) {
      register(`${key.id}:up`, node)
      register(`${key.id}:down`, node)
    } else {
      register(app.attachTo, node)
    }
  }
  for (const list of beams.values()) list.sort((a, b) => a.app.xStart - b.app.xStart)
  const nodeById = new Map<string, BeamApparatus>()
  for (const n of nodes) nodeById.set(n.app.id, n)

  return { nodes, byId: nodeById, beams, parent }
}

/** world-space point on a branch ray of apparatus `id`, port `port` at beam x */
export function branchPoint(
  tree: BeamTree,
  id: string,
  port: 'up' | 'down' | 'merged',
  x: number,
  vMean: number,
): { y: number; z: number } {
  const node = tree.byId.get(id)
  if (!node) return { y: 0, z: 0 }
  if (port === 'merged') return { y: node.cy, z: node.cz }
  const { vz, zExit } = branchKick(node.app, vMean)
  const t = (node.app.angleDeg * Math.PI) / 180
  const ny = -Math.sin(t)
  const nz = Math.cos(t)
  const s = port === 'up' ? 1 : -1
  const drift = (x - (node.app.xStart + node.app.length)) / vMean
  const d = s * (zExit + vz * Math.max(0, drift))
  return { y: node.cy + d * ny, z: node.cz + d * nz }
}

/**
 * Detector screen frame: axis & center of the most downstream apparatus.
 * The splitting at the screen runs along that apparatus axis n(theta), so the
 * screen plane and the histogram are analyzed in this frame (world frame when
 * there are no apparatuses).
 */
export interface ScreenFrame {
  theta: number
  ny: number
  nz: number
  /** transverse center of the last apparatus (meters, world Y-Z) */
  cy: number
  cz: number
}

export const WORLD_FRAME: ScreenFrame = { theta: 0, ny: 0, nz: 1, cy: 0, cz: 0 }

export function screenFrame(apparatuses: Apparatus[], vMean: number): ScreenFrame {
  if (!apparatuses.length) return WORLD_FRAME
  const tree = buildBeamTree(apparatuses, vMean)
  let last = tree.nodes[0]
  for (const n of tree.nodes) if (n.app.xStart > last.app.xStart) last = n
  const theta = (last.app.angleDeg * Math.PI) / 180
  return { theta, ny: -Math.sin(theta), nz: Math.cos(theta), cy: last.cy, cz: last.cz }
}

/** world hit (y, z) -> screen-frame coords: s along the axis, t across it (meters) */
export function toScreenFrame(f: ScreenFrame, y: number, z: number): { s: number; t: number } {
  const dy = y - f.cy
  const dz = z - f.cz
  return { s: dy * f.ny + dz * f.nz, t: dy * f.nz - dz * f.ny }
}

export interface BeamSegment {
  from: [number, number, number]
  to: [number, number, number]
}

export function beamSegments(
  tree: BeamTree,
  screenX: number,
  vMean: number,
): BeamSegment[] {
  const segs: BeamSegment[] = []
  const drawnRecombiners = new Set<string>()

  const walk = (beamKey: string, startX: number, startC: { y: number; z: number }) => {
    const list = tree.beams.get(beamKey) ?? []
    let cursorX = startX
    let cursorC = startC
    for (const node of list) {
      const mergedKey = mergedBeamKey(node.app)
      if (mergedKey) {
        // both sibling beams converge into the recombiner, then one merged
        // beam continues — drawn exactly once, from the first walk to arrive
        segs.push({
          from: [cursorX, cursorC.y, cursorC.z],
          to: [node.app.xStart, node.cy, node.cz],
        })
        if (!drawnRecombiners.has(node.app.id)) {
          drawnRecombiners.add(node.app.id)
          walk(mergedKey, node.app.xStart + node.app.length, { y: node.cy, z: node.cz })
        }
        return
      }
      segs.push({
        from: [cursorX, cursorC.y, cursorC.z],
        to: [node.app.xStart, node.cy, node.cz],
      })
      cursorX = node.app.xStart + node.app.length
      for (const port of ['up', 'down'] as const) {
        const childBeam = `${node.app.id}:${port}`
        if (tree.beams.has(childBeam)) continue // drawn by the child walk below
        // free branch continues to the screen
        const end = branchPoint(tree, node.app.id, port, screenX, vMean)
        const start = branchPoint(tree, node.app.id, port, cursorX, vMean)
        segs.push({ from: [cursorX, start.y, start.z], to: [screenX, end.y, end.z] })
      }
      cursorC = { y: node.cy, z: node.cz }
    }
    // beam continues straight to the screen after the last apparatus
    segs.push({
      from: [cursorX, cursorC.y, cursorC.z],
      to: [screenX, cursorC.y, cursorC.z],
    })
    // recurse into children from their attach point
    for (const node of list) {
      if (mergedBeamKey(node.app)) continue
      for (const port of ['up', 'down'] as const) {
        const childBeam = `${node.app.id}:${port}`
        if (!tree.beams.has(childBeam)) continue
        const startX = node.app.xStart + node.app.length
        const start = branchPoint(tree, node.app.id, port, startX, vMean)
        walk(childBeam, startX, start)
      }
    }
  }
  walk(ROOT_BEAM, 0, { y: 0, z: 0 })
  return segs
}
