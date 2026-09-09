import { useFrame } from '@react-three/fiber'
import { useStore } from '../state/store'

/** Wall-clock duration of the full playback at 1x speed. */
const PLAYBACK_SECONDS = 8

/** Advances the global simulation clock (normalized playback rate). */
export function TimelineDriver() {
  useFrame((_, delta) => {
    const s = useStore.getState()
    if (!s.playing) return
    let tTotal: number
    if (s.kind === 'bell') {
      tTotal = s.bellResult?.tTotal ?? 0
    } else if (s.config.mode === 'quantum') {
      tTotal = s.quantum?.header?.tTotal ?? 0
    } else {
      tTotal = s.result?.tTotal ?? 0
    }
    if (!tTotal) return
    const rate = tTotal / PLAYBACK_SECONDS
    let t = s.tCurrent + Math.min(delta, 0.1) * rate * s.timeScale
    if (t >= tTotal) {
      if (s.loop) {
        t = 0
        s.bumpEpoch()
      } else {
        t = tTotal
        s.setPlaying(false)
      }
    }
    s.setTCurrent(t)
  })
  return null
}
