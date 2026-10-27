import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { aiErrorMessage } from '../../ai/client'
import { generateIdeas, type Idea } from '../../ai/ideas'
import { db, getSetting, setSetting, type MealLog } from '../../db/db'
import { addMeals, mealTypeForNow, saveTemplate } from '../../db/food'
import { addDays, type ISODate } from '../../domain/dates'
import { fmt1, normalize, type Macros } from '../../domain/nutrition/foods'
import { mealBudget, mealLabel, type MealType } from '../../domain/nutrition/ideas'
import type { DayType } from '../../domain/nutrition/targets'
import { Button } from '../../ui/Button'
import { Chips, Field, NumberInput, Switch } from '../../ui/Controls'
import { Icon } from '../../ui/Icon'
import { spring } from '../../ui/motion'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { useCurrentProfile } from '../hooks'
import { MEAL_TYPES } from './AddFoodSheet'

const MAIN: MealType[] = ['desayuno', 'comida', 'cena']

interface Saved {
  key: string
  ideas: Idea[]
  budgetKcal: number
}

/** Calcula el presupuesto de una comida a partir de lo que queda del día. */
export function useMealBudget(remaining: Macros, meals: MealLog[] | undefined, mealType: MealType) {
  return useMemo(() => {
    const done = new Set((meals ?? []).map((m) => m.mealType))
    const pending = MAIN.filter((m) => !done.has(m))
    return mealBudget(remaining, mealType, pending)
  }, [remaining, meals, mealType])
}

interface Props {
  open: boolean
  onClose: () => void
  date: ISODate
  remaining: Macros
  meals: MealLog[] | undefined
  dayType: DayType
}

