import { db, setSetting, type MealLog } from '../db/db'
import { ensureFoodSeed } from '../db/food'
import { regeneratePlan } from '../db/plan'
import { addDays, todayISO } from '../domain/dates'
import { DEFAULT_PROFILE } from '../features/profile/ProfileForm'

// Datos de ejemplo para la vista previa: el plan se desplaza 5 semanas para
// que haya historia en los gráficos. Nunca se usa en la app instalada.

export async function seedDemo() {
  const today = todayISO()
  // Carrera 5 semanas antes → hoy es la semana 6 del plan
  const raceDate = addDays('2027-10-10', -35)
  const profile = { ...DEFAULT_PROFILE, name: 'Atleta de ejemplo', heightCm: 176, startWeightKg: 92, goalWeightKg: 80, birthDate: '1988-03-10', raceDate, medicalCheckDone: true, swimContinuousM: 100, createdAt: new Date().toISOString() }
  const id = await db.profile.add(profile)
  await regeneratePlan({ ...profile, id })
  await ensureFoodSeed()

  // Sesiones pasadas: ~85 % hechas
  const past = await db.planSessions.where('date').below(today).toArray()
  let k = 0
  for (const s of past) {
    k++
    if (s.optional) continue
    if (k % 7 === 3) {
      await db.skipLogs.add({ planSessionId: s.id!, date: s.date, reasonCategory: k % 2 ? 'trabajo' : 'cansancio' })
      await db.planSessions.update(s.id!, { status: 'skipped' })
      continue
    }
    await db.workoutLogs.add({
      planSessionId: s.id,
      date: s.date,
      sport: s.sport,
      durationMin: s.durationMin + ((k % 3) - 1) * 5,
      distanceM: s.distanceM,
      rpe: Math.min(8, s.intensityRpe + (k % 4 === 0 ? 1 : 0)),
      isExtra: false,
      segments: s.structure?.kind === 'segments' ? s.structure.segments.map((g) => ({ sport: g.sport, durationMin: g.durationMin })) : undefined,
      createdAt: new Date().toISOString(),
    })
    await db.planSessions.update(s.id!, { status: 'done' })
  }

  // Peso: de 92 kg bajando ~0,5 kg/semana con ruido
  for (let d = 38; d >= 0; d -= 1) {
    if (d % 2 === 1 && d > 3) continue
    const kg = 92 - ((38 - d) / 7) * 0.5 + Math.sin(d * 1.7) * 0.35
    await db.bodyLogs.add({ date: addDays(today, -d), weightKg: Math.round(kg * 10) / 10 })
  }

  // Check-ins
  for (let d = 34; d >= 1; d -= 2) {
    await db.checkins.add({ date: addDays(today, -d), sleepHours: 6.5 + (d % 3) * 0.5, sleepQuality: 3 + (d % 2), energy: 3 + ((d + 1) % 3 === 0 ? 1 : 0), mood: 4 })
  }

  // Comidas de los últimos días
  const day = (date: string): Omit<MealLog, 'id'>[] => [
    { date, mealType: 'desayuno', name: 'Tostadas con aceite y tomate', grams: 120, kcal: 340, protein: 9, carbs: 48, fat: 12, source: 'manual', dataSource: 'base' },
    { date, mealType: 'desayuno', name: 'Café con leche', grams: 200, kcal: 60, protein: 3.4, carbs: 5.2, fat: 2.8, source: 'manual', dataSource: 'base' },
    { date, mealType: 'comida', name: 'Lentejas estofadas', grams: 350, kcal: 420, protein: 27, carbs: 62, fat: 7, source: 'photo', dataSource: 'ai', confidence: 0.7 },
    { date, mealType: 'comida', name: 'Pechuga de pollo a la plancha', grams: 150, kcal: 248, protein: 46, carbs: 0, fat: 5.4, source: 'manual', dataSource: 'base' },
    { date, mealType: 'cena', name: 'Tortilla francesa y ensalada', grams: 250, kcal: 330, protein: 20, carbs: 8, fat: 24, source: 'text', dataSource: 'ai', confidence: 0.75 },
    { date, mealType: 'snack', name: 'Yogur griego 0 % con plátano', grams: 245, kcal: 180, protein: 14, carbs: 32, fat: 1, source: 'manual', dataSource: 'base' },
  ]
  for (const d of [3, 2, 1]) await db.mealLogs.bulkAdd(day(addDays(today, -d)) as MealLog[])
  await db.mealLogs.bulkAdd(day(today).slice(0, 2) as MealLog[])
  await db.hydrationLogs.bulkAdd([{ date: today, ml: 500, context: 'day' }, { date: today, ml: 250, context: 'day' }])

  await db.testResults.add({ date: addDays(today, -10), type: 'swim_continuous_m', value: 300, unit: 'm', note: 'Con buena técnica' })
  await db.testResults.add({ date: addDays(today, -4), type: 'run_continuous_min', value: 12, unit: 'min' })
  await setSetting('demo', true)
}
