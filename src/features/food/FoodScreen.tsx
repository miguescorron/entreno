import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { db, type MealLog } from '../../db/db'
import { addWater, mealTypeForNow, saveTemplate } from '../../db/food'
import { addDays, formatDayLong, weekNumberFor, type ISODate } from '../../domain/dates'
import { fmt1, scaleMacros, sumMacros } from '../../domain/nutrition/foods'
import { fuelingAdvice } from '../../domain/nutrition/targets'
import { phaseForWeek } from '../../domain/plan/generator'
import { Button, Pressable } from '../../ui/Button'
import { Field, NumberInput } from '../../ui/Controls'
import { Icon } from '../../ui/Icon'
import { spring } from '../../ui/motion'
import { Screen } from '../../ui/Screen'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { usePlanContext } from '../hooks'
import { AddFoodSheet, MEAL_TYPES, SourceTag, type AddMode } from './AddFoodSheet'
import { IdeasSheet, useMealBudget } from './IdeasSheet'
import { DAY_TYPE_LABEL, MacroSummary } from './MacroSummary'
import { useDayNutrition, useNutritionBootstrap } from './useNutrition'

export function FoodScreen() {
  const { today, planStart } = usePlanContext()
  const [date, setDate] = useState<ISODate>(today)
  const [adding, setAdding] = useState<AddMode | null>(null)
  const [editing, setEditing] = useState<MealLog | null>(null)
  const { targets, meals, eaten, water, adjustment } = useDayNutrition(date)
  const [ideas, setIdeas] = useState(false)
  const nextMeal = mealTypeForNow()
  const nextBudget = useMealBudget(
    { kcal: (targets?.kcal ?? 0) - eaten.kcal, protein: (targets?.proteinG ?? 0) - eaten.protein, carbs: (targets?.carbsG ?? 0) - eaten.carbs, fat: (targets?.fatG ?? 0) - eaten.fat },
    meals,
    nextMeal,
  )
  const nextMealLabel = nextMeal === 'entreno' ? 'el entreno' : nextMeal === 'snack' ? 'picar algo' : `el ${nextMeal}`
  const toast = useToast()
  useNutritionBootstrap()

  const sessions = useLiveQuery(() => db.planSessions.where('date').equals(date).toArray(), [date]) ?? []
  const longest = Math.max(0, ...sessions.filter((s) => s.status !== 'skipped').map((s) => s.durationMin))
  const fuel = fuelingAdvice(longest, phaseForWeek(weekNumberFor(planStart, date) ?? 1))

  const byMeal = useMemo(() => MEAL_TYPES.map((t) => ({ ...t, items: (meals ?? []).filter((m) => m.mealType === t.value) })), [meals])

  return (
    <Screen
      title="Comida"
      eyebrow={
        <span className="row" style={{ gap: 4 }}>
          <button className="btn plain small" style={{ padding: 0, minHeight: 24 }} onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior">
            <Icon name="chevronLeft" size={18} />
          </button>
          <span>{date === today ? `Hoy · ${formatDayLong(date)}` : capitalize(formatDayLong(date))}</span>
          <button className="btn plain small" style={{ padding: 0, minHeight: 24 }} onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Día siguiente">
            <Icon name="chevronRight" size={18} />
          </button>
        </span>
      }
      accessory={
        <button className="icon-btn" style={{ background: 'var(--tint)', color: '#fff' }} onClick={() => setAdding('menu')} aria-label="Añadir comida">
          <Icon name="plus" size={22} strokeWidth={2.4} />
        </button>
      }
    >
      <div className="stack-lg">
        {targets && (
          <div className="card stack">
            <div className="row-between">
              <span className="t-headline">{DAY_TYPE_LABEL[targets.dayType]}</span>
              <span className="t-foot muted num">Objetivo {targets.kcal.toLocaleString('es-ES')} kcal</span>
            </div>
            <MacroSummary targets={targets} eaten={eaten} />
            {(targets.notes.length > 0 || (adjustment && adjustment.kcal !== 0)) && (
              <div className="t-foot muted">
                {targets.notes.join(' ')}
                {adjustment && adjustment.kcal !== 0 && ` Ajuste semanal: ${adjustment.kcal > 0 ? '+' : ''}${adjustment.kcal} kcal. ${adjustment.reason}`}
              </div>
            )}
          </div>
        )}

        {fuel && (
          <div className="banner" style={{ background: 'color-mix(in srgb, var(--tint) 12%, var(--bg-elevated))' }}>
            <Icon name="bolt" size={20} style={{ color: 'var(--tint)', flex: 'none' }} />
            <span className="t-sub">
              <b>Durante el entreno de {longest}':</b> {fuel}
            </span>
          </div>
        )}

        <div className="add-grid">
          <QuickTile icon="camera" label="Foto" onClick={() => setAdding('photo')} />
          <QuickTile icon="barcode" label="Código" onClick={() => setAdding('barcode')} />
          <QuickTile icon="mic" label="Texto o voz" onClick={() => setAdding('text')} />
        </div>

        {targets && date === today && (
          <Pressable className="card row" style={{ border: 0, textAlign: 'left', width: '100%' }} onClick={() => setIdeas(true)}>
            <span className="sport-badge" style={{ background: 'var(--orange)', width: 40, height: 40, borderRadius: 12 }}>
              <Icon name="bolt" size={22} strokeWidth={2} />
            </span>
            <div className="grow">
              <div className="t-headline">¿No sabes qué comer?</div>
              <div className="t-sub muted num">
                Ideas rápidas para {nextMealLabel} con ≈ {nextBudget.kcal.toLocaleString('es-ES')} kcal
              </div>
            </div>
            <Icon name="chevronRight" size={18} className="chevron" />
          </Pressable>
        )}

        {byMeal.map((g) => (
          <MealGroup
            key={g.value}
            label={g.label}
            items={g.items}
            onEdit={setEditing}
            onSaveFavorite={async () => {
              const name = window.prompt('Nombre del favorito', g.items.map((i) => i.name).join(' + ').slice(0, 40))
              if (name?.trim()) {
                await saveTemplate(name.trim(), g.items)
                toast('Guardado en favoritos')
              }
            }}
          />
        ))}

        {targets && <WaterCard date={date} total={water} target={targets.waterMl} />}
      </div>

      {targets && (
        <IdeasSheet
          open={ideas}
          onClose={() => setIdeas(false)}
          date={date}
          remaining={{ kcal: targets.kcal - eaten.kcal, protein: targets.proteinG - eaten.protein, carbs: targets.carbsG - eaten.carbs, fat: targets.fatG - eaten.fat }}
          meals={meals}
          dayType={targets.dayType}
        />
      )}
      <AddFoodSheet open={!!adding} onClose={() => setAdding(null)} date={date} initialMode={adding ?? 'menu'} />
      <MealEditSheet meal={editing} onClose={() => setEditing(null)} />
    </Screen>
  )
}

