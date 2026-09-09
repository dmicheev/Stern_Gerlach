import { create } from 'zustand'
import type { Apparatus, PhysicsMode, SimulationConfig, SimResult, SourceParams } from '../physics/types'
import type { QuantumBranch, QuantumHeader } from '../physics/quantum'
import { HENSEN_ANGLES, type BellConfig, type BellResult } from '../physics/bell'

export const APPARATUS_SPACING = 0.22

export type ExperimentKind = 'cascade' | 'bell'

export interface QuantumJob {
  status: 'pending' | 'running' | 'done' | 'error'
  header: QuantumHeader | null
  branches: QuantumBranch[]
  error: string | null
}

interface Store {
  kind: ExperimentKind
  config: SimulationConfig
  bellConfig: BellConfig
  lang: 'ru' | 'en'
  playing: boolean
  loop: boolean
  timeScale: number
  tCurrent: number
  selectedApparatusId: string | null
  showGhost: boolean
  result: SimResult | null
  ghostResult: SimResult | null
  computing: boolean
  engineKind: 'wasm' | 'js' | null
  quantum: QuantumJob | null
  bellResult: BellResult | null
  /** increments on each simulation restart / loop rewind; consumers clear accumulators */
  epoch: number

  setLang(lang: 'ru' | 'en'): void
  setKind(kind: ExperimentKind): void
  updateBell(patch: Partial<BellConfig>): void
  setBellResult(r: BellResult | null): void
  setMode(mode: PhysicsMode): void
  updateSource(patch: Partial<SourceParams>): void
  setScreenX(x: number): void
  setParticleCount(n: number): void
  addApparatus(): void
  removeApparatus(id: string): void
  updateApparatus(id: string, patch: Partial<Apparatus>): void
  applyConfig(config: SimulationConfig): void
  setSelected(id: string | null): void
  setPlaying(v: boolean): void
  setLoop(v: boolean): void
  setTimeScale(v: number): void
  setTCurrent(v: number): void
  setShowGhost(v: boolean): void
  setResult(r: SimResult | null): void
  setGhostResult(r: SimResult | null): void
  setComputing(v: boolean): void
  setEngineKind(k: 'wasm' | 'js' | null): void
  setQuantum(job: QuantumJob | null): void
  bumpEpoch(): void
}

let nextId = 1
export function makeApparatus(xStart: number, angleDeg = 0, attachTo = 'root'): Apparatus {
  return {
    id: `app-${nextId++}-${Math.random().toString(36).slice(2, 6)}`,
    attachTo,
    xStart,
    length: 0.12,
    angleDeg,
    gradient: 1500,
    b0: 0.5,
    gap: 0.006,
    blockedPort: null,
  }
}

export function defaultConfig(): SimulationConfig {
  return {
    mode: 'semiclassical',
    source: { vMean: 500, vSigma: 30, aperture: 0.0005, divergence: 0.001 },
    apparatuses: [makeApparatus(0.25, 0)],
    screenX: 0.6,
    particleCount: 8000,
    heroCount: 400,
    seed: 42,
  }
}

/** beam key of an apparatus port */
export function portBeam(appId: string, port: 'up' | 'down'): string {
  return `${appId}:${port}`
}

/** parent chain of an apparatus (for cycle prevention) */
export function ancestorsOf(id: string, apps: Apparatus[]): Set<string> {
  const byId = new Map(apps.map((a) => [a.id, a]))
  const seen = new Set<string>()
  let cur = byId.get(id)
  while (cur && cur.attachTo !== 'root') {
    const m = /^(.*):(up|down)$/.exec(cur.attachTo)
    if (!m) break
    const parentId = m[1]
    if (seen.has(parentId)) break
    seen.add(parentId)
    cur = byId.get(parentId)
  }
  return seen
}

/** apparatuses that live downstream of `id` (attaching to them would create a cycle) */
export function descendantsOf(id: string, apps: Apparatus[]): Set<string> {
  const res = new Set<string>()
  for (const a of apps) {
    if (a.id !== id && ancestorsOf(a.id, apps).has(id)) res.add(a.id)
  }
  return res
}

