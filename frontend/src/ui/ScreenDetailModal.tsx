import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../state/store'
import { M_TO_UNITS } from '../physics/constants'
import { spinColor } from '../scene/ApparatusModel'
import { sampleScreenHits, maxAxisExtent } from '../physics/quantum'
import { adaptiveZRangeMm } from '../physics/scale'
import { screenFrame, toScreenFrame } from '../physics/beams'
import { hintsContent } from '../i18n/hints'

/** unified hit record for both engines (meters) */
interface Hits {
  times: Float64Array
  ys: Float64Array
  zs: Float64Array
  thetas: Float64Array
  signs: Int8Array
}

const BINS = 64

function cssColor(r: number, g: number, b: number, a = 1) {
  return `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${a})`
}

/** first index with time > t (times are sorted ascending) */
function countUpTo(times: Float64Array, t: number) {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (times[mid] <= t) lo = mid + 1
    else hi = mid
  }
  return lo
}

function HintBlock({ id }: { id: string }) {
  const lang = useStore((s) => s.lang)
  const c = hintsContent[lang]?.[id]
  if (!c) return null
  return (
    <div className="sd-why-block">
      <div className="sd-why-title">{c.title}</div>
      {c.formula && <div className="hint-formula">{c.formula}</div>}
      {c.body.map((p, i) => (
        <p key={i} dangerouslySetInnerHTML={{ __html: p }} />
      ))}
    </div>
  )
}

