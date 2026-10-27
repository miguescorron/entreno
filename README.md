# Entreno

App personal de entrenamiento y nutrición que se adapta a tu objetivo: **fuerza y tono, perder peso, carrera a pie (5K a maratón), Hyrox o triatlón 70.3**, a tu nivel, tu material y tu tiempo.

Es una **PWA**: una web que se instala en el iPhone desde Safari y se abre como una app, a pantalla completa y sin conexión. No hay servidor propio: los datos viven en el móvil (IndexedDB) y la IA se llama directamente a la API de Claude con tu clave.

## Stack

| Capa | Tecnología |
|---|---|
| App | Vite + React 19 + TypeScript estricto, React Router (hash) |
| PWA | `vite-plugin-pwa` (manifest + service worker, funciona offline) |
| Datos | IndexedDB con Dexie (migraciones versionadas en `src/db/db.ts`) |
| Animación | Motion (springs interrumpibles, sin rebote por defecto) |
| Validación | zod |
| IA | `@anthropic-ai/sdk` desde el navegador: Sonnet 5.5 para fotos de platos, Haiku 5.5 para texto y etiquetas |
| Código de barras | `barcode-detector` (zxing en WebAssembly, empaquetado para funcionar sin CDN) + Open Food Facts |
| Tests | Vitest + fake-indexeddb |

## Estructura

