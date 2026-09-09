import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore, descendantsOf } from '../state/store'
import { Section, Slider, HintLabel } from './widgets'
import { spinColor } from '../scene/ApparatusModel'

export function CascadePanel() {
  const { t } = useTranslation()
  const config = useStore((s) => s.config)
  const selectedId = useStore((s) => s.selectedApparatusId)
  const { addApparatus, removeApparatus, updateApparatus, setSelected } = useStore()
  const sorted = [...config.apparatuses].sort((a, b) => a.xStart - b.xStart)

  return (
    <div className="panel left-panel">
      <Section
        title={`${t('cascade')} · ${config.apparatuses.length}`}
        hint="beam"
        right={
          <button className="btn small" onClick={addApparatus}>
            {t('addApparatus')}
          </button>
        }
      >
        {sorted.map((a, i) => {
          const [r, g, b] = spinColor((a.angleDeg * Math.PI) / 180, 1)
          const active = selectedId === a.id
          const forbidden = descendantsOf(a.id, config.apparatuses)
          return (
            <div key={a.id} className={`app-card ${active ? 'app-card-active' : ''}`}>
              <div className="app-card-head">
                <button className={`btn tiny ${active ? 'btn-active' : ''}`} onClick={() => setSelected(active ? null : a.id)}>
                  {t('apparatus')} #{i + 1}
                </button>
                <span className="app-dot" style={{ background: `rgb(${r * 255},${g * 255},${b * 255})` }} />
                <span className="spacer" />
                <button className="btn tiny danger" onClick={() => removeApparatus(a.id)}>✕</button>
              </div>

              <div className="blocked-row">
                <HintLabel id="beam">{t('beam')}</HintLabel>
                <select
                  value={a.attachTo}
                  onChange={(e) => updateApparatus(a.id, { attachTo: e.target.value })}
                >
                  <option value="root">{t('beamRoot')}</option>
                  {sorted
                    .filter((other) => other.id !== a.id && !forbidden.has(other.id))
                    .map((other) => {
                      const j = sorted.indexOf(other) + 1
                      return (
                        <Fragment key={other.id}>
                          <option value={`${other.id}:up`}>
                            ↑ {t('beamPort')} #{j}
                          </option>
                          <option value={`${other.id}:down`}>
                            ↓ {t('beamPort')} #{j}
                          </option>
                        </Fragment>
                      )
                    })}
                </select>
              </div>

              <Slider
                hint="xPos"
                label={t('xPos')}
                value={a.xStart * 100}
                min={12}
                max={Math.max(20, (config.screenX - 0.12) * 100)}
                step={1}
                display={`${a.xStart.toFixed(2)} m`}
                onChange={(v) => updateApparatus(a.id, { xStart: v / 100 })}
              />
              <Slider
                hint="angle"
                label={t('angle')}
                value={a.angleDeg}
                min={0}
                max={359}
                step={1}
                display={`${a.angleDeg.toFixed(0)}°`}
                onChange={(v) => updateApparatus(a.id, { angleDeg: v })}
              />
              <div className="quick-angles">
                {[0, 45, 90, 135, 180].map((deg) => (
                  <button key={deg} className={`btn tiny ${Math.round(a.angleDeg) === deg ? 'btn-active' : ''}`} onClick={() => updateApparatus(a.id, { angleDeg: deg })}>
                    {deg}°
                  </button>
                ))}
              </div>
              <Slider
                hint="gradient"
                label={t('gradient')}
                value={a.gradient}
                min={100}
                max={5000}
                step={50}
                display={`${(a.gradient / 1000).toFixed(1)}кТ/м`.replace('к', 'k')}
                onChange={(v) => updateApparatus(a.id, { gradient: v })}
              />
              <Slider
                hint="length"
                label={t('length')}
                value={a.length * 1000}
                min={40}
                max={200}
                step={5}
                display={`${(a.length * 1000).toFixed(0)} ${t('mm')}`}
                onChange={(v) => updateApparatus(a.id, { length: v / 1000 })}
              />
              <Slider
                hint="gap"
                label={t('gap')}
                value={a.gap * 1000}
                min={3}
                max={15}
                step={0.5}
                display={`${(a.gap * 1000).toFixed(1)} ${t('mm')}`}
                onChange={(v) => updateApparatus(a.id, { gap: v / 1000 })}
              />
              <div className="blocked-row">
                <HintLabel id="blocked">{t('blocked')}</HintLabel>
                <select
                  value={a.blockedPort ?? ''}
                  onChange={(e) => updateApparatus(a.id, { blockedPort: (e.target.value || null) as 'up' | 'down' | null })}
                >
                  <option value="">{t('blockedNone')}</option>
                  <option value="up">{t('blockedUp')}</option>
                  <option value="down">{t('blockedDown')}</option>
                </select>
              </div>
            </div>
          )
        })}
      </Section>
    </div>
  )
}
