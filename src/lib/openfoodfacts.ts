import { z } from 'zod'
import { db, type FoodItem } from '../db/db'

// Open Food Facts: base de datos abierta y gratuita de productos envasados.
const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product'

const num = z.coerce.number().optional().catch(undefined)
const OffSchema = z.object({
  status: z.number(),
  product: z
    .object({
      product_name_es: z.string().optional(),
      product_name: z.string().optional(),
      brands: z.string().optional(),
      serving_quantity: num,
      nova_group: num,
      nutriments: z
        .object({
          'energy-kcal_100g': num,
          energy_100g: num,
          proteins_100g: num,
          carbohydrates_100g: num,
          fat_100g: num,
          fiber_100g: num,
        })
        .partial(),
    })
    .optional(),
})

export class ProductNotFoundError extends Error {
  constructor(code: string) {
    super(`No encuentro el código ${code} en Open Food Facts. Prueba con la foto de la etiqueta.`)
  }
}

/** Busca el código en local y, si no está, en Open Food Facts (y lo guarda para la próxima). */
export async function lookupBarcode(code: string): Promise<FoodItem> {
  const local = await db.foodItems.where('barcode').equals(code).first()
  if (local) return local

  const res = await fetch(`${OFF_URL}/${encodeURIComponent(code)}.json?fields=product_name,product_name_es,brands,serving_quantity,nova_group,nutriments`)
  if (!res.ok && res.status !== 404) throw new Error('Open Food Facts no responde. Prueba más tarde.')
  const data = OffSchema.parse(await res.json())
  const p = data.product
  const n = p?.nutriments
  const kcal = n?.['energy-kcal_100g'] ?? (n?.energy_100g != null ? n.energy_100g / 4.184 : undefined)
  if (data.status !== 1 || !p || kcal == null) throw new ProductNotFoundError(code)

  const item: FoodItem = {
    name: p.product_name_es || p.product_name || `Producto ${code}`,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    kcal100g: Math.round(kcal),
    protein100g: n?.proteins_100g ?? 0,
    carbs100g: n?.carbohydrates_100g ?? 0,
    fat100g: n?.fat_100g ?? 0,
    fiber100g: n?.fiber_100g,
    servingGrams: p.serving_quantity && p.serving_quantity > 0 ? p.serving_quantity : undefined,
    source: 'off',
    barcode: code,
    novaGroup: p.nova_group && [1, 2, 3, 4].includes(p.nova_group) ? (p.nova_group as 1 | 2 | 3 | 4) : undefined,
  }
  item.id = await db.foodItems.add(item)
  return item
}
