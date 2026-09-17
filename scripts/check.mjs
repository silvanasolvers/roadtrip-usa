#!/usr/bin/env node
// Smoke check for the roadtrip board: verifies route data integrity (every leg
// has a distance/duration, ids unique, drive chain consistent), the money math
// (settlement nets to zero), and the API contract against a running server.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
let failures = 0
const ok = (label, cond, extra = '') => {
  if (cond) console.log(`  ✓ ${label}`)
  else { console.log(`  ✗ ${label} ${extra}`); failures++ }
}

// ---------------------------------------------------------------- route data
const src = readFileSync(path.join(ROOT, 'src/data/trip.js'), 'utf8')
const mod = await import(path.join(ROOT, 'src/data/trip.js'))
const { STOPS, PEOPLE, TRIP, CHECKLIST_SEED, PACKING_SEED, WIKI, TARGET_COP } = mod

console.log('\nDatos de la ruta')
ok('11 paradas cargadas', STOPS.length === 11, `(hay ${STOPS.length})`)
ok('8 personas', PEOPLE.length === 8, `(hay ${PEOPLE.length})`)
ok('ids de parada únicos', new Set(STOPS.map(s => s.id)).size === STOPS.length)
ok('ids de persona únicos', new Set(PEOPLE.map(p => p.id)).size === PEOPLE.length)
ok('cada parada tiene coordenadas', STOPS.every(s => Number.isFinite(s.lat) && Number.isFinite(s.lon)))
ok('la primera parada no tiene tramo previo', STOPS[0].driveFromPrev === null)
ok('todas las demás sí lo tienen', STOPS.slice(1).every(s => s.driveFromPrev && s.driveMiles > 0 && s.driveHours > 0))

const sumMiles = STOPS.reduce((s, x) => s + (x.driveMiles || 0), 0)
const sumHours = STOPS.reduce((s, x) => s + (x.driveHours || 0), 0)
ok('distancia sumada coincide con el total declarado', Math.abs(sumMiles - TRIP.totalMiles) <= 12,
  `(suma ${sumMiles} vs total ${TRIP.totalMiles})`)
ok('horas sumadas coinciden', Math.abs(sumHours - TRIP.totalDriveHours) <= 0.6,
  `(suma ${sumHours.toFixed(1)} vs total ${TRIP.totalDriveHours})`)
ok('el encadenado de tramos es coherente', STOPS.every((s, i) => i === 0 || s.driveFromPrev === STOPS[i - 1].name))

console.log('\nContenido crítico verificado contra fuentes')
const allWarn = STOPS.flatMap(s => s.warnings || []).join(' | ')
ok('advierte del shuttle obligatorio en Zion', /solo shuttle/i.test(allWarn))
ok('advierte de la lotería day-before de Angels Landing', /day-before/i.test(allWarn))
ok('advierte que Antelope Canyon exige tour guiado', /tour guiado/i.test(allWarn))
ok('advierte del mínimo de 2 vehículos', /2 veh[ií]culos/i.test(allWarn))
ok('confirma que Yosemite no exige timed-entry', /no exige timed-entry/i.test(allWarn))
ok('advierte del drop-off fee del one-way', /drop-off/i.test(allWarn))

console.log('\nObjetivo de vuelos (open-jaw)')
ok('el objetivo está en COP', TARGET_COP === 2000000, `(${TARGET_COP})`)
// El viaje NO es ida y vuelta: entra por LAS y sale por SFO.
ok('la primera parada es el aeropuerto de llegada (LAS)', /Harry Reid|Las Vegas/i.test(STOPS[0].place))
ok('la última parada es el aeropuerto de salida (SFO)', /SFO|San Francisco International/i.test(STOPS[STOPS.length - 1].place))
ok('llegada y salida son aeropuertos distintos (open-jaw)', STOPS[0].id !== STOPS[STOPS.length - 1].id)

console.log('\nChecklist y packing')
ok('checklist con tareas reales', CHECKLIST_SEED.length >= 20, `(${CHECKLIST_SEED.length})`)
ok('ids de checklist únicos', new Set(CHECKLIST_SEED.map(c => c.id)).size === CHECKLIST_SEED.length)
ok('todas las tareas arrancan sin hacer', CHECKLIST_SEED.every(c => c.done === false))
ok('packing list cargada', PACKING_SEED.length >= 24, `(${PACKING_SEED.length})`)
ok('wiki con secciones', WIKI.length >= 4, `(${WIKI.length})`)

// ------------------------------------------------------------------ money math
console.log('\nCálculo de gastos')
const { computeBalances, settleUp } = await import(path.join(ROOT, 'src/lib/money.js'))

const sample = [
  { id: 'e1', concept: 'Gasolina', amountUsd: 240, paidBy: 'jara', splitAmong: PEOPLE.map(p => p.id) },
  { id: 'e2', concept: 'Hotel Page', amountUsd: 800, paidBy: 'cata', splitAmong: PEOPLE.map(p => p.id) },
  { id: 'e3', concept: 'Tour Antelope (4)', amountUsd: 340, paidBy: 'toro', splitAmong: ['jara', 'cata', 'negro', 'dani'] },
]
const bal = computeBalances(sample, PEOPLE)
const netSum = Object.values(bal.net).reduce((a, b) => a + b, 0)
ok('los saldos netos suman cero', Math.abs(netSum) < 0.011, `(suma ${netSum.toFixed(4)})`)
ok('el total gastado es correcto', bal.total === 1380, `(${bal.total})`)