export function IdeasSheet({ open, onClose, date, remaining, meals, dayType }: Props) {
  const profile = useCurrentProfile()
  const [mealType, setMealType] = useState<MealType>(mealTypeForNow)
  const auto = useMealBudget(remaining, meals, mealType)
  const [kcal, setKcal] = useState<number | undefined>(auto.kcal)
  const [quick, setQuick] = useState(true)
  const realfooding = useLiveQuery(() => getSetting('realfooding', true)) ?? true
  const [craving, setCraving] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Saved | null>(null)
  const recent = useLiveQuery(async () => [...new Set((await db.mealLogs.where('date').between(addDays(date, -5), date, true, true).toArray()).map((m) => m.name))], [date]) ?? []
  const toast = useToast()
  const key = `${date}|${mealType}`

  useEffect(() => {
    if (!open) return
    setError(null)
    getSetting<Saved | null>('mealIdeas', null).then((s) => setResult(s?.key === key ? s : null))
  }, [open, key])
  useEffect(() => setKcal(auto.kcal), [auto.kcal])

  const budget = { ...auto, kcal: kcal ?? auto.kcal }
  // Si cambias las kcal a mano, la proteína mínima se escala igual
  if (kcal && auto.kcal) budget.protein = Math.round((auto.protein * kcal) / auto.kcal)

  const ask = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await generateIdeas({ profile, mealType, budget, quick, craving: craving.trim() || undefined, dayType, recentMeals: recent, realfooding })
      if (!r.ideas.length) throw new Error('Ninguna idea pasó el filtro de alergias y ultraprocesados. Prueba otra vez.')
      const saved = { key, ideas: r.ideas, budgetKcal: budget.kcal }
      setResult(saved)
      await setSetting('mealIdeas', saved)
    } catch (e) {
      setError(aiErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const toMeal = (i: Idea): Omit<MealLog, 'id'> => ({
    date,
    mealType,
    name: i.nombre,
    grams: Math.round(i.ingredientes.reduce((a, x) => a + x.gramos, 0)) || undefined,
    kcal: i.kcal,
    protein: Math.round(i.proteina_g * 10) / 10,
    carbs: Math.round(i.hidratos_g * 10) / 10,
    fat: Math.round(i.grasa_g * 10) / 10,
    source: 'text',
    dataSource: 'ai',
    notes: i.ingredientes.map((x) => `${x.nombre} ${x.cantidad}`).join(', '),
  })

  return (
    <Sheet open={open} onClose={onClose} title="Ideas para comer" left={<Button variant="plain" onClick={onClose}>Cerrar</Button>}>
      <div className="stack-lg">
        <Chips value={mealType} onChange={(m) => setMealType(m as MealType)} options={MEAL_TYPES} />

        <div className="card stack" style={{ gap: 10 }}>
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="t-headline num">≈ {budget.kcal.toLocaleString('es-ES')} kcal</div>
              <div className="t-foot muted num">
                Mínimo {budget.protein} g de proteína · lo que te queda para {mealLabel(mealType)}
              </div>
            </div>
            <div style={{ width: 132, flex: 'none' }}>
              <NumberInput value={kcal} onChange={setKcal} suffix="kcal" step="10" />
            </div>
          </div>
          <div className="row">
            <span className="grow t-body">Rápidas (15 min o menos)</span>
            <Switch label="Rápidas" checked={quick} onChange={setQuick} />
          </div>
          <div className="row">
            <span className="grow">
              <span className="t-body">Solo comida real</span>
              <span className="t-foot muted" style={{ display: 'block' }}>Sin ultraprocesados, estilo realfooding</span>
            </span>
            <Switch label="Solo comida real" checked={realfooding} onChange={(v) => setSetting('realfooding', v)} />
          </div>
        </div>

        <Field label="¿Qué te apetece o qué tienes en la nevera? (opcional)">
          <input className="input" value={craving} placeholder="Ej.: algo con huevos, tengo calabacín y atún" onChange={(e) => setCraving(e.target.value)} />
        </Field>

        <Button variant="filled block" disabled={busy || budget.kcal < 80} onClick={ask}>
          {busy ? 'Cocinando ideas…' : result ? 'Dame otras ideas' : 'Dame ideas'}
        </Button>
        {budget.kcal < 80 && <div className="t-foot muted">Ya has cubierto las calorías de hoy. Si tienes hambre, tira de verdura, caldo o una infusión.</div>}
        {error && (
          <div className="banner red" role="alert">
            <Icon name="warning" size={20} />
            <span className="t-sub">{error}</span>
          </div>
        )}

        <AnimatePresence initial={false}>
          {result?.ideas.map((i, n) => (
            <motion.div key={`${result.key}-${i.nombre}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: n * 0.05 }} className="card stack" style={{ gap: 10 }}>
              <div>
                <div className="t-title3">{i.nombre}</div>
                <div className="t-sub muted">{i.descripcion}</div>
                {i.basada_en && normalize(i.basada_en) !== normalize(i.nombre) && <div className="t-foot faint">Versión de: {i.basada_en}</div>}
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                <span className="pill num">{i.tiempo_min} min</span>
                <span className="pill num">{i.kcal} kcal</span>
                {!i.fits && <span className="pill" style={{ color: 'var(--orange)' }}>Se sale del presupuesto</span>}
              </div>
              <div className="t-foot num">
                <b style={{ color: 'var(--macro-protein)' }}>P</b> {fmt1(i.proteina_g)} g · <b style={{ color: 'var(--macro-carbs)' }}>H</b> {fmt1(i.hidratos_g)} g · <b style={{ color: 'var(--macro-fat)' }}>G</b> {fmt1(i.grasa_g)} g
              </div>
              <details>
                <summary className="t-sub" style={{ color: 'var(--tint)', cursor: 'pointer' }}>Ingredientes y pasos</summary>
                <ul className="t-sub" style={{ margin: '8px 0', paddingLeft: 18 }}>
                  {i.ingredientes.map((x) => (
                    <li key={x.nombre}>
                      {x.nombre} · {x.cantidad}
                    </li>
                  ))}
                </ul>
                <ol className="t-sub" style={{ margin: 0, paddingLeft: 18 }}>
                  {i.pasos.map((p, k) => (
                    <li key={k}>{p}</li>
                  ))}
                </ol>
              </details>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <Button
                  variant="small filled"
                  onClick={async () => {
                    const ids = await addMeals([toMeal(i)])
                    onClose()
                    toast(`Apuntado: ${i.nombre}`, { label: 'Deshacer', run: () => db.mealLogs.bulkDelete(ids) })
                  }}
                >
                  Me la hago
                </Button>
                <Button
                  variant="small"
                  aria-label={`Guardar ${i.nombre} en favoritos`}
                  onClick={async () => {
                    await saveTemplate(i.nombre, [toMeal(i)])
                    toast('Guardada en favoritos')
                  }}
                >
                  <Icon name="heart" size={16} />
                </Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {result && <p className="t-foot muted" style={{ margin: 0 }}>Calorías estimadas: pueden variar un ±10-20 % según marcas y cantidades. Revisa los ingredientes si tienes alergias.</p>}
      </div>
    </Sheet>
  )
}
