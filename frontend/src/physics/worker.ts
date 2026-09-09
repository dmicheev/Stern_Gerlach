/// <reference lib="webworker" />
import { runSimulation } from './engine'
import { simulateQuantum, type QuantumResult } from './quantum'
import { runBell, type BellConfig, type BellResult } from './bell'
import { loadEngine } from './wasm'
import type { SimulationConfig, SimResult } from './types'

export type WorkerRequest =
  | { id: number; kind: 'trajectories'; config: SimulationConfig }
  | { id: number; kind: 'quantum'; config: SimulationConfig }
  | { id: number; kind: 'bell'; config: BellConfig }

export type WorkerResponse =
  | { id: number; kind: 'trajectories'; engine: 'wasm' | 'js'; result: SimResult }
  | { id: number; kind: 'quantum'; result: QuantumResult }
  | { id: number; kind: 'bell'; result: BellResult }

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const { id, kind, config } = ev.data
  if (kind === 'quantum') {
    const result = simulateQuantum(config)
    const resp: WorkerResponse = { id, kind: 'quantum', result }
    self.postMessage(resp)
    return
  }
  if (kind === 'bell') {
    const result = runBell(config)
    const resp: WorkerResponse = { id, kind: 'bell', result }
    self.postMessage(resp)
    return
  }
  const engine = (await loadEngine()) ?? { kind: 'js' as const, run: runSimulation }
  const result = engine.run(config)
  const resp: WorkerResponse = { id, kind: 'trajectories', engine: engine.kind, result }
  self.postMessage(resp)
}