const transfers = settleUp(bal.net)
const sumTransfers = transfers.reduce((s, t) => s + t.amount, 0)
const sumDebt = Object.values(bal.net).filter(v => v < 0).reduce((s, v) => s + -v, 0)
ok('las transferencias cubren toda la deuda', Math.abs(sumTransfers - sumDebt) < 0.011,
  `(${sumTransfers.toFixed(2)} vs ${sumDebt.toFixed(2)})`)
ok('nadie se paga a sí mismo', transfers.every(t => t.from !== t.to))
ok('quien recibe siempre tiene saldo positivo', transfers.every(t => bal.net[t.to] > 0))
ok('quien paga siempre tiene saldo negativo', transfers.every(t => bal.net[t.from] < 0))
ok('menos transferencias que personas', transfers.length <= PEOPLE.length - 1, `(${transfers.length})`)

// -------------------------------------------------------------------- artifacts
console.log('\nArtefactos de despliegue')
ok('Dockerfile presente (instala Python + fast-flights)', existsSync(path.join(ROOT, 'Dockerfile')))
ok('requirements.txt presente (deps del puente de precios)', existsSync(path.join(ROOT, 'requirements.txt')))
ok('service worker presente', existsSync(path.join(ROOT, 'public/sw.js')))
ok('manifest PWA presente', existsSync(path.join(ROOT, 'public/manifest.webmanifest')))
ok('script de vuelos presente', existsSync(path.join(ROOT, 'scripts/fetch-flights.py')))
const sw = readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8')
ok('el service worker no cachea escrituras', /request\.method !== 'GET'/.test(sw))
ok('el service worker guarda el estado para uso offline', /api\/state/.test(sw))

// Deploy runs from what git tracks, not from the local working tree. A
// too-broad .gitignore entry (e.g. an unanchored `data/` matching `src/data/`)
// silently ships an incomplete tree, and the failure only shows up as an
// opaque build error on the server. Assert every source file is actually
// tracked, and that the ignore rules cannot swallow a source directory.
console.log('\nIntegridad del despliegue (lo que git realmente envía)')
const { execFileSync } = await import('node:child_process')
let tracked = []
try {
  tracked = execFileSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8' })
    .split('\n').map(s => s.trim()).filter(Boolean)
} catch { /* not a repo checkout; skip below */ }

if (tracked.length) {
  // Files the build and runtime genuinely need on the server.
  const mustShip = [
    'src/data/trip.js', 'src/App.jsx', 'src/main.jsx', 'src/styles.css',
    'src/lib/money.js', 'src/lib/store.js',
    'server/index.js', 'index.html', 'vite.config.js',
    'package.json', 'package-lock.json',
  ]
  for (const f of mustShip) {
    ok(`${f} está trackeado por git`, tracked.includes(f))
  }

  // Nothing in src/ may be excluded by .gitignore.
  const onDiskInSrc = []
  const walk = (dir, rel = '') => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(path.join(dir, e.name), r)
      else onDiskInSrc.push(`src/${r}`)
    }
  }
  if (existsSync(path.join(ROOT, 'src'))) walk(path.join(ROOT, 'src'))
  const notTracked = onDiskInSrc.filter(f => !tracked.includes(f))
  ok('ningún archivo de src/ quedó fuera del repo', notTracked.length === 0,
    notTracked.length ? `(fuera: ${notTracked.join(', ')})` : `(${onDiskInSrc.length} archivos)`)

  // The trip data must survive a clean clone, since that is what builds the app.
  ok('trip.js tiene contenido real en el repo', tracked.includes('src/data/trip.js'))

  // Flag an unanchored ignore rule that would match a nested source dir.
  const ig = existsSync(path.join(ROOT, '.gitignore'))
    ? readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split('\n')
      .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    : []
  const risky = ig.filter(r => r === 'data/' || r === 'src/' || r === 'lib/')
  ok('el .gitignore no tiene reglas sin anclar que oculten código fuente',
    risky.length === 0, risky.length ? `(riesgo: ${risky.join(', ')})` : '')
} else {
  console.log('  (sin checkout de git: se omite la verificación de archivos trackeados)')
}

// ------------------------------------------------------------------------- api
if (process.env.CHECK_API) {
  const base = process.env.CHECK_API
  console.log(`\nAPI en ${base}`)
  try {
    const h = await fetch(base + '/health').then(r => r.json())
    ok('/health responde ok', h.ok === true)
    const s = await fetch(base + '/api/state').then(r => r.json())
    ok('/api/state devuelve el checklist sembrado', (s.checklist || []).length >= 20, `(${s.checklist?.length})`)
    ok('/api/state trae estructura de vuelos', !!s.flights && Array.isArray(s.flights.legs))
    const f = await fetch(base + '/api/flights').then(r => r.json())
    ok('/api/flights responde', typeof f === 'object')
    ok('/api/flights expone objetivo en COP', 'target' in f || 'rate' in f)
  } catch (e) {
    ok('la API responde', false, `(${e.message})`)
  }
}

console.log(failures === 0 ? '\nTodo en orden.\n' : `\n${failures} fallo(s).\n`)
process.exit(failures === 0 ? 0 : 1)
