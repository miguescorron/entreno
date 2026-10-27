import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { aiErrorMessage } from '../../ai/client'
import { estimateFromPhoto, estimateFromText, readLabel, sanitizePlato, type Estimacion } from '../../ai/food'
import { db, type FoodItem, type MealLog, type MealTemplate } from '../../db/db'
import { addMeals, defaultGrams, learnAiPortion, logTemplate, mealFromFood, mealTypeForNow, saveTemplate, searchFoods } from '../../db/food'
import type { ISODate } from '../../domain/dates'
import { fmt1, macrosFor, scaleMacros, sumMacros, type Macros } from '../../domain/nutrition/foods'
import { compressImage } from '../../lib/image'
import { lookupBarcode } from '../../lib/openfoodfacts'
import { Button, Pressable } from '../../ui/Button'
import { Chips, Field, NumberInput, Switch } from '../../ui/Controls'
import { Icon, type IconName } from '../../ui/Icon'
import { spring } from '../../ui/motion'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { BarcodeScanner } from './BarcodeScanner'

export type AddMode = 'menu' | 'photo' | 'label' | 'barcode' | 'text' | 'search' | 'manual' | 'favorites'
type Step = AddMode | 'grams' | 'review'
type MealType = MealLog['mealType']

export const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'desayuno', label: 'Desayuno' },
  { value: 'comida', label: 'Comida' },
  { value: 'cena', label: 'Cena' },
  { value: 'snack', label: 'Snack' },
  { value: 'entreno', label: 'Entreno' },
]

const REFERENCES = ['Ninguno', 'Tenedor', 'Mano', 'Plato de 24 cm']

interface ReviewItem {
  key: string
  name: string
  grams: number
  baseGrams: number
  base: Macros
  range?: [number, number]
  confidence?: number
  assumptions?: string[]
  dataSource: NonNullable<MealLog['dataSource']>
  foodItemId?: number
}

interface ReviewState {
  source: 'photo' | 'text'
  items: ReviewItem[]
  questions: string[]
  photo?: Blob
}

const SOURCE_LABEL: Record<string, string> = { ai: 'IA', off: 'OFF', manual: 'Manual', base: 'Base' }

export function SourceTag({ source }: { source?: string }) {
  if (!source) return null
  return <span className="source-tag" title={source === 'off' ? 'Open Food Facts' : undefined}>{SOURCE_LABEL[source] ?? source}</span>
}

interface Props {
  open: boolean
  onClose: () => void
  date: ISODate
  initialMode?: AddMode
}

