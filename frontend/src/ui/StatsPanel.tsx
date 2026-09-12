import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../state/store'
import { Section } from './widgets'
import { Hint } from './Hint'
import { spinColor } from '../scene/ApparatusModel'
import { M_TO_UNITS } from '../physics/constants'
import { adaptiveZRangeMm } from '../physics/scale'
import { evalProfile } from '../physics/quantum'

const H = 130
const BINS = 72

function cssColor(r: number, g: number, b: number, a = 1) {
  return `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${a})`
}

interface AxesGeom {
  ML: number
  MB: number
  MT: number
  PW: number
  PH: number
  baseY: number
}

/** axes with ticks and labels: x = z (mm), y = counts (N) or normalized density (ρ) */
function drawAxes(
  ctx: CanvasRenderingContext2D,
  g: AxesGeom,
  max: number,
  isCounts: boolean,
  t: (k: string) => string,
  zRange: number,
) {
  const { ML, MB, PW, PH, baseY } = g
  const rightX = ML + PW
  const topY = baseY - PH
  ctx.strokeStyle = 'rgba(120,160,220,0.55)'
  ctx.lineWidth = 1
  // x axis
  ctx.beginPath(); ctx.moveTo(ML, baseY); ctx.lineTo(rightX, baseY); ctx.stroke()
  // y axis
  ctx.beginPath(); ctx.moveTo(ML, baseY); ctx.lineTo(ML, topY); ctx.stroke()
  // z = 0 gridline
  ctx.strokeStyle = 'rgba(120,160,220,0.25)'
  ctx.beginPath(); ctx.moveTo(ML + PW / 2, topY); ctx.lineTo(ML + PW / 2, baseY); ctx.stroke()
  // x ticks: -80..+80
  ctx.fillStyle = 'rgba(160,190,230,0.9)'
  ctx.font = '10px ui-monospace, Menlo, monospace'
  ctx.textAlign = 'center'
  const ticks = [-1, -0.5, 0, 0.5, 1].map((f) => Math.round(f * zRange))
  for (const z of ticks) {
    const px = ML + ((z + zRange) / (2 * zRange)) * PW
    ctx.beginPath(); ctx.moveTo(px, baseY); ctx.lineTo(px, baseY + 3); ctx.stroke()
    ctx.fillText(String(z), px, baseY + 12)
  }
  // x title
  ctx.fillText(`z, ${t('mm')}`, ML + PW / 2, baseY + MB - 1)
  // y ticks: 0, max/2, max
  ctx.textAlign = 'right'
  const fmt = (v: number) => (isCounts ? (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v))) : v.toFixed(1))
  for (const frac of [0, 0.5, 1]) {
    const py = baseY - frac * PH
    ctx.strokeStyle = 'rgba(120,160,220,0.55)'
    ctx.beginPath(); ctx.moveTo(ML - 3, py); ctx.lineTo(ML, py); ctx.stroke()
    if (frac > 0) {
      ctx.strokeStyle = 'rgba(120,160,220,0.18)'
      ctx.beginPath(); ctx.moveTo(ML, py); ctx.lineTo(rightX, py); ctx.stroke()
    }
    ctx.fillText(fmt(max * frac), ML - 5, py + 3)
  }
  // y title
  ctx.textAlign = 'left'
  ctx.fillText(isCounts ? 'N' : '\u03C1', 3, topY + 2)
  ctx.textAlign = 'start'
}

