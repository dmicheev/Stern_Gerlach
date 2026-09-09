import { useTranslation } from 'react-i18next'
import { useStore } from '../state/store'
import { Section, Slider, HintLabel } from './widgets'
import { Hint } from './Hint'
import { HENSEN_ANGLES } from '../physics/bell'
import type { BellModel } from '../physics/bell'

export function BellPanel() {
  const { t } = useTranslation()
  const bell = useStore((s) => s.bellConfig)
  const updateBell = useStore((s) => s.updateBell)

  const station = (name: string, key: 'anglesA' | 'anglesB') => (
    <div className="app-card">
      <div className="app-card-head">
        <span className="station-name">{name}</span>
      </div>
      {([0, 1] as const).map((i) => (
        <Slider
          key={i}
          hint="bellStation"
          label={`${t('bell.setting')} ${i}`}
          value={bell[key][i]}
          min={-180}
          max={180}
          step={0.5}
          display={`${bell[key][i].toFixed(1)}°`}
          onChange={(v) => {
            const arr = [...bell[key]] as [number, number]
            arr[i] = v
            updateBell({ [key]: arr } as Partial<typeof bell>)
          }}
        />
      ))}
    </div>
  )

  return (
    <div className="panel left-panel">
      <Section
        title={t('bell.source')}
        hint="bellSource"
        right={
          <button className="btn small" onClick={() => updateBell({ ...HENSEN_ANGLES, model: bell.model })}>
            {t('bell.hensen')}
          </button>
        }
      >
        <div className="mode-row">
          {(['quantum', 'local'] as BellModel[]).map((m) => (
            <button
              key={m}
              className={`btn mode-btn ${bell.model === m ? 'btn-active' : ''}`}
              onClick={() => updateBell({ model: m })}
            >
              {m === 'quantum' ? t('bell.modelQuantum') : t('bell.modelLocal')}
            </button>
          ))}
        </div>
        <div className="mode-desc">
          {bell.model === 'quantum'
            ? 'E(a,b) = −cos(θa−θb), S → 2√2'
            : 'скрытые параметры: S ≤ 2 всегда (теорема Белла)'}{' '}
          <Hint id={bell.model === 'quantum' ? 'bellModelQuantum' : 'bellModelLocal'} />
        </div>

        {station(t('bell.stationA'), 'anglesA')}
        {station(t('bell.stationB'), 'anglesB')}

        <Slider
          hint="bellEff"
          label={t('bell.eff')}
          value={bell.detectionEff}
          min={0.5}
          max={1}
          step={0.01}
          display={`${(bell.detectionEff * 100).toFixed(0)}%`}
          onChange={(v) => updateBell({ detectionEff: v })}
        />
        <Slider
          hint="bellVis"
          label={t('bell.vis')}
          value={bell.visibility}
          min={0.5}
          max={1}
          step={0.01}
          display={`${(bell.visibility * 100).toFixed(0)}%`}
          onChange={(v) => updateBell({ visibility: v })}
        />
        <div className="blocked-row">
          <HintLabel id="bellPairs">{t('bell.pairs')}</HintLabel>
          <select value={bell.pairs} onChange={(e) => updateBell({ pairs: parseInt(e.target.value) })}>
            {[500, 2000, 10000, 50000, 100000].map((n) => (
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
