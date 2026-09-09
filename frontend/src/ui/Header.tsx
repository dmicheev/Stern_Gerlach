import { useTranslation } from 'react-i18next'
import { useStore } from '../state/store'
import { presets, bellPresets } from '../state/presets'

export function Header() {
  const { t } = useTranslation()
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const kind = useStore((s) => s.kind)
  const setKind = useStore((s) => s.setKind)
  const applyConfig = useStore((s) => s.applyConfig)
  const updateBell = useStore((s) => s.updateBell)
  const engineKind = useStore((s) => s.engineKind)
  const computing = useStore((s) => s.computing)
  const mode = useStore((s) => s.config.mode)

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">⚛</span>
        <div>
          <div className="brand-title">{t('title')}</div>
          <div className="brand-sub">{t('subtitle')}</div>
        </div>
      </div>

      <div className="topbar-controls">
        <div className="lang-switch kind-switch">
          <button className={kind === 'cascade' ? 'active' : ''} onClick={() => setKind('cascade')}>
            {t('kindCascade')}
          </button>
          <button className={kind === 'bell' ? 'active' : ''} onClick={() => setKind('bell')}>
            {t('kindBell')}
          </button>
        </div>

        <select
          className="preset-select"
          defaultValue=""
          onChange={(e) => {
            if (kind === 'bell') {
              const p = bellPresets.find((x) => x.id === e.target.value)
              if (p) updateBell(p.build())
            } else {
              const p = presets.find((x) => x.id === e.target.value)
              if (p) applyConfig(p.build())
            }
            e.target.value = ''
          }}
        >
          <option value="">{t('preset')}…</option>
          {(kind === 'bell' ? bellPresets : presets).map((p) => (
            <option key={p.id} value={p.id}>
              {kind === 'bell' ? t(`bellPresets.${p.id}`) : t(`presets.${p.id}`)}
            </option>
          ))}
        </select>

        {kind === 'cascade' && mode !== 'quantum' && (
          <span className={`badge ${computing ? 'badge-busy' : ''}`}>
            {computing ? t('computing') : engineKind === 'wasm' ? `Rust·${t('wasmEngine')}` : t('jsEngine')}
          </span>
        )}

        <div className="lang-switch">
          <button className={lang === 'ru' ? 'active' : ''} onClick={() => setLang('ru')}>RU</button>
          <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
      </div>
    </header>
  )
}
