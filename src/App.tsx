import { useEffect } from 'react'
import { HashRouter, MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CoachScreen } from './features/coach/CoachScreen'
import { FoodScreen } from './features/food/FoodScreen'
import { Onboarding } from './features/onboarding/Onboarding'
import { ProfileContext, useProfile } from './features/hooks'
import { PlanScreen } from './features/plan/PlanScreen'
import { ProgressScreen } from './features/progress/ProgressScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { TodayScreen } from './features/today/TodayScreen'
import { TabBar } from './ui/TabBar'
import { ToastProvider } from './ui/Toast'

// En la vista previa como artefacto el visor no admite rutas en el hash: se navega en memoria
const Router = import.meta.env.VITE_ARTIFACT ? MemoryRouter : HashRouter

export function App() {
  return (
    <ToastProvider>
      <Router>
        <Gate />
      </Router>
    </ToastProvider>
  )
}

function Gate() {
  const profile = useProfile()
  if (profile === undefined) return null
  if (profile === null) return <Onboarding />
  return (
    <ProfileContext.Provider value={profile}>
      <Shell />
    </ProfileContext.Provider>
  )
}

function Shell() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return (
    <>
      <Routes>
        <Route path="/" element={<TodayScreen />} />
        <Route path="/plan" element={<PlanScreen />} />
        <Route path="/comida" element={<FoodScreen />} />
        <Route path="/progreso" element={<ProgressScreen />} />
        <Route path="/coach" element={<CoachScreen />} />
        <Route path="/ajustes" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {pathname !== '/ajustes' && <TabBar />}
    </>
  )
}