```
src/
  domain/          lógica pura con tests (sin React)
    dates.ts       fechas de Madrid, semana empieza en lunes, S1 = 50 semanas antes de la carrera
    plan/          generador por objetivo (goalPlans.ts) y el del 70.3 de 51 semanas (generator.ts)
    goals.ts       objetivo del usuario, duración y fases del plan
    exercises.ts   biblioteca de ejercicios con técnica y variantes
    milestones.ts  hitos H0-H6 y carreras preparatorias (triatlón)
    nutrition/     objetivos de kcal/macros, ajuste adaptativo y base de alimentos (spec §10)
    guardrails/    freno de ambición (§8.4) y detección de señales de alarma
    progress/      reglas de hitos, semáforo y proyección
  ai/              cliente de Claude, macros por foto/texto (§9) y coach (§8)
    coach/         prompt, herramientas, bucle con historial solo-añadir y memoria resumida
  db/              esquema Dexie, operaciones del plan, backup JSON
  ui/              sistema de diseño (hojas, botones, barra translúcida, iconos)
  features/        pantallas: onboarding, hoy, plan, registros, progreso, ajustes
```

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests del generador, fechas, base de datos y backup
npm run build      # genera dist/ con el service worker
```

Para probar en el iPhone durante el desarrollo (misma wifi): `npm run dev -- --host` y abre en Safari la IP del Mac que muestra Vite. Sirve para ver la interfaz; la instalación como app necesita HTTPS (ver abajo).

## Instalar en el iPhone

La app está publicada gratis en **GitHub Pages**: https://miguescorron.github.io/entreno/

- En el iPhone, abre esa dirección en **Safari** → botón **Compartir** → **Añadir a pantalla de inicio**.
- Para publicar una versión nueva: `npm run deploy`. Pasa los tests, compila y sube la carpeta `dist/` a la rama `gh-pages`, que es la que sirve GitHub Pages.

Notas:
- En GitHub gratis, Pages exige que el repositorio sea público. El código no contiene datos personales ni claves: el perfil, los registros y la clave de la API se quedan en el móvil.
- Las actualizaciones llegan solas: al abrir la app descarga la versión nueva.

## Coach y coste

- El historial de cada conversación con la API solo crece (nunca se edita): así funciona la caché de prompt y el razonamiento de turnos anteriores sigue siendo válido. Cuando una sesión pasa de 40 mensajes, Haiku la resume y el resumen abre la siguiente.
- Cada mensaje lleva un bloque «Datos de la app» con la fecha, las sesiones de hoy, la comida y las alertas, para que el coach no tenga que preguntar.
- El coach nunca cambia el plan: crea propuestas que aceptas o rechazas en el chat.

## Tus datos

- Todo se guarda en el almacenamiento de la app en el iPhone. iOS no borra los datos de una PWA instalada en la pantalla de inicio, pero **haz copias**: Ajustes → Exportar copia (JSON) → Guardar en Archivos / iCloud Drive.
- La clave de la API de Claude se guarda solo en el dispositivo y **nunca** va en las copias.
- Pon un límite de gasto mensual en [console.anthropic.com](https://console.anthropic.com) → Settings → Limits.

## Limitaciones de la PWA frente a una app nativa

| Función de la spec | En PWA |
|---|---|
| Llavero seguro (`expo-secure-store`) | No existe en web: la clave se guarda en el almacenamiento local de la app, aislado por dominio. |
| Notificaciones locales programadas | iOS no permite programarlas sin servidor de push. La app avisa al abrirla (revisión semanal, días sin pesarte, alertas). Para que suene el móvil: crea en la app Recordatorios de iOS uno diario («Entreno de hoy», 7:00), otro los lunes («Pésate») y otro los domingos a las 20:00 («Revisión semanal»), o una automatización de Atajos que abra la app. |
| HealthKit | No accesible desde web. Alternativa: un Atajo de iOS que exporte peso/entrenos a un JSON que la app importe. |
| Dictado por voz | El micrófono del teclado de iOS funciona en cualquier campo; el reconocimiento de voz web en modo app es poco fiable. |
| Cámara y código de barras | Funcionan (cámara web + lector JS). |

Si alguna de estas limitaciones llega a molestar, la lógica de `src/domain` y `src/db` se puede envolver con Capacitor para generar una app nativa más adelante (eso sí requiere Xcode).

## Estado

- [x] **Fase A**: onboarding, plan de 51 semanas, Hoy, registro de entrenos/no entrenos/check-in/peso, mover y editar sesiones, Ajustes, backup JSON, PWA offline.
- [x] **Fase B**: objetivos diarios de kcal y macros (§10) con ajuste adaptativo semanal, diario por comidas, foto del plato / etiqueta / texto → macros con Claude (JSON validado con zod), código de barras con Open Food Facts, base local de alimentos, favoritos, porciones aprendidas e hidratación.
- [x] **Fase C**: coach con Claude (Sonnet 5.5): chat con streaming, 9 herramientas (registrar entrenos, no entrenos, check-ins y comidas, consultar progreso y plan, proponer cambios, hitos, señal de alarma), tarjetas con deshacer, propuestas que se aceptan o rechazan, memoria resumida por sesiones, caché de prompt, freno de ambición en código (§8.4) con confirmación explícita y aviso fijo ante señales de alarma.
- [x] **Fase D**: gráficos propios en SVG (peso con media de 7 días y objetivo, volumen por deporte en horas/km, carga, sueño y energía) con tooltip y vista de tabla; semáforo semanal (§8.5) e hitos H0-H6 evaluados por reglas con su razón (§6); proyección de peso; pruebas de control y marcas; revisión semanal con Claude cuyos ajustes llegan como propuestas; recordatorios dentro de la app.
- [x] **Ideas de comida**: 3 platos caseros reales (con la receta en la que se basan), rápidos y ajustados a las kcal y macros que quedan para esa comida; filtro en código de alergias por familias (los 14 alérgenos de la UE) y de calorías (±15 %). Modo «solo comida real» (estilo realfooding) que descarta ultraprocesados.
- [x] **Grado de procesado (NOVA)** al escanear códigos de barras, con aviso si es ultraprocesado.
- [x] **Objetivos múltiples**: onboarding por objetivo (fuerza/tono, perder peso, carrera, Hyrox, triatlón), nivel de partida, material (gimnasio, casa con mancuernas o sin material) y minutos por sesión. Planes de duración variable con progresión y descargas.
- [x] **Sesiones detalladas**: cada sesión con calentamiento, parte principal y vuelta a la calma; biblioteca de ~60 ejercicios con técnica paso a paso, claves, errores típicos, versión más fácil/difícil y enlace a vídeo.
- [ ] Fase E: voz, menú semanal y lista de la compra.
- [ ] Fase F: pulido, accesibilidad, backups automáticos.

> Esto no es consejo médico. Antes de empezar, chequeo médico con prueba de esfuerzo.