function QuickTile({ icon, label, onClick }: { icon: 'camera' | 'barcode' | 'mic'; label: string; onClick: () => void }) {
  return (
    <Pressable className="add-tile" onClick={onClick}>
      <Icon name={icon} size={24} />
      <span>{label}</span>
    </Pressable>
  )
}

function MealGroup({ label, items, onEdit, onSaveFavorite }: { label: string; items: MealLog[]; onEdit: (m: MealLog) => void; onSaveFavorite: () => void }) {
  const total = sumMacros(items)
  return (
    <section>
      <div className="group-title row-between">
        <span className="t-section">{label}</span>
        {items.length > 0 && (
          <span className="row" style={{ gap: 8 }}>
            <span className="t-foot muted num">{total.kcal} kcal</span>
            <button className="btn plain small" style={{ minHeight: 24, padding: 0 }} onClick={onSaveFavorite} aria-label={`Guardar ${label} como favorito`}>
              <Icon name="heart" size={16} />
            </button>
          </span>
        )}
      </div>
      <div className="group">
        <AnimatePresence initial={false}>
          {items.length === 0 && (
            <div className="cell t-sub faint" key="empty">
              Nada todavía
            </div>
          )}
          {items.map((m) => (
            <motion.div key={m.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring}>
              <Pressable className="cell" onClick={() => onEdit(m)}>
                <div className="grow">
                  <div className="t-callout">{m.name}</div>
                  <div className="t-foot muted num">
                    {m.grams ? `${m.grams} g · ` : ''}P {fmt1(m.protein)} · H {fmt1(m.carbs)} · G {fmt1(m.fat)}
                  </div>
                </div>
                <SourceTag source={m.dataSource} />
                <span className="t-callout num" style={{ minWidth: 52, textAlign: 'right' }}>{m.kcal}</span>
              </Pressable>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  )
}

function MealEditSheet({ meal, onClose }: { meal: MealLog | null; onClose: () => void }) {
  const [grams, setGrams] = useState<number>()
  const toast = useToast()
  const photoUrl = useMemo(() => (meal?.photoBlob ? URL.createObjectURL(meal.photoBlob) : null), [meal])
  useEffect(() => {
    setGrams(meal?.grams)
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  }, [meal, photoUrl])

  const scaled = meal && meal.grams && grams ? scaleMacros(meal, meal.grams, grams) : meal
  return (
    <Sheet
      open={!!meal}
      onClose={onClose}
      title={meal?.name}
      left={<Button variant="plain" onClick={onClose}>Cancelar</Button>}
      right={
        <Button
          variant="plain"
          style={{ fontWeight: 600 }}
          disabled={!meal?.grams || !grams}
          onClick={async () => {
            if (meal && scaled && grams) await db.mealLogs.update(meal.id!, { grams, ...scaled })
            onClose()
          }}
        >
          Guardar
        </Button>
      }
    >
      {meal && scaled && (
        <div className="stack-lg">
          {photoUrl && <img src={photoUrl} alt="" className="photo-preview" style={{ maxHeight: 180 }} />}
          {meal.grams ? (
            <Field label="Cantidad" hint={meal.gramsRange ? `Rango estimado: ${meal.gramsRange[0]}-${meal.gramsRange[1]} g` : undefined}>
              <NumberInput value={grams} onChange={setGrams} suffix="g" step="5" />
            </Field>
          ) : null}
          <div className="card tight num">
            <div className="t-headline">{scaled.kcal} kcal</div>
            <div className="t-foot muted">
              Proteína {fmt1(scaled.protein)} g · Hidratos {fmt1(scaled.carbs)} g · Grasa {fmt1(scaled.fat)} g{scaled.fiber ? ` · Fibra ${fmt1(scaled.fiber)} g` : ''}
            </div>
          </div>
          {meal.assumptions && meal.assumptions.length > 0 && <div className="t-foot muted">Supuestos: {meal.assumptions.join(' · ')}</div>}
          <div className="row t-foot muted" style={{ gap: 6 }}>
            Fuente: <SourceTag source={meal.dataSource} />
            {meal.confidence != null && <span>· confianza {Math.round(meal.confidence * 100)} %</span>}
          </div>
          <Button
            variant="danger"
            onClick={async () => {
              const { id, ...rest } = meal
              await db.mealLogs.delete(id!)
              onClose()
              toast('Eliminado', { label: 'Deshacer', run: () => db.mealLogs.add(rest as MealLog) })
            }}
          >
            <Icon name="trash" size={18} /> Eliminar
          </Button>
        </div>
      )}
    </Sheet>
  )
}

function WaterCard({ date, total, target }: { date: ISODate; total: number; target: number }) {
  const pct = Math.min(1, total / target)
  return (
    <section>
      <div className="group-title t-section">Hidratación</div>
      <div className="card stack">
        <div className="row-between">
          <span className="row t-headline num" style={{ gap: 6 }}>
            <Icon name="drop" size={20} style={{ color: 'var(--tint)' }} />
            {(total / 1000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} / {(target / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} l
          </span>
        </div>
        <div className="progress-track" role="meter" aria-label="Agua" aria-valuemin={0} aria-valuemax={target} aria-valuenow={total}>
          <motion.div className="progress-fill" initial={false} animate={{ width: `${pct * 100}%` }} transition={spring} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <Button variant="small tinted" onClick={() => addWater(date, 250)}>+250 ml</Button>
          <Button variant="small tinted" onClick={() => addWater(date, 500)}>+500 ml</Button>
          <Button variant="small tinted" onClick={() => addWater(date, 500, 'training')}>Entreno</Button>
        </div>
        <div className="t-foot muted">≥ 35 ml/kg al día más lo que bebas entrenando.</div>
      </div>
    </section>
  )
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
