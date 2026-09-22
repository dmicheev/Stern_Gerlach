import { useEffect, useRef } from 'react'
import { useStore, configKey } from '../state/store'
import { RequestSeq } from '../physics/sequencing'
import type { WorkerRequest, WorkerResponse } from '../physics/worker'

/**
 * Runs the trajectory engine / quantum approximation in a Web Worker whenever
 * the config changes (debounced), plus the classical "ghost" overlay.
 *
 * Every channel (main / ghost / quantum / bell) issues monotonically
 * increasing request ids; responses carrying a superseded id are dropped, so
 * a slow outdated computation can never overwrite the result of a newer one.
 */
export function useSimulationRunner() {
  const workerRef = useRef<Worker | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const ghostDebounceRef = useRef<ReturnType<typeof setTimeout>>()
  const quantumDebounceRef = useRef<ReturnType<typeof setTimeout>>()
  const bellDebounceRef = useRef<ReturnType<typeof setTimeout>>()
  const seqRef = useRef<Record<'main' | 'ghost' | 'quantum' | 'bell', RequestSeq>>({
    main: new RequestSeq(),
    ghost: new RequestSeq(),
    quantum: new RequestSeq(),
    bell: new RequestSeq(),
  })

  useEffect(() => {
    const worker = new Worker(new URL('../physics/worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    const onMessage = (ev: MessageEvent<WorkerResponse>) => {
      const s = useStore.getState()
      const d = ev.data
      // drop results of superseded requests (stale / out-of-order)
      if (d.kind === 'error') {
        if (d.failed === 'trajectories') {
          if (!d.channel || !seqRef.current[d.channel].isCurrent(d.id)) return
          if (d.channel === 'ghost') return
        } else if (d.failed === 'quantum') {
          if (!seqRef.current.quantum.isCurrent(d.id)) return
        } else {
          if (!seqRef.current.bell.isCurrent(d.id)) return
        }
        if (s.quantum?.status === 'running') {
          s.setQuantum({ status: 'error', header: null, branches: [], error: d.message, discardedWeight: 0 })
        }
        s.setComputing(false)
        return
      }
      if (d.kind === 'trajectories') {
        if (!seqRef.current[d.channel].isCurrent(d.id)) return
        if (d.channel === 'ghost') {
          s.setGhostResult(d.result)
          return
        }
        s.setResult(d.result)
        s.setEngineKind(d.engine)
        s.setTCurrent(0)
        s.setPlaying(true)
        s.bumpEpoch()
        if (!s.showGhost || s.config.mode === 'classical') s.setGhostResult(null)
        s.setComputing(false)
        return
      }
      if (d.kind === 'quantum') {
        if (!seqRef.current.quantum.isCurrent(d.id)) return
        s.setQuantum({
          status: 'done',
          header: d.result.header,
          branches: d.result.branches,
          error: null,
          discardedWeight: d.result.discardedWeight,
        })
        s.setTCurrent(0)
        s.setPlaying(true)
        s.bumpEpoch()
        return
      }
      if (!seqRef.current.bell.isCurrent(d.id)) return
      s.setBellResult(d.result)
      s.setTCurrent(0)
      s.setPlaying(true)
      s.bumpEpoch()
    }
    // uncaught worker failures / unparsable messages must not leave the UI
    // stuck in `computing` forever
    const onFail = () => {
      const s = useStore.getState()
      if (s.quantum?.status === 'running') {
        s.setQuantum({ status: 'error', header: null, branches: [], error: 'worker crashed', discardedWeight: 0 })
      }
      s.setComputing(false)
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onFail)
    worker.addEventListener('messageerror', onFail)
    return () => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onFail)
      worker.removeEventListener('messageerror', onFail)
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
      const id = seqRef.current.main.next()
      const req: WorkerRequest = { id, channel: 'main', kind: 'trajectories', config: s.config }
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
      const id = seqRef.current.ghost.next()
      const req: WorkerRequest = {
        id,
        channel: 'ghost',
        kind: 'trajectories',
        config: { ...s.config, mode: 'classical' },
      }
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
    s.setQuantum({ status: 'running', header: null, branches: [], error: null, discardedWeight: 0 })
    quantumDebounceRef.current = setTimeout(() => {
      const id = seqRef.current.quantum.next()
      const req: WorkerRequest = { id, kind: 'quantum', config: s.config }
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
      const id = seqRef.current.bell.next()
      const req: WorkerRequest = { id, kind: 'bell', config: s.bellConfig }
      workerRef.current?.postMessage(req)
      s.setComputing(false)
    }, 120)
    return () => clearTimeout(bellDebounceRef.current)
  }, [bellKey, kind])
}
