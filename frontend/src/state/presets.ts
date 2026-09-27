import { makeApparatus } from './store'
import { HENSEN_ANGLES, type BellConfig } from '../physics/bell'
import type { SimulationConfig } from '../physics/types'

export interface Preset {
  id: string
  build(): SimulationConfig
}

export interface BellPreset {
  id: string
  build(): BellConfig
}

const base = {
  source: { vMean: 500, vSigma: 30, aperture: 0.0005, divergence: 0.001 },
  particleCount: 8000,
  heroCount: 400,
  seed: 42,
}

export const presets: Preset[] = [
  {
    id: 'original',
    build: (): SimulationConfig => ({
      ...base,
      mode: 'semiclassical',
      apparatuses: [makeApparatus(0.25, 0)],
      screenX: 0.6,
    }),
  },
  {
    id: 'classical',
    build: (): SimulationConfig => ({
      ...base,
      mode: 'classical',
      apparatuses: [makeApparatus(0.25, 0)],
      screenX: 0.6,
    }),
  },
  {
    id: 'cascade-zx',
    build: (): SimulationConfig => {
      const a1 = makeApparatus(0.2, 0)
      const a2 = makeApparatus(0.44, 90, `${a1.id}:up`)
      return { ...base, mode: 'semiclassical', apparatuses: [a1, a2], screenX: 0.78 }
    },
  },
  {
    id: 'filter',
    build: (): SimulationConfig => {
      const a1 = makeApparatus(0.2, 0)
      const a2 = makeApparatus(0.44, 90, `${a1.id}:up`)
      return {
        ...base,
        mode: 'semiclassical',
        apparatuses: [{ ...a1, blockedPort: 'down' }, a2],
        screenX: 0.78,
      }
    },
  },
  {
    id: 'three-45',
    build: (): SimulationConfig => {
      const a1 = makeApparatus(0.18, 0)
      const a2 = makeApparatus(0.42, 45, `${a1.id}:up`)
      const a3 = makeApparatus(0.66, 45, `${a2.id}:up`)
      return { ...base, mode: 'semiclassical', apparatuses: [a1, a2, a3], screenX: 1.0 }
    },
  },
  {
    id: 'quantum',
    build: (): SimulationConfig => ({
      ...base,
      mode: 'quantum',
      apparatuses: [makeApparatus(0.25, 0)],
      screenX: 0.6,
    }),
  },
  {
    // SG interferometer: filter → coherent magnet 90° → recombiner → analyzer 0°.
    // Scanning the recombiner phase (phaseShiftDeg) oscillates the final
    // analyzer port counts — the visible face of branch coherence.
    id: 'interferometer',
    build: (): SimulationConfig => {
      // low filter gradient: the polarizing filter deflects little, keeping
      // the interferometer riding near the beam axis
      const filter = {
        ...makeApparatus(0.18, 0),
        blockedPort: 'down' as const,
        gradient: 300,
      }
      const splitter = { ...makeApparatus(0.4, 90, `${filter.id}:up`), kind: 'magnet' as const }
      const recombiner = {
        ...makeApparatus(0.56, 90, `${splitter.id}:up`),
        kind: 'recombiner' as const,
        length: 0.36,
        gradient: 2000,
        phaseShiftDeg: 0,
      }
      const analyzer = makeApparatus(0.96, 0, `${splitter.id}:merged`)
      return {
        ...base,
        mode: 'quantum',
        apparatuses: [filter, splitter, recombiner, analyzer],
        screenX: 1.15,
      }
    },
  },
]

export const bellPresets: BellPreset[] = [
  {
    id: 'bell-hensen',
    build: (): BellConfig => ({ ...HENSEN_ANGLES }),
  },
  {
    id: 'bell-local',
    build: (): BellConfig => ({ ...HENSEN_ANGLES, model: 'local', pairs: 50000 }),
  },
  {
    id: 'bell-detection',
    build: (): BellConfig => ({ ...HENSEN_ANGLES, detectionEff: 0.7, pairs: 100000 }),
  },
  {
    id: 'bell-noisy',
    build: (): BellConfig => ({ ...HENSEN_ANGLES, visibility: 0.85, pairs: 100000 }),
  },
]