/** keep apparatuses sorted; orphans fall back to root; x clamped after parent exit */
function normalize(cfg: SimulationConfig): SimulationConfig {
  const byId = new Map(cfg.apparatuses.map((a) => [a.id, a]))
  const apps = [...cfg.apparatuses]
    .sort((a, b) => a.xStart - b.xStart)
    .map((a) => {
      if (a.attachTo === 'root') return a
      const m = /^(.*):(up|down)$/.exec(a.attachTo)
      const parent = m ? byId.get(m[1]) : undefined
      if (!parent) return { ...a, attachTo: 'root' }
      const minX = parent.xStart + parent.length + 0.03
      return a.xStart < minX ? { ...a, xStart: minX } : a
    })
  return { ...cfg, apparatuses: apps }
}

export const useStore = create<Store>((set) => ({
  kind: 'cascade',
  config: defaultConfig(),
  bellConfig: { ...HENSEN_ANGLES },
  lang: (typeof localStorage !== 'undefined' && localStorage.getItem('sg-lang') as 'ru' | 'en') || 'ru',
  playing: true,
  loop: false,
  timeScale: 1,
  tCurrent: 0,
  selectedApparatusId: null,
  showGhost: false,
  result: null,
  ghostResult: null,
  computing: false,
  engineKind: null,
  quantum: null,
  bellResult: null,
  epoch: 0,

  setLang: (lang) => {
    localStorage.setItem('sg-lang', lang)
    set({ lang })
  },
  setKind: (kind) =>
    set((s) => ({
      kind,
      tCurrent: 0,
      playing: true,
      selectedApparatusId: null,
      bellResult: kind === 'bell' ? s.bellResult : null,
    })),
  updateBell: (patch) =>
    set((s) => ({ bellConfig: { ...s.bellConfig, ...patch } })),
  setBellResult: (r) => set({ bellResult: r }),
  setMode: (mode) =>
    set((s) => ({ config: normalize({ ...s.config, mode }), tCurrent: 0, playing: true })),
  updateSource: (patch) =>
    set((s) => ({ config: normalize({ ...s.config, source: { ...s.config.source, ...patch } }) })),
  setScreenX: (x) => set((s) => ({ config: { ...s.config, screenX: x } })),
  setParticleCount: (n) => set((s) => ({ config: { ...s.config, particleCount: n } })),
  addApparatus: () =>
    set((s) => {
      const apps = s.config.apparatuses
      const last = apps.length ? Math.max(...apps.map((a) => a.xStart)) : 0.1
      const nextX = Math.max(last + APPARATUS_SPACING, 0.2)
      const app = makeApparatus(nextX)
      const screenX = Math.max(s.config.screenX, nextX + 0.18)
      return {
        config: normalize({ ...s.config, apparatuses: [...apps, app], screenX }),
        selectedApparatusId: app.id,
      }
    }),
  removeApparatus: (id) =>
    set((s) => ({
      config: { ...s.config, apparatuses: s.config.apparatuses.filter((a) => a.id !== id) },
      selectedApparatusId: s.selectedApparatusId === id ? null : s.selectedApparatusId,
    })),
  updateApparatus: (id, patch) =>
    set((s) => {
      const apps = s.config.apparatuses
      // prevent attach cycles: cannot attach to itself or to a descendant
      if (patch.attachTo && patch.attachTo !== 'root') {
        const target = patch.attachTo.split(':')[0]
        const forbidden = descendantsOf(id, apps)
        if (forbidden.has(target) || target === id) return {}
      }
      return {
        config: normalize({
          ...s.config,
          apparatuses: apps.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        }),
      }
    }),
  applyConfig: (config) =>
    set({ config: normalize({ ...config, seed: 42 }), tCurrent: 0, playing: true, selectedApparatusId: null }),
  setSelected: (id) => set({ selectedApparatusId: id }),
  setPlaying: (v) => set({ playing: v }),
  setLoop: (v) => set({ loop: v }),
  setTimeScale: (v) => set({ timeScale: v }),
  setTCurrent: (v) => set({ tCurrent: v }),
  setShowGhost: (v) => set({ showGhost: v }),
  setResult: (r) => set({ result: r }),
  setGhostResult: (r) => set({ ghostResult: r }),
  setComputing: (v) => set({ computing: v }),
  setEngineKind: (k) => set({ engineKind: k }),
  setQuantum: (job: QuantumJob | null): void => {
    set({
      quantum: job,
    })
  },
  bumpEpoch: () => set((s) => ({ epoch: s.epoch + 1 })),
}))

export function configKey(cfg: SimulationConfig): string {
  return JSON.stringify(cfg)
}