export function ScreenDetailModal() {
  const { t } = useTranslation()
  const open = useStore((s) => s.screenDetailOpen)
  const setOpen = useStore((s) => s.setScreenDetailOpen)
  const kind = useStore((s) => s.kind)
  const bellStation = useStore((s) => s.bellDetailStation)
  const mode = useStore((s) => s.config.mode)
  const result = useStore((s) => s.result)
  const quantum = useStore((s) => s.quantum)
  const bellResult = useStore((s) => s.bellResult)
  const bellModel = useStore((s) => s.bellConfig.model)
  const particleCount = useStore((s) => s.config.particleCount)
  const screenX = useStore((s) => s.config.screenX)
  const tCurrent = useStore((s) => s.tCurrent)
  // plots are analyzed in the LAST detector frame (quantum deflects along it too)
  const apparatuses = useStore((s) => s.config.apparatuses)
  const vMean = useStore((s) => s.config.source.vMean)
  const frame = useMemo(() => screenFrame(apparatuses, vMean), [apparatuses, vMean])
  const scatterRef = useRef<HTMLCanvasElement>(null)
  const histRef = useRef<HTMLCanvasElement>(null)
  const bellScatterRef = useRef<HTMLCanvasElement>(null)
  const bellHistRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  // unified hit source (same data as the 3D screen texture)
  const hits = useMemo<Hits | null>(() => {
    if (mode === 'quantum') {
      const header = quantum?.header
      const branches = quantum?.branches
      if (!header || !branches?.length) return null
      const q = { header, branches }
      const h = sampleScreenHits(q, screenX, Math.min(particleCount, 20000), 4242)
      return { times: h.times, ys: h.ys, zs: h.zs, thetas: h.thetas, signs: h.signs }
    }
    if (!result) return null
    const order: number[] = []
    for (let i = 0; i < result.nParticles; i++) if (!result.absorbed[i]) order.push(i)
    order.sort((a, b) => result.hitTime[a] - result.hitTime[b])
    const m = order.length
    const times = new Float64Array(m)
    const ys = new Float64Array(m)
    const zs = new Float64Array(m)
    const thetas = new Float64Array(m)
    const signs = new Int8Array(m)
    for (let k = 0; k < m; k++) {
      const i = order[k]
      times[k] = result.hitTime[i]
      ys[k] = result.hitY[i]
      zs[k] = result.hitZ[i]
      thetas[k] = result.spinTheta[i]
      signs[k] = result.spinSign[i]
    }
    return { times, ys, zs, thetas, signs }
  }, [mode, result, quantum, screenX, particleCount])

  // adaptive z half-range over the whole run (stable, same as the 3D screen)
  const zRange = useMemo(() => {
    let maxAbs = 0
    if (mode === 'quantum' && quantum?.header && quantum.branches.length) {
      const ext = maxAxisExtent({ header: quantum.header, branches: quantum.branches }, frame)
      return adaptiveZRangeMm(ext * M_TO_UNITS)
    }
    if (result) {
      for (let i = 0; i < result.nParticles; i++) {
        if (result.absorbed[i]) continue
        const { s } = toScreenFrame(frame, result.hitY[i], result.hitZ[i])
        const v = Math.abs(s) * M_TO_UNITS
        if (v > maxAbs) maxAbs = v
      }
    }
    return adaptiveZRangeMm(maxAbs)
  }, [mode, result, quantum, frame])

  const liveCount = hits ? countUpTo(hits.times, tCurrent) : 0

  // 2D scatter: z (mm) horizontal, y (mm) vertical — the view "onto the screen"
  useEffect(() => {
    const canvas = scatterRef.current
    if (!canvas || !open) return
    const ctx = canvas.getContext('2d')!
    const render = () => {
      if (!hits) return
      const dpr = window.devicePixelRatio || 1
      const cw = Math.max(120, canvas.clientWidth || 460)
      // square screen plane: y half-span equals the adaptive z half-range
      const yHalf = zRange
      const H = Math.max(170, Math.min(430, Math.round((cw * (2 * yHalf)) / (2 * zRange))))
      canvas.style.height = `${H}px`
      canvas.width = Math.round(cw * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const ML = 40
      const MB = 20
      const MT = 8
      const MR = 8
      const PW = cw - ML - MR
      const PH = H - MB - MT
      const xOf = (zmm: number) => ML + ((zmm + zRange) / (2 * zRange)) * PW
      const yOf = (ymm: number) => MT + ((yHalf - ymm) / (2 * yHalf)) * PH

      ctx.fillStyle = '#0a1424'
      ctx.fillRect(0, 0, cw, H)
      ctx.strokeStyle = 'rgba(120,160,220,0.22)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(ML, MT); ctx.lineTo(ML, MT + PH); ctx.lineTo(ML + PW, MT + PH); ctx.stroke()
      // gridlines at z ticks and y = 0
      ctx.font = '10px ui-monospace, Menlo, monospace'
      ctx.fillStyle = 'rgba(160,190,230,0.9)'
      ctx.textAlign = 'center'
      const ticks = [-1, -0.5, 0, 0.5, 1].map((f) => Math.round(f * zRange))
      for (const z of ticks) {
        const px = xOf(z)
        ctx.strokeStyle = 'rgba(120,160,220,0.14)'
        ctx.beginPath(); ctx.moveTo(px, MT); ctx.lineTo(px, MT + PH); ctx.stroke()
        ctx.fillText(String(z), px, MT + PH + 13)
      }
      ctx.fillText(t('sd.zAxis'), ML + PW / 2, H - 2)
      ctx.strokeStyle = 'rgba(120,160,220,0.3)'
      ctx.beginPath(); ctx.moveTo(ML, yOf(0)); ctx.lineTo(ML + PW, yOf(0)); ctx.stroke()
      ctx.textAlign = 'right'
      for (const y of [-yHalf, -yHalf / 2, 0, yHalf / 2, yHalf]) {
        ctx.beginPath(); ctx.moveTo(ML - 3, yOf(y)); ctx.lineTo(ML, yOf(y)); ctx.stroke()
        ctx.fillText(String(y), ML - 5, yOf(y) + 3)
      }
      ctx.textAlign = 'left'
      ctx.fillText(t('sd.yAxis'), 3, MT + 2)

      const n = countUpTo(hits.times, tCurrent)
      const classical = mode === 'classical'
      for (let k = 0; k < n; k++) {
        const { s, t } = toScreenFrame(frame, hits.ys[k], hits.zs[k])
        const zmm = s * M_TO_UNITS
        const ymm = t * M_TO_UNITS
        if (Math.abs(zmm) > zRange || Math.abs(ymm) > yHalf) continue
        const sign = hits.signs[k]
        const [r, g, b] = classical || sign === 0 ? [0.65, 0.8, 1] : spinColor(hits.thetas[k], sign)
        ctx.fillStyle = cssColor(r, g, b, 0.42)
        ctx.beginPath()
        ctx.arc(xOf(zmm), yOf(ymm), 1.2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    render()
    const ro = new ResizeObserver(render)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [open, hits, tCurrent, zRange, mode, t, frame])

  // stacked histogram N(z), same grouping/colors as the side panel
  useEffect(() => {
    const canvas = histRef.current
    if (!canvas || !open) return
    const ctx = canvas.getContext('2d')!
    const render = () => {
      if (!hits) return
      const dpr = window.devicePixelRatio || 1
      const cw = Math.max(120, canvas.clientWidth || 460)
      const H = 170
      canvas.style.height = `${H}px`
      canvas.width = Math.round(cw * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const ML = 40
      const MB = 20
      const MT = 8
      const MR = 8
      const PW = cw - ML - MR
      const PH = H - MB - MT
      const baseY = MT + PH

      ctx.fillStyle = '#0a1424'
      ctx.fillRect(0, 0, cw, H)
      const classical = mode === 'classical'
      const n = countUpTo(hits.times, tCurrent)
      interface Group { theta: number; sign: number; bins: number[] }
      const groups = new Map<string, Group>()
      for (let k = 0; k < n; k++) {
        const { s } = toScreenFrame(frame, hits.ys[k], hits.zs[k])
        const zmm = s * M_TO_UNITS
        const bin = Math.floor(((zmm + zRange) / (2 * zRange)) * BINS)
        if (bin < 0 || bin >= BINS) continue
        const sign = hits.signs[k]
        const key = classical || sign === 0 ? 'plain' : `${hits.thetas[k].toFixed(2)}|${sign}`
        let g = groups.get(key)
        if (!g) {
          g = { theta: hits.thetas[k], sign, bins: new Array(BINS).fill(0) }
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
      const yOf = (v: number) => baseY - (v / max) * PH
      const bw = PW / BINS
      for (const { bins, base, color } of stacked) {
        ctx.beginPath()
        for (let b = 0; b <= BINS; b++) {
          const v = b < BINS ? base[b] + bins[b] : base[b - 1] + bins[b - 1]
          const px = ML + b * bw
          const py = yOf(v)
          if (b === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
          if (b < BINS) ctx.lineTo(px + bw, py)
        }
        for (let b = BINS - 1; b >= 0; b--) {
          const px = ML + b * bw
          ctx.lineTo(px + bw, yOf(base[b]))
          ctx.lineTo(px, yOf(base[b]))
        }
        ctx.closePath()
        ctx.fillStyle = cssColor(color[0], color[1], color[2], 0.55)
        ctx.fill()
      }
      // axes
      ctx.strokeStyle = 'rgba(120,160,220,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(ML, MT); ctx.lineTo(ML, baseY); ctx.lineTo(ML + PW, baseY); ctx.stroke()
      ctx.font = '10px ui-monospace, Menlo, monospace'
      ctx.fillStyle = 'rgba(160,190,230,0.9)'
      ctx.textAlign = 'center'
      const ticks = [-1, -0.5, 0, 0.5, 1].map((f) => Math.round(f * zRange))
      for (const z of ticks) ctx.fillText(String(z), ML + ((z + zRange) / (2 * zRange)) * PW, baseY + 13)
      ctx.fillText(t('sd.zAxis'), ML + PW / 2, H - 2)
      ctx.textAlign = 'right'
      const fmt = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)))
      for (const frac of [0, 0.5, 1]) {
        const py = baseY - frac * PH
        if (frac > 0) {
          ctx.strokeStyle = 'rgba(120,160,220,0.18)'
          ctx.beginPath(); ctx.moveTo(ML, py); ctx.lineTo(ML + PW, py); ctx.stroke()
        }
        ctx.fillText(fmt(max * frac), ML - 5, py + 3)
      }
      ctx.textAlign = 'left'
      ctx.fillText('N', 3, MT + 2)
    }
    render()
    const ro = new ResizeObserver(render)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [open, hits, tCurrent, zRange, mode, t, frame])

  // ---- bell mode: per-station detections by port and basis ----
  const bellSide: -1 | 1 = kind === 'bell' ? (bellStation ?? -1) : -1

  useEffect(() => {
    const canvas = bellScatterRef.current
    if (!canvas || !open || kind !== 'bell' || !bellResult) return
    const ctx = canvas.getContext('2d')!
    const r = bellResult
    const render = () => {
      const dpr = window.devicePixelRatio || 1
      const cw = Math.max(120, canvas.clientWidth || 460)
      const H = 300
      canvas.style.height = `${H}px`
      canvas.width = Math.round(cw * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#0a1424'
      ctx.fillRect(0, 0, cw, H)
      const ML = 44
      const MR = 10
      const MT = 26
      const MB = 34
      const PW = cw - ML - MR
      const PH = H - MT - MB
      const colW = PW / 2
      // two columns: basis 0 / basis 1; within each: ↑ top half, ↓ bottom half
      ctx.font = '10px ui-monospace, Menlo, monospace'
      ctx.strokeStyle = 'rgba(120,160,220,0.25)'
      ctx.lineWidth = 1
      ctx.strokeRect(ML, MT, PW, PH)
      ctx.beginPath(); ctx.moveTo(ML + colW, MT); ctx.lineTo(ML + colW, MT + PH); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(ML, MT + PH / 2); ctx.lineTo(ML + PW, MT + PH / 2); ctx.stroke()
      ctx.fillStyle = 'rgba(160,190,230,0.9)'
      ctx.textAlign = 'center'
      for (let s = 0; s < 2; s++) {
        const ang = (bellSide < 0 ? useStore.getState().bellConfig.anglesA : useStore.getState().bellConfig.anglesB)[s]
        ctx.fillText(`θ${s} = ${ang.toFixed(0)}°`, ML + colW * (s + 0.5), MT - 8)
      }
      ctx.textAlign = 'left'
      ctx.fillText('↑', ML - 14, MT + PH * 0.25)
      ctx.fillText('↓', ML - 14, MT + PH * 0.75)
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(160,190,230,0.75)'
      ctx.fillText(t('sd.bellCounts'), ML + PW / 2, H - 6)

      for (let k = 0; k < r.nHero; k++) {
        if (r.tLand[k] > tCurrent) break
        const setting = (bellSide < 0 ? r.settingA : r.settingB)[k]
        const outcome = (bellSide < 0 ? r.outcomeA : r.outcomeB)[k]
        const angle = (bellSide < 0 ? r.angleA : r.angleB)[k]
        const px = ML + setting * colW + 6 + ((k * 37) % Math.max(4, (colW - 12) | 0))
        let py: number
        let rgb: [number, number, number]
        if (outcome === 0) {
          // detection loophole: missed pair — thin strip at the very bottom
          py = MT + PH - 3 - ((k * 53) % 6)
          rgb = [0.45, 0.5, 0.6]
        } else {
          const half = (PH - 14) / 2
          py = outcome > 0 ? MT + 7 + ((k * 53) % half) : MT + PH / 2 + 7 + ((k * 53) % (half - 8))
          rgb = spinColor(angle, outcome)
        }
        const [cr, cg, cb] = rgb
        ctx.fillStyle = cssColor(cr, cg, cb, 0.55)
        ctx.beginPath()
        ctx.arc(px, py, 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    render()
    const ro = new ResizeObserver(render)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [open, kind, bellResult, bellSide, tCurrent, t])

  useEffect(() => {
    const canvas = bellHistRef.current
    if (!canvas || !open || kind !== 'bell' || !bellResult) return
    const ctx = canvas.getContext('2d')!
    const r = bellResult
    const render = () => {
      const dpr = window.devicePixelRatio || 1
      const cw = Math.max(120, canvas.clientWidth || 460)
      const H = 200
      canvas.style.height = `${H}px`
      canvas.width = Math.round(cw * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#0a1424'
      ctx.fillRect(0, 0, cw, H)
      // counts: [basis0↑, basis0↓, basis1↑, basis1↓] + misses over ALL landed pairs
      const counts = [0, 0, 0, 0]
      let misses = 0
      for (let k = 0; k < r.nPairs; k++) {
        if (r.tLand[k] > tCurrent) continue
        const setting = (bellSide < 0 ? r.settingA : r.settingB)[k]
        const outcome = (bellSide < 0 ? r.outcomeA : r.outcomeB)[k]
        if (outcome === 0) misses++
        else counts[setting * 2 + (outcome > 0 ? 0 : 1)]++
      }
      const landed = counts[0] + counts[1] + counts[2] + counts[3]
      const ML = 44
      const MR = 10
      const MT = 16
      const MB = 34
      const PW = cw - ML - MR
      const PH = H - MT - MB
      const max = Math.max(1, ...counts, Math.ceil(landed / 2 || 1))
      const yOf = (v: number) => MT + PH - (v / max) * PH
      const bw = PW / 4
      ctx.font = '10px ui-monospace, Menlo, monospace'
      const labels = ['θ₀ ↑', 'θ₀ ↓', 'θ₁ ↑', 'θ₁ ↓']
      counts.forEach((v, i) => {
        const x = ML + i * bw
        const [cr, cg, cb] = spinColor(0, i % 2 === 0 ? 1 : -1)
        ctx.fillStyle = cssColor(cr, cg, cb, 0.55)
        ctx.fillRect(x + bw * 0.15, yOf(v), bw * 0.7, MT + PH - yOf(v))
        ctx.fillStyle = 'rgba(160,190,230,0.9)'
        ctx.textAlign = 'center'
        ctx.fillText(labels[i], x + bw / 2, H - 18)
        ctx.fillText(v.toLocaleString(), x + bw / 2, yOf(v) - 5)
      })
      // 50% reference: marginal should be ~half of landed regardless of basis
      ctx.strokeStyle = 'rgba(255,212,121,0.7)'
      ctx.setLineDash([4, 3])
      ctx.beginPath(); ctx.moveTo(ML, yOf(landed / 2)); ctx.lineTo(ML + PW, yOf(landed / 2)); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255,212,121,0.9)'
      ctx.textAlign = 'left'
      ctx.fillText('50%', ML + 4, yOf(landed / 2) - 4)
      ctx.strokeStyle = 'rgba(120,160,220,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(ML, MT); ctx.lineTo(ML, MT + PH); ctx.lineTo(ML + PW, MT + PH); ctx.stroke()
      ctx.fillStyle = 'rgba(160,190,230,0.75)'
      ctx.textAlign = 'center'
      ctx.fillText(`${t('sd.bellMisses')}: ${misses.toLocaleString()}`, ML + PW / 2, H - 4)
    }
    render()
    const ro = new ResizeObserver(render)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [open, kind, bellResult, bellSide, tCurrent, t])

  const bellLiveCount = useMemo(() => {
    if (!bellResult) return 0
    let c = 0
    for (let k = 0; k < bellResult.nPairs; k++) if (bellResult.tLand[k] <= tCurrent) c++
    return c
  }, [bellResult, tCurrent])

  if (!open) return null

  const modeHint = mode === 'classical' ? 'modeClassical' : mode === 'semiclassical' ? 'modeSemi' : 'modeQuantum'

  if (kind === 'bell') {
    const stationName = bellSide < 0 ? 'A' : 'B'
    return (
      <div
        className="sd-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false)
        }}
      >
        <div className="sd-modal">
          <div className="sd-head">
            <span className="sd-title">{t('sd.bellTitle', { s: stationName })}</span>
            <button className="btn small" onClick={() => setOpen(false)} aria-label={t('sd.close')}>
              ✕ {t('sd.close')}
            </button>
          </div>
          <div className="sd-live">
            {t('sd.live', { t: (tCurrent * 1000).toFixed(0), n: bellLiveCount.toLocaleString() })}
          </div>
          <div className="sd-plots">
            <div className="sd-plot">
              <div className="sd-plot-title">{t('sd.ports')}</div>
              <canvas ref={bellScatterRef} className="hist-canvas" />
            </div>
            <div className="sd-plot">
              <div className="sd-plot-title">{t('sd.bellHist')}</div>
              <canvas ref={bellHistRef} className="hist-canvas" />
            </div>
          </div>
          <div className="sd-why">
            <div className="sd-why-heading">{t('sd.why')}</div>
            <HintBlock id="bellStation" />
            <HintBlock id={bellModel === 'quantum' ? 'bellModelQuantum' : 'bellModelLocal'} />
            <HintBlock id="chshE" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="sd-overlay"
      onClick={(e) => {
        console.log('[SD] overlay click', (e.target as HTMLElement).className)
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="sd-modal">
        <div className="sd-head">
          <span className="sd-title">{t('sd.title')}</span>
          <button className="btn small" onClick={() => setOpen(false)} aria-label={t('sd.close')}>
            ✕ {t('sd.close')}
          </button>
        </div>
        <div className="sd-live">
          {t('sd.live', { t: (tCurrent * 1000).toFixed(0), n: liveCount.toLocaleString() })}
        </div>
        <div className="sd-plots">
          <div className="sd-plot">
            <div className="sd-plot-title">{t('sd.scatter')}</div>
            <canvas ref={scatterRef} className="hist-canvas" />
          </div>
          <div className="sd-plot">
            <div className="sd-plot-title">{t('sd.histogram')}</div>
            <canvas ref={histRef} className="hist-canvas" />
          </div>
        </div>
        <div className="sd-why">
          <div className="sd-why-heading">{t('sd.why')}</div>
          <HintBlock id={modeHint} />
          <HintBlock id="hist" />
        </div>
      </div>
    </div>
  )
}
