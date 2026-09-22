/// <reference lib="webworker" />
import { runSimulation } from './engine'
import { simulateQuantum, type QuantumResult } from './quantum'
import { runBell, type BellConfig, type BellResult } from './bell'
import { loadEngine } from './wasm'
import type { SimulationConfig, SimResult } from './types'

/** which of the concurrent trajectory jobs the message belongs to */
export type WorkerChannel = 'main' | 'ghost'

export type WorkerRequest =
  | { id: number; channel: WorkerChannel; kind: 'trajectories'; config: SimulationConfig }
  | { id: number; kind: 'quantum'; config: SimulationConfig }
  | { id: number; kind: 'bell'; config: BellConfig }

export type WorkerResponse =
  | { id: number; channel: WorkerChannel; kind: 'trajectories'; engine: 'wasm' | 'js'; result: SimResult }
  | { id: number; kind: 'quantum'; result: QuantumResult }
  | { id: number; kind: 'bell'; result: BellResult }
  | {
      id: number
      kind: 'error'
      failed: 'trajectories' | 'quantum' | 'bell'
      channel?: WorkerChannel
      message: string
    }

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const { id } = ev.data
  const failed = ev.data.kind
  const channel = ev.data.kind === 'trajectories' ? ev.data.channel : undefined
  try {
    if (ev.data.kind === 'quantum') {
      const result = simulateQuantum(ev.data.config)
      const resp: WorkerResponse = { id, kind: 'quantum', result }
      self.postMessage(resp)
      return
    }
    if (ev.data.kind === 'bell') {
      const result = runBell(ev.data.config)
      const resp: WorkerResponse = { id, kind: 'bell', result }
      self.postMessage(resp)
      return
    }
    const engine = (await loadEngine()) ?? { kind: 'js' as const, run: runSimulation }
    const result = engine.run(ev.data.config)
    const resp: WorkerResponse = { id, channel: ev.data.channel, kind: 'trajectories', engine: engine.kind, result }
    self.postMessage(resp)
  } catch (err) {
    const resp: WorkerResponse = {
      id,
      kind: 'error',
      failed,
      channel,
      message: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(resp)
  }
}
