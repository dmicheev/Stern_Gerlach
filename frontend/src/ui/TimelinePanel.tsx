import { useTranslation } from 'react-i18next'
import { useStore } from '../state/store'
import { Hint } from './Hint'

const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 5]

export function TimelinePanel() {
  const { t } = useTranslation()
  const playing = useStore((s) => s.playing)
  const setPlaying = useStore((s) => s.setPlaying)
  const loop = useStore((s) => s.loop)
  const setLoop = useStore((s) => s.setLoop)
  const timeScale = useStore((s) => s.timeScale)
  const setTimeScale = useStore((s) => s.setTimeScale)
  const tCurrent = useStore((s) => s.tCurrent)
  const setTCurrent = useStore((s) => s.setTCurrent)
  const kind = useStore((s) => s.kind)
  const mode = useStore((s) => s.config.mode)
  const result = useStore((s) => s.result)
  const quantum = useStore((s) => s.quantum)
  const bellResult = useStore((s) => s.bellResult)
  const bumpEpoch = useStore((s) => s.bumpEpoch)

  const tTotal =
    kind === 'bell'
      ? bellResult?.tTotal ?? 0
      : mode === 'quantum'
        ? quantum?.header?.tTotal ?? 0
        : result?.tTotal ?? 0
  const progress = tTotal ? Math.min(1, tCurrent / tTotal) : 0

  return (
    <footer className="bottombar">
      <button
        className="btn"
        onClick={() => {
          if (!playing && tTotal && tCurrent >= tTotal - 1e-9) {
            // restart from the beginning when at the end
            setTCurrent(0)
            bumpEpoch()
          }
          setPlaying(!playing)
        }}
        disabled={!tTotal}
      >
        {playing ? `⏸ ${t('pause')}` : `▶ ${t('play')}`}
      </button>
      <button
        className="btn"
        onClick={() => {
          setTCurrent(0)
          setPlaying(true)
          bumpEpoch()
        }}
        disabled={!tTotal}
      >
        ⟲ {t('restart')}
      </button>

      <input
        type="range"
        className="scrub"
        min={0}
        max={Math.max(tTotal, 0.0001)}
        step={tTotal / 600}
        value={Math.min(tCurrent, tTotal)}
        onChange={(e) => setTCurrent(parseFloat(e.target.value))}
        disabled={!tTotal}
        style={{ ['--progress' as string]: `${progress * 100}%` }}
      />

      <span className="time-readout"><Hint id="timeReadout" /> 
        {(tCurrent * 1000).toFixed(1)} / {(tTotal * 1000).toFixed(1)} {t('ms')}
      </span>

      <div className="speed-row"><Hint id="speed" />
        {SPEEDS.map((s) => (
          <button key={s} className={`btn tiny ${timeScale === s ? 'btn-active' : ''}`} onClick={() => setTimeScale(s)}>
            {s}×
          </button>
        ))}
      </div>

      <label className="toggle">
        <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
        <span>↻ {t('loop')}</span>
        <Hint id="loop" />
      </label>
    </footer>
  )
}
