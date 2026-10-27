import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useContext, useEffect, useState } from 'react'
import { db, type Profile } from '../db/db'
import { planStartFor } from '../db/plan'
import { todayISO, weekNumberFor } from '../domain/dates'

/** undefined = cargando, null = sin perfil (onboarding) */
export function useProfile() {
  return useLiveQuery(async () => (await db.profile.toCollection().first()) ?? null)
}

/** Fecha de hoy en Madrid; se actualiza si la app sigue abierta al cambiar de día. */
export function useToday() {
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    const tick = () => setToday(todayISO())
    const id = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return today
}

/** Perfil cargado por la puerta de la app; las pantallas lo leen de aquí. */
export const ProfileContext = createContext<Profile | null>(null)

export function useCurrentProfile(): Profile {
  const p = useContext(ProfileContext)
  if (!p) throw new Error('Sin perfil')
  return p
}

export function usePlanContext() {
  const profile = useCurrentProfile()
  const today = useToday()
  const planStart = planStartFor(profile)
  return { profile, today, planStart, currentWeek: weekNumberFor(planStart, today) }
}