export function AddFoodSheet({ open, onClose, date, initialMode = 'menu' }: Props) {
  const [step, setStep] = useState<Step>(initialMode)
  const [dir, setDir] = useState(1)
  const [mealType, setMealType] = useState<MealType>(mealTypeForNow)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<ReviewState | null>(null)
  const [food, setFood] = useState<FoodItem | null>(null)
  const toast = useToast()
  const reduce = useReducedMotion()

  useEffect(() => {
    if (open) {
      setStep(initialMode)
      setMealType(mealTypeForNow())
      setReview(null)
      setFood(null)
      setError(null)
      setBusy(null)
    }
  }, [open, initialMode])

  const go = useCallback((s: Step, d = 1) => {
    setDir(d)
    setError(null)
    setStep(s)
  }, [])

  const back = () => {
    if (step === 'grams' || step === 'manual') return go(review ? 'review' : step === 'manual' ? 'search' : 'search', -1)
    if (step === 'review') return go('menu', -1)
    go('menu', -1)
  }

  const run = async <T,>(msg: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(msg)
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(aiErrorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const fromEstimate = (e: Estimacion, source: 'photo' | 'text', photo?: Blob) => {
    const items: ReviewItem[] = e.platos.map(sanitizePlato).map((p, i) => ({
      key: `${Date.now()}-${i}`,
      name: p.nombre,
      grams: p.gramos_estimados,
      baseGrams: p.gramos_estimados,
      base: { kcal: p.kcal, protein: p.proteina_g, carbs: p.hidratos_g, fat: p.grasa_g, fiber: p.fibra_g },
      range: p.rango_gramos as [number, number],
      confidence: p.confianza,
      assumptions: p.supuestos,
      dataSource: 'ai',
    }))
    setReview({ source, items, questions: e.preguntas_aclaratorias, photo })
    go('review')
  }

  // Un alimento elegido de la base, el código de barras o la etiqueta
  const pickFood = (f: FoodItem) => {
    setFood(f)
    go('grams')
  }

  const addFoodToDiary = async (f: FoodItem, grams: number) => {
    if (review) {
      const m = macrosFor({ kcal: f.kcal100g, protein: f.protein100g, carbs: f.carbs100g, fat: f.fat100g, fiber: f.fiber100g }, grams)
      setReview({ ...review, items: [...review.items, { key: String(Date.now()), name: f.name, grams, baseGrams: grams, base: m, dataSource: f.source, foodItemId: f.id }] })
      go('review', -1)
      return
    }
    const ids = await addMeals([mealFromFood(f, grams, { date, mealType, source: f.source === 'off' ? 'barcode' : f.source === 'ai' ? 'label' : 'manual' })])
    finish(`Añadido: ${f.name} ${grams} g`, ids)
  }

  const finish = (text: string, ids: number[]) => {
    onClose()
    toast(text, { label: 'Deshacer', run: () => db.mealLogs.bulkDelete(ids) })
  }

  const title: Record<Step, string> = {
    menu: 'Añadir comida',
    photo: 'Foto del plato',
    label: 'Etiqueta nutricional',
    barcode: 'Código de barras',
    text: 'Texto o voz',
    search: 'Buscar alimento',
    manual: 'Añadir a mano',
    favorites: 'Favoritos',
    grams: 'Cantidad',
    review: 'Revisar',
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title[step]}
      left={
        step === initialMode ? (
          <Button variant="plain" onClick={onClose}>Cancelar</Button>
        ) : (
          <Button variant="plain" onClick={back}>
            <Icon name="chevronLeft" size={20} strokeWidth={2.2} /> Atrás
          </Button>
        )
      }
    >
      <div className="stack-lg">
        {step !== 'favorites' && (
          <Chips value={mealType} onChange={setMealType} options={MEAL_TYPES} />
        )}
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: reduce ? 0 : dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduce ? 0 : -dir * 40 }}
            transition={spring}
            className="stack-lg"
          >
            {step === 'menu' && <Menu onPick={(m) => go(m)} />}
            {step === 'photo' && (
              <PhotoStep
                busy={busy}
                onAnalyze={(blob, reference, note) =>
                  run('Analizando la foto…', async () => fromEstimate(await estimateFromPhoto(blob, { reference, note }), 'photo', blob))
                }
              />
            )}
            {step === 'label' && (
              <LabelStep
                busy={busy}
                onPhoto={(blob) =>
                  run('Leyendo la etiqueta…', async () => {
                    const l = await readLabel(blob)
                    if (!l.es_etiqueta) throw new Error('No veo una etiqueta nutricional en la foto. Prueba más cerca y con luz.')
                    const item: FoodItem = {
                      name: l.nombre || 'Producto',
                      brand: l.marca || undefined,
                      kcal100g: Math.round(l.por_100g.kcal),
                      protein100g: l.por_100g.proteina_g,
                      carbs100g: l.por_100g.hidratos_g,
                      fat100g: l.por_100g.grasa_g,
                      fiber100g: l.por_100g.fibra_g,
                      servingGrams: l.racion_g > 0 ? l.racion_g : undefined,
                      source: 'ai',
                    }
                    item.id = await db.foodItems.add(item)
                    pickFood(item)
                  })
                }
              />
            )}
            {step === 'barcode' && (
              <BarcodeStep busy={busy} onCode={(code) => run('Buscando el producto…', async () => pickFood(await lookupBarcode(code)))} />
            )}
            {step === 'text' && <TextStep busy={busy} onSubmit={(t) => run('Calculando…', async () => fromEstimate(await estimateFromText(t), 'text'))} />}
            {step === 'search' && <SearchStep onPick={pickFood} onManual={() => go('manual')} />}
            {step === 'manual' && (
              <ManualStep
                inReview={!!review}
                onAdd={async (name, grams, m) => {
                  if (review) {
                    setReview({ ...review, items: [...review.items, { key: String(Date.now()), name, grams: grams ?? 0, baseGrams: grams ?? 0, base: m, dataSource: 'manual' }] })
                    return go('review', -1)
                  }
                  const ids = await addMeals([{ date, mealType, name, grams, ...m, source: 'manual', dataSource: 'manual' }])
                  finish(`Añadido: ${name}`, ids)
                }}
              />
            )}
            {step === 'favorites' && (
              <FavoritesStep
                onPick={async (t) => {
                  const ids = await logTemplate(t, date, mealType)
                  finish(`Añadido: ${t.name}`, ids)
                }}
                mealType={mealType}
                setMealType={setMealType}
              />
            )}
            {step === 'grams' && food && <GramsStep food={food} inReview={!!review} onAdd={(g) => addFoodToDiary(food, g)} />}
            {step === 'review' && review && (
              <ReviewStep
                review={review}
                setReview={setReview}
                onAddMore={() => go('search')}
                onSave={async (favName) => {
                  const groupId = `${Date.now()}`
                  const meals: Omit<MealLog, 'id'>[] = review.items
                    .filter((i) => i.grams > 0)
                    .map((i, idx) => ({
                      date,
                      mealType,
                      name: i.name,
                      grams: i.grams,
                      ...scaleMacros(i.base, i.baseGrams, i.grams),
                      source: review.source,
                      dataSource: i.dataSource,
                      foodItemId: i.foodItemId,
                      groupId,
                      confidence: i.confidence,
                      gramsRange: i.range,
                      assumptions: i.assumptions,
                      photoBlob: idx === 0 ? review.photo : undefined,
                    }))
                  const ids = await addMeals(meals)
                  for (const i of review.items) {
                    if (i.dataSource === 'ai' && i.grams !== i.baseGrams && i.baseGrams > 0) await learnAiPortion(i.name, scaleMacros(i.base, i.baseGrams, 100), i.grams)
                  }
                  if (favName) await saveTemplate(favName, meals)
                  const total = sumMacros(meals)
                  finish(`Guardado: ${meals.length} ${meals.length === 1 ? 'alimento' : 'alimentos'}, ${total.kcal} kcal`, ids)
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
        {error && (
          <div className="banner red" role="alert">
            <Icon name="warning" size={20} />
            <span className="t-sub">{error}</span>
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ---------- pasos ----------

function Menu({ onPick }: { onPick: (m: AddMode) => void }) {
  const tiles: { mode: AddMode; icon: IconName; label: string }[] = [
    { mode: 'photo', icon: 'camera', label: 'Foto del plato' },
    { mode: 'barcode', icon: 'barcode', label: 'Código de barras' },
    { mode: 'label', icon: 'label', label: 'Etiqueta' },
    { mode: 'text', icon: 'mic', label: 'Texto o voz' },
    { mode: 'search', icon: 'search', label: 'Buscar' },
    { mode: 'favorites', icon: 'heart', label: 'Favoritos' },
  ]
  return (
    <>
      <div className="add-grid">
        {tiles.map((t) => (
          <Pressable key={t.mode} className="add-tile" onClick={() => onPick(t.mode)}>
            <Icon name={t.icon} size={26} />
            <span>{t.label}</span>
          </Pressable>
        ))}
      </div>
      <p className="t-foot muted" style={{ margin: 0 }}>
        Si el producto tiene etiqueta o código de barras, úsalos: son más precisos que la foto del plato.
      </p>
    </>
  )
}

function Busy({ text }: { text: string }) {
  return (
    <div className="row" style={{ justifyContent: 'center', padding: '24px 0' }} role="status">
      <div className="spinner" />
      <span className="t-callout muted">{text}</span>
    </div>
  )
}

function usePhotoPicker() {
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url)
  }, [photo])
  const onFile = async (file?: File) => {
    if (!file) return
    try {
      const blob = await compressImage(file)
      setPhoto({ blob, url: URL.createObjectURL(blob) })
      setErr(null)
    } catch {
      setErr('No he podido abrir la foto.')
    }
  }
  return { photo, onFile, err }
}

function PhotoButtons({ onFile }: { onFile: (f?: File) => void }) {
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <Button variant="filled" onClick={() => camera.current?.click()}>
        <Icon name="camera" size={20} /> Hacer foto
      </Button>
      <Button onClick={() => gallery.current?.click()}>Galería</Button>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  )
}

function PhotoStep({ busy, onAnalyze }: { busy: string | null; onAnalyze: (b: Blob, reference?: string, note?: string) => void }) {
  const { photo, onFile, err } = usePhotoPicker()
  const [reference, setReference] = useState('Ninguno')
  const [note, setNote] = useState('')
  if (busy) return <Busy text={busy} />
  return (
    <>
      {photo ? <img src={photo.url} alt="Foto del plato" className="photo-preview" /> : <p className="t-callout muted" style={{ margin: 0 }}>Haz la foto desde arriba, con todo el plato a la vista.</p>}
      <PhotoButtons onFile={onFile} />
      {err && <div className="t-foot" style={{ color: 'var(--red)' }}>{err}</div>}
      {photo && (
        <>
          <Field label="Objeto de referencia (opcional)" hint="Ayuda a estimar el tamaño de la ración.">
            <Chips value={reference} onChange={setReference} options={REFERENCES.map((r) => ({ value: r, label: r }))} />
          </Field>
          <Field label="Nota (opcional)">
            <input className="input" placeholder="Ej.: sin aceite, ración pequeña" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button variant="filled block" onClick={() => onAnalyze(photo.blob, reference === 'Ninguno' ? undefined : reference, note.trim() || undefined)}>
            Calcular macros
          </Button>
        </>
      )}
    </>
  )
}

function LabelStep({ busy, onPhoto }: { busy: string | null; onPhoto: (b: Blob) => void }) {
  const { photo, onFile, err } = usePhotoPicker()
  if (busy) return <Busy text={busy} />
  return (
    <>
      {photo ? <img src={photo.url} alt="Etiqueta" className="photo-preview" /> : <p className="t-callout muted" style={{ margin: 0 }}>Fotografía la tabla de información nutricional, recta y con buena luz.</p>}
      <PhotoButtons onFile={onFile} />
      {err && <div className="t-foot" style={{ color: 'var(--red)' }}>{err}</div>}
      {photo && (
        <Button variant="filled block" onClick={() => onPhoto(photo.blob)}>
          Leer etiqueta
        </Button>
      )}
    </>
  )
}

function BarcodeStep({ busy, onCode }: { busy: string | null; onCode: (c: string) => void }) {
  if (busy) return <Busy text={busy} />
  return <BarcodeScanner onCode={onCode} />
}

function TextStep({ busy, onSubmit }: { busy: string | null; onSubmit: (t: string) => void }) {
  const [text, setText] = useState('')
  if (busy) return <Busy text={busy} />
  return (
    <>
      <textarea className="input" rows={4} autoFocus placeholder="Dos tostadas con aceite y jamón y un café con leche" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="t-foot muted">Para dictar, pulsa el micrófono del teclado del iPhone.</div>
      <Button variant="filled block" disabled={text.trim().length < 3} onClick={() => onSubmit(text.trim())}>
        Calcular macros
      </Button>
    </>
  )
}

function SearchStep({ onPick, onManual }: { onPick: (f: FoodItem) => void; onManual: () => void }) {
  const [q, setQ] = useState('')
  const results = useLiveQuery(() => searchFoods(q), [q]) ?? []
  return (
    <>
      <input className="input" type="search" autoFocus placeholder="Arroz, pollo, yogur…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="group">
        {results.map((f) => (
          <Pressable key={f.id} className="cell" onClick={() => onPick(f)}>
            <div className="grow">
              <div className="t-callout">{f.name}{f.brand && <span className="muted"> · {f.brand}</span>}</div>
              <div className="t-foot muted num">{f.kcal100g} kcal/100 g{f.usualGrams ? ` · sueles tomar ${f.usualGrams} g` : ''}</div>
            </div>
            <SourceTag source={f.source} />
          </Pressable>
        ))}
        {results.length === 0 && <div className="cell t-sub muted">Sin resultados.</div>}
      </div>
      <Button variant="tinted block" onClick={onManual}>
        Añadir a mano
      </Button>
    </>
  )
}

function GramsStep({ food, inReview, onAdd }: { food: FoodItem; inReview: boolean; onAdd: (grams: number) => void }) {
  const [grams, setGrams] = useState<number | undefined>(defaultGrams(food))
  const per100 = { kcal: food.kcal100g, protein: food.protein100g, carbs: food.carbs100g, fat: food.fat100g, fiber: food.fiber100g }
  const m = macrosFor(per100, grams ?? 0)
  const quick = useMemo(() => {
    const opts = new Map<number, string>()
    if (food.usualGrams) opts.set(food.usualGrams, `Tu porción · ${food.usualGrams} g`)
    if (food.servingGrams && !opts.has(food.servingGrams)) opts.set(food.servingGrams, `Ración · ${food.servingGrams} g`)
    if (!opts.has(100)) opts.set(100, '100 g')
    return [...opts].map(([value, label]) => ({ value, label }))
  }, [food])
  return (
    <>
      <div className="row-between">
        <div>
          <div className="t-headline">{food.name}</div>
          {food.brand && <div className="t-sub muted">{food.brand}</div>}
        </div>
        <SourceTag source={food.source} />
      </div>
      <div className="t-foot muted num">
        Por 100 g: {food.kcal100g} kcal · P {fmt1(food.protein100g)} g · H {fmt1(food.carbs100g)} g · G {fmt1(food.fat100g)} g
      </div>
      <Field label="Cantidad">
        <NumberInput value={grams} onChange={setGrams} suffix="g" step="1" />
        <Chips value={grams ?? 0} onChange={setGrams} options={quick} />
      </Field>
      <MacroLine m={m} />
      <Button variant="filled block" disabled={!grams} onClick={() => grams && onAdd(grams)}>
        {inReview ? 'Añadir a la lista' : 'Añadir'}
      </Button>
    </>
  )
}

function MacroLine({ m }: { m: Macros }) {
  return (
    <div className="card tight row-between num" style={{ background: 'var(--fill)' }}>
      <span className="t-headline">{m.kcal} kcal</span>
      <span className="t-foot">
        <b style={{ color: 'var(--macro-protein)' }}>P</b> {fmt1(m.protein)} · <b style={{ color: 'var(--macro-carbs)' }}>H</b> {fmt1(m.carbs)} · <b style={{ color: 'var(--macro-fat)' }}>G</b> {fmt1(m.fat)}
      </span>
    </div>
  )
}

function ManualStep({ inReview, onAdd }: { inReview: boolean; onAdd: (name: string, grams: number | undefined, m: Macros) => void }) {
  const [name, setName] = useState('')
  const [grams, setGrams] = useState<number>()
  const [kcal, setKcal] = useState<number>()
  const [protein, setProtein] = useState<number>()
  const [carbs, setCarbs] = useState<number>()
  const [fat, setFat] = useState<number>()
  return (
    <>
      <Field label="Nombre">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="row">
        <div className="grow"><Field label="Cantidad"><NumberInput value={grams} onChange={setGrams} suffix="g" /></Field></div>
        <div className="grow"><Field label="Calorías"><NumberInput value={kcal} onChange={setKcal} suffix="kcal" /></Field></div>
      </div>
      <div className="row">
        <div className="grow"><Field label="Proteína"><NumberInput value={protein} onChange={setProtein} suffix="g" /></Field></div>
        <div className="grow"><Field label="Hidratos"><NumberInput value={carbs} onChange={setCarbs} suffix="g" /></Field></div>
        <div className="grow"><Field label="Grasa"><NumberInput value={fat} onChange={setFat} suffix="g" /></Field></div>
      </div>
      <Button
        variant="filled block"
        disabled={!name.trim() || kcal == null}
        onClick={() => onAdd(name.trim(), grams, { kcal: kcal ?? 0, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 })}
      >
        {inReview ? 'Añadir a la lista' : 'Añadir'}
      </Button>
    </>
  )
}

function FavoritesStep({ onPick, mealType, setMealType }: { onPick: (t: MealTemplate) => void; mealType: MealType; setMealType: (m: MealType) => void }) {
  const templates = useLiveQuery(() => db.mealTemplates.toArray()) ?? []
  const sorted = [...templates].sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''))
  return (
    <>
      <Chips value={mealType} onChange={setMealType} options={MEAL_TYPES} />
      {sorted.length === 0 ? (
        <p className="t-callout muted" style={{ margin: 0 }}>Aún no tienes favoritos. Al guardar una comida, marca «Guardar como favorito».</p>
      ) : (
        <div className="group">
          {sorted.map((t) => {
            const total = sumMacros(t.items)
            return (
              <div key={t.id} className="cell">
                <Pressable className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => onPick(t)}>
                  <div className="t-callout">{t.name}</div>
                  <div className="t-foot muted num">{total.kcal} kcal · {t.items.length} {t.items.length === 1 ? 'alimento' : 'alimentos'}</div>
                </Pressable>
                <button className="icon-btn" aria-label={`Borrar ${t.name}`} onClick={() => window.confirm(`¿Borrar el favorito «${t.name}»?`) && db.mealTemplates.delete(t.id!)}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function ReviewStep({ review, setReview, onAddMore, onSave }: { review: ReviewState; setReview: (r: ReviewState) => void; onAddMore: () => void; onSave: (favName?: string) => Promise<void> }) {
  const [fav, setFav] = useState(false)
  const [favName, setFavName] = useState(() => review.items.map((i) => i.name).join(' + ').slice(0, 40))
  const [saving, setSaving] = useState(false)
  const photoUrl = useMemo(() => (review.photo ? URL.createObjectURL(review.photo) : null), [review.photo])
  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl)
  }, [photoUrl])

  const update = (key: string, patch: Partial<ReviewItem>) => setReview({ ...review, items: review.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) })
  const remove = (key: string) => setReview({ ...review, items: review.items.filter((i) => i.key !== key) })
  const total = sumMacros(review.items.map((i) => scaleMacros(i.base, i.baseGrams, i.grams)))

  return (
    <>
      {photoUrl && <img src={photoUrl} alt="Foto analizada" className="photo-preview" style={{ maxHeight: 180 }} />}
      {review.items.length === 0 && <p className="t-callout muted" style={{ margin: 0 }}>No se ha reconocido comida. Añade los alimentos a mano.</p>}
      {review.questions.length > 0 && (
        <div className="banner">
          <span aria-hidden>🤔</span>
          <div className="t-sub">
            {review.questions.map((q) => (
              <div key={q}>{q}</div>
            ))}
            <div className="muted t-foot" style={{ marginTop: 4 }}>Ajusta los gramos o el nombre si hace falta.</div>
          </div>
        </div>
      )}
      <div className="stack">
        {review.items.map((i) => {
          const m = scaleMacros(i.base, i.baseGrams, i.grams)
          return (
            <motion.div key={i.key} layout transition={spring} className="card stack" style={{ gap: 10 }}>
              <div className="row">
                <input className="input grow" style={{ fontWeight: 600 }} value={i.name} onChange={(e) => update(i.key, { name: e.target.value })} aria-label="Nombre" />
                <button className="icon-btn" aria-label={`Quitar ${i.name}`} onClick={() => remove(i.key)}>
                  <Icon name="close" size={16} />
                </button>
              </div>
              <div className="row">
                <div style={{ width: 130 }}>
                  <NumberInput value={i.grams} onChange={(g) => update(i.key, { grams: g ?? 0 })} suffix="g" step="5" />
                </div>
                <div className="grow t-foot muted">
                  {i.range && <div className="num">Rango: {i.range[0]}-{i.range[1]} g</div>}
                  <div className="row" style={{ gap: 6 }}>
                    <SourceTag source={i.dataSource} />
                    {i.confidence != null && <span>confianza {Math.round(i.confidence * 100)} %</span>}
                  </div>
                </div>
              </div>
              <MacroLine m={m} />
              {i.assumptions && i.assumptions.length > 0 && <div className="t-foot muted">Supuestos: {i.assumptions.join(' · ')}</div>}
            </motion.div>
          )
        })}
      </div>
      <Button variant="tinted" onClick={onAddMore}>
        <Icon name="plus" size={18} /> Añadir otro alimento
      </Button>
      <div className="card stack" style={{ gap: 6 }}>
        <div className="row-between">
          <span className="t-headline">Total</span>
          <span className="t-headline num">{total.kcal} kcal</span>
        </div>
        <div className="t-foot muted num">
          Proteína {fmt1(total.protein)} g · Hidratos {fmt1(total.carbs)} g · Grasa {fmt1(total.fat)} g
        </div>
      </div>
      {review.source === 'photo' && <p className="t-foot muted" style={{ margin: 0 }}>La estimación por foto puede variar un ±20-30 %. Corrige los gramos si los conoces: la app aprende tus porciones.</p>}
      <div className="group">
        <div className="cell">
          <span className="grow t-body">Guardar como favorito</span>
          <Switch label="Guardar como favorito" checked={fav} onChange={setFav} />
        </div>
        {fav && (
          <div className="cell">
            <input className="input" value={favName} onChange={(e) => setFavName(e.target.value)} aria-label="Nombre del favorito" />
          </div>
        )}
      </div>
      <Button
        variant="filled block"
        disabled={saving || review.items.length === 0}
        onClick={async () => {
          setSaving(true)
          await onSave(fav && favName.trim() ? favName.trim() : undefined)
          setSaving(false)
        }}
      >
        Guardar en el diario
      </Button>
    </>
  )
}
