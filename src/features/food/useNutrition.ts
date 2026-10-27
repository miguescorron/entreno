import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { db } from '../../db/db'
import { ensureFoodSeed } from '../../db/food'
import { getAdjustment, runWeeklyAdjustment, targetsFor } from '../../db/nutrition'
import type { ISODate } from '../../domain/dates'
import { sumMacros } from '../../domain/nutrition/foods'
import { useCurrentProfile, useToday } from '../hooks'

/** Objetivos, lo comido y el agua de un día (se recalcula al registrar). */
export function useDayNutrition(date: ISODate) {
  const profile = useCurrentProfile()
  const targets = useLiveQuery(() => targetsFor(profile, date), [profile, date])
  const meals = useLiveQuery(() => db.mealLogs.where('date').equals(date).toArray(), [date])
  const water = useLiveQuery(async () => (await db.hydrationLogs.where('date').equals(date).toArray()).reduce((a, h) => a + h.ml, 0), [date])
  const adjustment = useLiveQuery(() => getAdjustment())
  const eaten = sumMacros(meals ?? [])
  return { targets, meals, eaten, water: water ?? 0, adjustment }
}

/** Tareas de arranque del módulo de comida: base de alimentos y ajuste semanal. */
export function useNutritionBootstrap() {
  const profile = useCurrentProfile()
  const today = useToday()
  useEffect(() => {
    ensureFoodSeed().catch(() => {})
    runWeeklyAdjustment(profile, today).catch(() => {})
  }, [profile, today])
}
