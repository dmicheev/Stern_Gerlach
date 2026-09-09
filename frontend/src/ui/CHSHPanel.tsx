import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../state/store'
import { Section } from './widgets'
import { Hint } from './Hint'
import { quantumS } from '../physics/bell'

const W = 272
const H = 96

/** prefix sums for instant cumulative CHSH at any landed-pair index */
function usePrefix(result: ReturnType<typeof useStore.getState>['bellResult']) {
  return useMemo(() => {
    if (!result) return null
    const n = result.nPairs
    const cum = new Float64Array(4 * (n + 1))
    const cnt = new Float64Array(4 * (n + 1))
    for (let i = 0; i < n; i++) {
      const sa = result.settingA[i]
      const sb = result.settingB[i]
      const both = result.outcomeA[i] !== 0 && result.outcomeB[i] !== 0
      for (let c = 0; c < 4; c++) {
        cum[c * (n + 1) + i + 1] = cum[c * (n + 1) + i]
        cnt[c * (n + 1) + i + 1] = cnt[c * (n + 1) + i]
      }
      if (both) {
        const c = sa * 2 + sb
        cum[c * (n + 1) + i + 1] += result.outcomeA[i] * result.outcomeB[i]
        cnt[c * (n + 1) + i + 1] += 1
      }
    }
    return { cum, cnt, n }
  }, [result])
}

export function CHSHPanel() {
  const { t } = useTranslation()
  const result = useStore((s) => s.bellResult)
  const bell = useStore((s) => s.bellConfig)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [landed, setLanded] = useState(0)
  const prefix = usePrefix(result)

  // sample the clock at 5 Hz for cumulative stats
  useEffect(() => {
    const id = setInterval(() => {
      const s = useStore.getState()
      const r = s.bellResult
      if (!r) return
      let lo = 0
      let hi = r.nPairs
      while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (r.tLand[mid] <= s.tCurrent) lo = mid + 1
        else hi = mid
      }
      setLanded(lo)
    }, 200)
    return () => clearInterval(id)
  }, [])

  const live = useMemo(() => {
    if (!result || !prefix || landed === 0) return null
    const { cum, cnt, n } = prefix
    const e = (a: number, b: number) => {
      const c = a * 2 + b
      const k = cnt[c * (n + 1) + landed]
      return k ? cum[c * (n + 1) + landed] / k : 0
    }
    const count = (a: number, b: number) => cnt[(a * 2 + b) * (n + 1) + landed]
    const trials = count(0, 0) + count(0, 1) + count(1, 0) + count(1, 1)
    return {
      E: [
        [e(0, 0), e(0, 1)],
        [e(1, 0), e(1, 1)],
      ],
      counts: [
        [count(0, 0), count(0, 1)],
        [count(1, 0), count(1, 1)],
      ],
      S: e(0, 0) + e(0, 1) + e(1, 0) - e(1, 1),
      trials,
    }
  }, [prefix, landed, result])

  // S(N) sparkline
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0a1424'
    ctx.fillRect(0, 0, W, H)
    const yOf = (S: number) => {
      const max = 3
      return H - 8 - (Math.max(-1, Math.min(max, S)) / max) * (H - 16)
    }
    // bound lines: 2 and 2√2
    ctx.strokeStyle = 'rgba(255,140,120,0.75)'
    ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(0, yOf(2)); ctx.lineTo(W, yOf(2)); ctx.stroke()
    ctx.strokeStyle = 'rgba(130,255,170,0.75)'
    ctx.beginPath(); ctx.moveTo(0, yOf(2 * Math.SQRT2)); ctx.lineTo(W, yOf(2 * Math.SQRT2)); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,150,130,0.9)'
    ctx.font = '9px monospace'
    ctx.fillText('S=2', 4, yOf(2) - 3)
    ctx.fillStyle = 'rgba(130,255,170,0.9)'
    ctx.fillText('2√2', 4, yOf(2 * Math.SQRT2) - 3)

    if (prefix && live && live.trials > 30) {
      const { cum, cnt, n } = prefix
      const points = Math.min(140, Math.floor(live.trials / 10))
      const step = Math.max(1, Math.floor(live.trials / points))
      ctx.beginPath()
      let started = false
      for (let k = step; k <= landed; k += step) {
        const e = (a: number, b: number) => {
          const c = a * 2 + b
          const kk = cnt[c * (n + 1) + k]
          return kk ? cum[c * (n + 1) + k] / kk : 0
        }
        const trialsHere =
          cnt[(n + 1) + k] + cnt[2 * (n + 1) + k] + cnt[3 * (n + 1) + k] + cnt[0 * (n + 1) + k]
        if (trialsHere < 10) continue
        const S = e(0, 0) + e(0, 1) + e(1, 0) - e(1, 1)
        const x = (k / Math.max(1, landed)) * W
        const y = yOf(S)
        if (!started) {
          ctx.moveTo(x, y)
          started = true
        } else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = live.S > 2 ? '#7dffb0' : '#7aa8d8'
      ctx.lineWidth = 1.6
      ctx.stroke()
    }
  }, [live, landed, prefix])

  const theory = quantumS(bell.anglesA, bell.anglesB, bell.visibility)
  const violating = live ? live.S > 2 : false

  return (
    <div className="panel right-panel-bottom">
      <Section title={t('bell.chsh')} hint="chshS">
        {!live ? (
          <div className="quantum-status">{t('computing')}</div>
        ) : (
          <>
            <div className={`chsh-readout ${violating ? 'chsh-violation' : ''}`}>
              <span className="chsh-s"><Hint id="chshS" /> S = {live.S.toFixed(3)}</span>
              <span className="chsh-note">
                {violating ? t('bell.violation') : t('bell.noViolation')}
              </span>
            </div>
            <div className="hint-row"><Hint id="sCurve" /> <Hint id="chshTheory" /></div>
            <canvas ref={canvasRef} width={W} height={H} className="hist-canvas" />
            <table className="branch-table chsh-table">
              <thead>
                <tr>
                  <th>{t('bell.settings')} <Hint id="chshTable" /></th>
                  <th>{t('bell.correlation')} <Hint id="chshE" /></th>
                  <th>n</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1].map((a) =>
                  [0, 1].map((b) => {
                    const sign = a === 1 && b === 1 ? '−' : '+'
                    return (
                      <tr key={`${a}${b}`}>
                        <td>
                          ({a},{b}) θa={bell.anglesA[a].toFixed(0)}° θb={bell.anglesB[b].toFixed(0)}° {sign}
                        </td>
                        <td>{live.E[a][b].toFixed(3)}</td>
                        <td>{live.counts[a][b].toLocaleString()}</td>
                      </tr>
                    )
                  }),
                )}
              </tbody>
            </table>
            <div className="stats-row">
              <span>
                {t('bell.trials')}: <b>{live.trials.toLocaleString()}</b>
              </span>
              <span>
                {t('bell.theory')}: <b>{theory.toFixed(3)}</b>
              </span>
            </div>
          </>
        )}
      </Section>
    </div>
  )
}