export function StatsPanel() {
  const { t } = useTranslation()
  const mode = useStore((s) => s.config.mode)
  const result = useStore((s) => s.result)
  const quantum = useStore((s) => s.quantum)
  const tCurrent = useStore((s) => s.tCurrent)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const branches = useMemo(() => {
    if (!result || mode === 'classical' || mode === 'quantum') return []
    const map = new Map<string, { theta: number; sign: number; hist: string; count: number }>()
    for (let i = 0; i < result.nParticles; i++) {
      if (result.absorbed[i] || result.hitTime[i] > tCurrent) continue
      const theta = result.spinTheta[i]
      const sign = result.spinSign[i]
      if (sign === 0) continue
      let hist = ''
      for (let j = 0; j < result.nApparatus; j++) {
        const v = result.history[i * result.nApparatus + j]
        hist += v === 255 ? '·' : v === 1 ? '↑' : '↓'
      }
      const key = `${theta.toFixed(2)}|${sign}|${hist}`
      const e = map.get(key) ?? { theta, sign, hist, count: 0 }
      e.count++
      map.set(key, e)
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 8)
  }, [result, tCurrent, mode])

  const screenCount = useMemo(() => {
    if (!result) return 0
    let c = 0
    for (let i = 0; i < result.nParticles; i++) {
      if (!result.absorbed[i] && result.hitTime[i] <= tCurrent) c++
    }
    return c
  }, [result, tCurrent])

  const absorbedCount = useMemo(() => {
    if (!result) return 0
    let c = 0
    for (let i = 0; i < result.nParticles; i++) {
      if (result.absorbed[i] && result.hitTime[i] <= tCurrent) c++
    }
    return c
  }, [result, tCurrent])

  // adaptive z-range: covers every hit of the run (stable per run, no mid-run jumps)
  const zRange = useMemo(() => {
    let maxAbs = 0
    if (mode === 'quantum' && quantum?.header && quantum.branches.length) {
      const n = quantum.branches.length
      const f = quantum.header.frameCount - 1
      for (const b of quantum.branches) {
        const ext = Math.abs(b.cz[f]) + 4 * b.sz[f]
        if (ext > maxAbs) maxAbs = ext
      }
      void n
      return adaptiveZRangeMm(maxAbs * M_TO_UNITS)
    }
    if (result) {
      for (let i = 0; i < result.nParticles; i++) {
        if (result.absorbed[i]) continue
        const v = Math.abs(result.hitZ[i]) * M_TO_UNITS
        if (v > maxAbs) maxAbs = v
      }
    }
    return adaptiveZRangeMm(maxAbs)
  }, [mode, result, quantum])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.style.height = `${H}px`

    const render = () => {
      const dpr = window.devicePixelRatio || 1
      const W = Math.max(80, canvas.clientWidth || 272)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // plot area with margins for axis labels
      const ML = 34 // left margin (y axis)
      const MB = 16 // bottom margin (x axis)
      const MT = 6
      const MR = 6
      const PW = W - ML - MR
      const PH = H - MB - MT
      const baseY = MT + PH
      const xOfZ = (zmm: number) => ML + ((zmm + zRange) / (2 * zRange)) * PW
      const yOfV = (v: number, max: number) => baseY - (v / max) * PH

      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#0a1424'
      ctx.fillRect(0, 0, W, H)
      ctx.font = '10px ui-monospace, Menlo, monospace'

      if (mode === 'quantum' && quantum?.header && quantum.branches.length) {
        const header = quantum.header
        const q = { header, branches: quantum.branches }
        const screenX = useStore.getState().config.screenX
        const tq = Math.min(header.tTotal, tCurrent)
        let max = 1e-9
        const rows = 96
        const prof = new Float32Array(rows)
        for (let r = 0; r < rows; r++) {
          const zNorm = 1 - (r + 0.5) / rows
          const zM = (zNorm * zRange) / M_TO_UNITS // evalProfile expects meters
          const v = evalProfile(q, screenX, tq, zM)
          prof[r] = v
          if (v > max) max = v
        }
        // |psi|^2 profile along z at the screen column
        ctx.beginPath()
        for (let r = 0; r < rows; r++) {
          const zNorm = 1 - 2 * (r / rows)
          const px = xOfZ(zNorm * zRange)
          const py = yOfV(prof[r], max)
          if (r === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.strokeStyle = '#7ad0ff'
        ctx.lineWidth = 2
        ctx.stroke()
        drawAxes(ctx, { ML, MB, MT, PW, PH, baseY }, max, false, t, zRange)
      } else if (result) {
        // stacked per-bin histogram by branch (no cumulative plateaus)
        const classical = mode === 'classical'
        interface Group { theta: number; sign: number; bins: number[] }
        const groups = new Map<string, Group>()
        for (let i = 0; i < result.nParticles; i++) {
          if (result.absorbed[i] || result.hitTime[i] > tCurrent) continue
          const zmm = result.hitZ[i] * M_TO_UNITS
          const bin = Math.floor(((zmm + zRange) / (2 * zRange)) * BINS)
          if (bin < 0 || bin >= BINS) continue
          const theta = result.spinTheta[i]
          const sign = result.spinSign[i]
          const key = classical || sign === 0 ? 'plain' : `${theta.toFixed(2)}|${sign}`
          let g = groups.get(key)
          if (!g) {
            g = { theta, sign, bins: new Array(BINS).fill(0) }
            groups.set(key, g)
          }
          g.bins[bin]++
        }
        const stack = new Array(BINS).fill(0)
        const stacked: { bins: number[]; base: number[]; color: [number, number, number] }[] = []
        for (const g of groups.values()) {
          const color: [number, number, number] =
            classical || g.sign === 0 ? [0.65, 0.8, 1] : spinColor(g.theta, g.sign)
          stacked.push({ bins: g.bins, base: [...stack], color })
          for (let b = 0; b < BINS; b++) stack[b] += g.bins[b]
        }
        let max = 1
        for (let b = 0; b < BINS; b++) if (stack[b] > max) max = stack[b]
        const bw = PW / BINS
        for (const { bins, base, color } of stacked) {
          ctx.beginPath()
          // top edge (step), then bottom edge back
          for (let b = 0; b <= BINS; b++) {
            const v = b < BINS ? base[b] + bins[b] : base[b - 1] + bins[b - 1]
            const px = ML + b * bw
            const py = yOfV(v, max)
            if (b === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
            if (b < BINS) ctx.lineTo(px + bw, py)
          }
          for (let b = BINS - 1; b >= 0; b--) {
            const px = ML + b * bw
            ctx.lineTo(px + bw, yOfV(base[b], max))
            ctx.lineTo(px, yOfV(base[b], max))
          }
          ctx.closePath()
          ctx.fillStyle = cssColor(color[0], color[1], color[2], 0.55)
          ctx.fill()
        }
        drawAxes(ctx, { ML, MB, MT, PW, PH, baseY }, max, true, t, zRange)
      } else {
        drawAxes(ctx, { ML, MB, MT, PW, PH, baseY }, 1, true, t, zRange)
      }
    }

    render()
    const ro = new ResizeObserver(() => render())
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [result, quantum, tCurrent, mode, t, zRange])

  return (
    <div className="panel right-panel-bottom">
      <Section title={`${t('stats')} · ${t('histTitle')}`} hint={mode === 'quantum' ? 'histQuantum' : 'hist'}>
        <canvas ref={canvasRef} className="hist-canvas" />
        <div className="stats-row">
          <span><Hint id="screenHits" /> {t('screenHits')}: <b>{screenCount.toLocaleString()}</b></span>
          <span><Hint id="absorbed" /> {t('absorbedHits')}: <b style={{ color: '#ff7a8a' }}>{absorbedCount.toLocaleString()}</b></span>
        </div>
        {branches.length > 0 && (
          <table className="branch-table">
            <thead>
              <tr>
                <th>{t('branch')}</th>
                <th>{t('count')}</th>
                <th>{t('fraction')}</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => {
                const total = branches.reduce((a, x) => a + x.count, 0)
                const [r, g, bb] = spinColor(b.theta, b.sign)
                return (
                  <tr key={`${b.theta}-${b.sign}-${b.hist}`}>
                    <td>
                      <span className="app-dot" style={{ background: cssColor(r, g, bb) }} />
                      {b.hist} @ {((b.theta * 180) / Math.PI).toFixed(0)}°
                    </td>
                    <td>{b.count.toLocaleString()}</td>
                    <td>{((b.count / Math.max(1, total)) * 100).toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {mode === 'quantum' && (
          <div className="quantum-status">
            {quantum?.status === 'error'
              ? `${t('quantumError')}: ${quantum.error}`
              : quantum?.status === 'running' || quantum?.status === 'pending'
                ? t('quantumRunning')
                : quantum?.status === 'done'
                  ? `ψ(t) ✓ ${quantum.header?.frameCount} ${t('quantumFrames')}`
                  : t('quantumConnecting')}
          </div>
        )}
      </Section>
    </div>
  )
}
