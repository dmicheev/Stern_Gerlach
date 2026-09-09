import { useEffect } from 'react'
import { useStore } from './state/store'
import { useSimulationRunner } from './hooks/useSimulationRunner'
import { Experience } from './scene/Experience'
import { Header } from './ui/Header'
import { CascadePanel } from './ui/CascadePanel'
import { SourcePanel } from './ui/SourcePanel'
import { StatsPanel } from './ui/StatsPanel'
import { BellPanel } from './ui/BellPanel'
import { CHSHPanel } from './ui/CHSHPanel'
import { TimelinePanel } from './ui/TimelinePanel'
import './App.css'

export default function App() {
  const lang = useStore((s) => s.lang)
  const kind = useStore((s) => s.kind)
  useSimulationRunner()

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return (
    <div className="app">
      <div className="canvas-host">
        <Experience />
      </div>
      <Header />
      {kind === 'cascade' ? (
        <>
          <CascadePanel />
          <div className="right-stack">
            <SourcePanel />
            <StatsPanel />
          </div>
        </>
      ) : (
        <>
          <BellPanel />
          <div className="right-stack">
            <div className="panel right-panel" />
            <CHSHPanel />
          </div>
        </>
      )}
      <TimelinePanel />
    </div>
  )
}
