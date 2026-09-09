import { useEffect, useRef } from 'react'
import { useStore, configKey } from '../state/store'
import type { WorkerRequest, WorkerResponse } from '../physics/worker'

/**
 * Runs the trajectory engine / quantum approximation in a Web Worker whenever
 * the config changes (debounced), plus the classical "ghost" overlay.
 */
export function useSimulationRunner() {
  const workerRef = useRef<Worker | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const ghostDebounceRef = useRef<ReturnType<typeof setTimeout>>()
  const quantumDebounceRef = useRef<ReturnType<typeof setTimeout>>()
  const bellDebounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const worker = new Worker(new URL('../physics/worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    const onMessage = (ev: MessageEvent<WorkerResponse>) => {
      const s = useStore.getState()
      if (ev.data.kind === 'bell') {
        if (ev.data.id !== 4) return
        s.setBellResult(ev.data.result)
        s.setTCurrent(0)
        s.setPlaying(true)
        s.bumpEpoch()
        return
      }
      if (ev.data.kind === 'quantum') {
        if (ev.data.id !== 3) return
        s.setQuantum({
          status: 'done',
          header: ev.data.result.header,
          branches: ev.data.result.branches,
          error: null,
        })
        s.setTCurrent(0)
        s.setPlaying(true)
        s.bumpEpoch()
        return
      }
      if (ev.data.id === 1) {
        s.setResult(ev.data.result)
        s.setEngineKind(ev.data.engine)
        s.setTCurrent(0)
        s.setPlaying(true)
        s.bumpEpoch()
        if (!s.showGhost || s.config.mode === 'classical') s.setGhostResult(null)
        s.setComputing(false)
      } else if (ev.data.id === 2) {
        s.setGhostResult(ev.data.result)
      }
    }
    worker.addEventListener('message', onMessage)
    return () => {
      worker.removeEventListener('message', onMessage)
      worker.terminate()
    }
  }, [])

  // main simulation
  const kind = useStore((s) => s.kind)
  const key = useStore((s) => configKey(s.config))
  const bellKey = useStore((s) => JSON.stringify(s.bellConfig))
  const showGhost = useStore((s) => s.showGhost)
  useEffect(() => {
    const s = useStore.getState()
    if (s.kind !== 'cascade' || s.config.mode === 'quantum') return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      s.setComputing(true)
      const req: WorkerRequest = { id: 1, kind: 'trajectories', config: s.config }
      workerRef.current?.postMessage(req)
    }, 120)
    return () => clearTimeout(debounceRef.current)
  }, [key, kind])

  // ghost (classical) overlay
  useEffect(() => {
    const s = useStore.getState()
    const need = s.kind === 'cascade' && showGhost && s.config.mode === 'semiclassical'
    if (!need) {
      s.setGhostResult(null)
      return
    }
    clearTimeout(ghostDebounceRef.current)
    ghostDebounceRef.current = setTimeout(() => {
      const req: WorkerRequest = { id: 2, kind: 'trajectories', config: { ...s.config, mode: 'classical' } }
      workerRef.current?.postMessage(req)
    }, 120)
    return () => clearTimeout(ghostDebounceRef.current)
  }, [key, showGhost, kind])

  // quantum (client-side analytic wavepackets)
  useEffect(() => {
    const s = useStore.getState()
    if (s.kind !== 'cascade' || s.config.mode !== 'quantum') {
      if (s.kind !== 'cascade') s.setQuantum(null)
      return
    }
    clearTimeout(quantumDebounceRef.current)
    s.setQuantum({ status: 'running', header: null, branches: [], error: null })
    quantumDebounceRef.current = setTimeout(() => {
      const req: WorkerRequest = { id: 3, kind: 'quantum', config: s.config }
      workerRef.current?.postMessage(req)
    }, 60)
    return () => clearTimeout(quantumDebounceRef.current)
  }, [key, kind])

  // Bell / CHSH experiment
  useEffect(() => {
    const s = useStore.getState()
    if (s.kind !== 'bell') {
      s.setBellResult(null)
      return
    }
    clearTimeout(bellDebounceRef.current)
    s.setComputing(true)
    bellDebounceRef.current = setTimeout(() => {
      const req: WorkerRequest = { id: 4, kind: 'bell', config: s.bellConfig }
      workerRef.current?.postMessage(req)
      s.setComputing(false)
    }, 120)
    return () => clearTimeout(bellDebounceRef.current)
  }, [bellKey, kind])
}
