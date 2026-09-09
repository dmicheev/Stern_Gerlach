import { useTranslation } from 'react-i18next'
import { useStore } from '../state/store'
import { Section, Slider, Toggle, HintLabel } from './widgets'
import { Hint } from './Hint'
import type { PhysicsMode } from '../physics/types'

export function SourcePanel() {
  const { t } = useTranslation()
  const source = useStore((s) => s.config.source)
  const mode = useStore((s) => s.config.mode)
  const screenX = useStore((s) => s.config.screenX)
  const particleCount = useStore((s) => s.config.particleCount)
  const showGhost = useStore((s) => s.showGhost)
  const { updateSource, setScreenX, setParticleCount, setMode, setShowGhost } = useStore()

  const modeHint =
    mode === 'classical' ? 'modeClassical' : mode === 'semiclassical' ? 'modeSemi' : 'modeQuantum'

  return (
    <div className="panel right-panel">
      <Section title={t('mode')}>
        <div className="mode-row">
          {(['classical', 'semiclassical', 'quantum'] as PhysicsMode[]).map((m) => (
            <button key={m} className={`btn mode-btn ${mode === m ? 'btn-active' : ''}`} onClick={() => setMode(m)}>
              {t(`modes.${m}`)}
            </button>
          ))}
        </div>
        <div className="mode-desc">
          {t(`modeDescriptions.${mode}`)} <Hint id={modeHint} />
        </div>
        <div className="mode-legend">
          <span>{t('modes.classical')} <Hint id="modeClassical" /></span>
          <span>{t('modes.semiclassical')} <Hint id="modeSemi" /></span>
          <span>{t('modes.quantum')} <Hint id="modeQuantum" /></span>
        </div>
        {mode === 'semiclassical' && (
          <Toggle label={t('ghost')} checked={showGhost} onChange={setShowGhost} title={t('showGhostHint')} hint="ghost" />
        )}
      </Section>

      <Section title={t('source')}>
        <Slider label={t('vMean')} value={source.vMean} min={200} max={800} step={10} display={`${source.vMean.toFixed(0)} m/s`} onChange={(v) => updateSource({ vMean: v })} hint="vMean" />
        <Slider label={t('vSigma')} value={source.vSigma} min={5} max={100} step={5} display={`±${source.vSigma.toFixed(0)} m/s`} onChange={(v) => updateSource({ vSigma: v })} hint="vSigma" />
        <Slider label={t('aperture')} value={source.aperture * 1000} min={0.1} max={2} step={0.05} display={`${(source.aperture * 1000).toFixed(2)} ${t('mm')}`} onChange={(v) => updateSource({ aperture: v / 1000 })} hint="aperture" />
        <Slider label={t('divergence')} value={source.divergence * 1000} min={0.2} max={5} step={0.1} display={`${(source.divergence * 1000).toFixed(1)} mrad`} onChange={(v) => updateSource({ divergence: v / 1000 })} hint="divergence" />
        <Slider label={t('screenX')} value={screenX * 100} min={40} max={140} step={1} display={`${screenX.toFixed(2)} m`} onChange={(v) => setScreenX(v / 100)} hint="screenX" />
        <div className="blocked-row">
          <HintLabel id="particles">{t('particles')}</HintLabel>
          <select value={particleCount} onChange={(e) => setParticleCount(parseInt(e.target.value))}>
            {[2000, 8000, 20000, 50000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}
              </option>
            ))}
          </select>
        </div>
      </Section>
    </div>
  )
}
