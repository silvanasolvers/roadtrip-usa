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
const { STOPS, PEOPLE, TRIP, CHECKLIST_SEED, PACKING_SEED, WIKI, TARGET_COP,
        bookingDateGrid, lastBookableDate, bookingPlan, bookingTimeline } = mod

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

// El viaje es de 15 días en 2027. Si la duración o el año se desincronizan, el
// tracker pide fechas equivocadas y el tablero muestra combinaciones absurdas.
ok('la duración del viaje es 15 días', TRIP.durationDays === 15, `(${TRIP.durationDays})`)
ok('el año del viaje es 2027', TRIP.year === 2027, `(${TRIP.year})`)
ok('la ventana de fechas es de 2027', TRIP.dateWindow.from.startsWith('2027-') && TRIP.dateWindow.to.startsWith('2027-'))

// Google Flights solo cotiza ~11 meses adelante. Pedir fechas más lejanas
// devuelve FlightsNotFound y un error rojo inútil. El grid debe calcularse solo.
{
  const today = new Date()
  const limit = lastBookableDate(today)
  const addDaysStr = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000)
    .toISOString().slice(0, 10)
  const grid = bookingDateGrid(1, today)
  ok('el grid respeta el horizonte de reserva (~11 meses)',
    grid.every(d => d <= limit), `(horizonte ${limit}, ${grid.length} fechas)`)
  ok('el grid solo contiene fechas futuras', grid.every(d => d > today.toISOString().slice(0, 10)))

  // BUG REAL: cotizar una ida cuyo regreso (+15 días) todavía no está en el
  // horizonte devuelve la ida pero no el regreso — cero combinaciones y un error
  // rojo en el tablero. El grid debe exigir que el viaje COMPLETO quepa.
  const lenCheck = TRIP.durationDays
  const returnsOutside = grid.filter(d => {
    const ret = new Date(new Date(`${d}T00:00:00Z`).getTime() + lenCheck * 86400000)
      .toISOString().slice(0, 10)
    return ret > limit
  })
  ok('ninguna ida del grid deja su regreso fuera del horizonte', returnsOutside.length === 0,
    returnsOutside.length ? `(idas sin regreso cotizable: ${returnsOutside.join(', ')})` : '')

  // Los regresos deben salir exactamente 15 días después de cada ida.
  const len = TRIP.durationDays
  const rets = [...new Set(grid.map(d => {
    const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + len)
    return x.toISOString().slice(0, 10)
  }))]
  const bad = rets.filter((r, i) => {
    const o = grid[i]
    if (!o) return false
    return Math.round((new Date(`${r}T00:00:00Z`) - new Date(`${o}T00:00:00Z`)) / 86400000) !== len
  })
  ok('cada regreso cae exactamente 15 días después de su ida', bad.length === 0,
    bad.length ? `(mal: ${bad.join(', ')})` : `(${rets.length} regresos)`)

  const pySrc = readFileSync(path.join(ROOT, 'scripts/fetch-flights.py'), 'utf8')
  ok('el script de vuelos filtra fechas ya pasadas', /bookable\(|>\s*today/.test(pySrc))
  ok('el script exige una duración mínima de viaje', /minTripDays/.test(pySrc))

  // EL PLAN: el tablero debe mostrar qué fechas ya se consultan y cuándo se
  // activan las demás — el horizonte acoplándose solo, no un simple "todavía no".
  const tl = bookingTimeline(today)
  const planAll = bookingPlan(1, today)
  ok('el plan cubre todas las salidas de la ventana del viaje',
    planAll.length === tl.totalDates && tl.totalDates > 30, `(${tl.totalDates} fechas)`)
  ok('el plan marca activas + pendientes = total',
    tl.activeDates + tl.pendingDates === tl.totalDates)
  ok('el plan dice cuándo aparece el primer precio',
    typeof tl.firstFaresOn === 'string' && Number.isFinite(tl.daysToFirstFares),
    `(el ${tl.firstFaresOn}, en ${tl.daysToFirstFares} días)`)
  ok('hay una primera salida y su regreso a 15 días',
    tl.firstReturn === addDaysStr(tl.firstOutbound, TRIP.durationDays),
    `(${tl.firstOutbound} -> ${tl.firstReturn})`)
  // El acoplamiento mes a mes debe ser monótono y terminar en el total.
  const sched = tl.schedule
  ok('el acoplamiento mes a mes es monótono',
    sched.every((s, i) => i === 0 || s.cumulative >= sched[i - 1].cumulative))
  ok('el acoplamiento termina cubriendo todas las fechas',
    sched.length > 0 && sched[sched.length - 1].cumulative === tl.totalDates,
    `(termina en ${sched[sched.length - 1]?.cumulative}/${tl.totalDates} para ${tl.fullyBookableFrom})`)
  // Una fecha no puede estar activa si su regreso cae fuera del horizonte.
  const wronglyActive = planAll.filter(f => f.active && f.ret > limit)
  ok('ninguna fecha marcada activa tiene el regreso fuera del horizonte',
    wronglyActive.length === 0, wronglyActive.length ? `(${wronglyActive.map(f => f.dep).join(', ')})` : '')

  // Ninguna fecha de 2026 debe sobrevivir en los datos del viaje.
  const srcAll = readFileSync(path.join(ROOT, 'src/data/trip.js'), 'utf8')
    + readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8')
  const stale = [...srcAll.matchAll(/'(2026-\d\d-\d\d)'/g)].map(m => m[1])
  ok('no quedan fechas de 2026 que pedir a Google Flights', stale.length === 0,
    stale.length ? `(quedan: ${stale.join(', ')})` : '')
}

// Una fecha ya pasada devuelve FlightsNotFound y pinta un error rojo inútil en
// el tablero. El script filtra, y el tablero ya no contiene fechas fijas: las
// calcula con bookingDateGrid según el horizonte de reserva.
{
  const appSrc = readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8')
  ok('el tablero calcula las fechas en vez de tenerlas fijas',
    /bookingDateGrid\(/.test(appSrc) && !/const REFRESH = \{/.test(appSrc))
  ok('el tablero envía la duración del viaje al consultar',
    /minTripDays: len/.test(appSrc) || /minTripDays/.test(appSrc))
}

console.log('\nHospedaje (búsqueda Booking / Airbnb)')
{
  const S = await import(path.join(ROOT, 'src/lib/stays.js'))
  const { stayDates, tripNights, stayLinks, bookingCalendar, calendarStatus,
          departureRange, DEFAULT_DEPARTURE, BOOKING_WINDOWS } = S
  const plusDays = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000)
    .toISOString().slice(0, 10)

  const dated = stayDates(DEFAULT_DEPARTURE)
  const lodging = dated.filter(d => d.nights > 0)
  const withNights = STOPS.filter(s => s.nights > 0)

  // El hospedaje se encadena desde la salida: cada check-in es el check-out
  // del tramo anterior, y las paradas de paso no reciben alojamiento.
  ok('cada parada con noches tiene su tramo', lodging.length === withNights.length,
    `(${lodging.length}/${withNights.length})`)
  ok('las paradas de paso no reciben alojamiento',
    dated.filter(d => !d.nights).every(d => d.checkOut === null))
  ok('el encadenado de noches es continuo',
    lodging.every((d, i) => i === 0 || d.checkIn === lodging[i - 1].checkOut))
  const routeNights = STOPS.reduce((n, s) => n + (s.nights || 0), 0)
  const totals = tripNights(DEFAULT_DEPARTURE)
  ok('el total de noches coincide con la ruta', totals.totalNights === routeNights,
    `(${totals.totalNights} vs ${routeNights})`)
  ok('la última salida cae dentro de la ventana del viaje', totals.lastCheckOut <= TRIP.dateWindow.to)

  // Las fechas se calculan: mover la salida corre todos los tramos en bloque.
  const shift = 7
  const moved = stayDates(plusDays(DEFAULT_DEPARTURE, shift)).filter(d => d.nights > 0)
  ok('mover la salida corre todas las fechas',
    moved.every((d, i) => d.checkIn === plusDays(lodging[i].checkIn, shift)))

  // Enlaces: fechas exactas y ocupación real; sin marcadores vacíos.
  const all = lodging.map(d => ({ d, l: stayLinks(d.stopId, d.checkIn, d.checkOut) }))
  ok('cada parada genera enlaces de Booking y Airbnb',
    all.every(({ l }) => l.booking && l.airbnb))
  ok('ningún enlace queda con undefined',
    all.every(({ l }) => !/undefined|null/.test(l.booking) && !/undefined|null/.test(l.airbnb)))
  ok('las fechas de los enlaces van en ISO',
    all.every(({ d, l }) => l.booking.includes(`checkin=${d.checkIn}`)
      && l.airbnb.includes(`checkin=${d.checkIn}`) && l.airbnb.includes(`checkout=${d.checkOut}`)))
  ok('Airbnb lleva 8 huéspedes y casa completa de 4+ recámaras',
    all.every(({ l }) => /adults=8/.test(l.airbnb) && /min_bedrooms=4/.test(l.airbnb) && /room_types/.test(l.airbnb)))
  ok('Booking lleva 8 adultos en 4 habitaciones',
    all.every(({ l }) => /group_adults=8/.test(l.booking) && /no_rooms=4/.test(l.booking)))

  // Ventanas de reserva de los lodges de parque: se calculan desde el check-in
  // de cada tramo, nunca se escriben a mano.
  const cal = bookingCalendar(DEFAULT_DEPARTURE)
  ok('el calendario cubre las ventanas declaradas', cal.length === BOOKING_WINDOWS.length,
    `(${cal.length} de ${BOOKING_WINDOWS.length})`)
  ok('cada ventana abre antes de su check-in', cal.every(i => i.opensOn < i.checkIn))
  ok('cada ventana respeta su número de días',
    cal.every(i => i.opensOn === plusDays(i.checkIn, -i.days)))
  ok('las ventanas salen ordenadas por apertura',
    cal.every((i, k) => k === 0 || i.opensOn >= cal[k - 1].opensOn))
  const st = calendarStatus(DEFAULT_DEPARTURE)
  ok('el resumen cuenta las abiertas contra hoy',
    st.openNow === st.items.filter(i => i.opensOn <= st.today).length)
  ok('la próxima ventana, si existe, es futura',
    !st.next || st.next.opensOn > st.today)

  // Rango de salida para el selector de fecha de la vista.
  const range = departureRange()
  ok('el rango de salida respeta la ventana del viaje',
    range.min === TRIP.dateWindow.from && range.max <= TRIP.dateWindow.to
      && plusDays(range.max, totals.totalNights) <= TRIP.dateWindow.to,
    `(${range.min} → ${range.max})`)

  // La pestaña debe estar cableada: vista, nav e icono.
  const appSrc2 = readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8')
  ok('la pestaña Hospedaje está en la navegación', /id: 'stays', label: 'Hospedaje', ic: 'bed'/.test(appSrc2))
  ok('la vista Stays está conectada', /tab === 'stays' && <Stays/.test(appSrc2))
}

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

// Docker only sees files a COPY put in the stage before they are used. A RUN
// that reads a file copied further down fails the build with "Could not open
// requirements file" — a fast, opaque failure. Catch the ordering here.
if (existsSync(path.join(ROOT, 'Dockerfile'))) {
  const df = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8').split('\n')
  const copiedIn = new Set()
  const orderErrors = []
  df.forEach((ln, i) => {
    const s = ln.trim()
    const cp = s.match(/^COPY\s+(.+?)\s+\S+\s*$/i)
    if (cp && !cp[1].includes('--from=')) {
      for (const tok of cp[1].split(/\s+/)) copiedIn.add(tok.replace(/^\.?\//, ''))
      return
    }
    const rn = s.match(/^RUN\s+(.*)$/i)
    if (rn) {
      for (const ref of rn[1].matchAll(/-r\s+(\S+)/g)) {
        const base = ref[1].replace(/^\.?\//, '')
        if (!copiedIn.has(base)) orderErrors.push(`L${i + 1}: RUN usa ${ref[1]} sin COPY previo`)
      }
    }
  })
  ok('el Dockerfile copia los archivos antes de usarlos en un RUN',
    orderErrors.length === 0, orderErrors.join(' | '))
}

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

    // An optional integration (the Python price bridge) must never be able to
    // take the board down. If the interpreter is missing, this endpoint has to
    // fail on its own while /health and /api/state keep answering.
    try {
      const rr = await fetch(base + '/api/flights/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outbound: { from: 'BOG', to: 'LAS', dates: ['2026-10-14'] } }),
      })
      const rb = await rr.text()
      // Either it works, or it degrades cleanly — never a crash.
      ok('la consulta de precios no tumba el servidor',
        rr.status === 200 || rr.status === 503, `(HTTP ${rr.status})`)
      if (rr.status === 503) {
        const h2 = await fetch(base + '/health').then(r => r.json()).catch(() => null)
        ok('el servidor sigue vivo tras fallar la consulta de precios', h2?.ok === true)
        const s2 = await fetch(base + '/api/state').then(r => r.json()).catch(() => null)
        ok('el tablero sigue sirviendo tras fallar la consulta de precios',
          (s2?.checklist || []).length >= 20)
        if (!/FLIGHT_PYTHON|python|fast-flights/i.test(rb)) {
          ok('el error explica cómo habilitar la consulta', false, `(${rb.slice(0, 90)})`)
        } else {
          ok('el error explica cómo habilitar la consulta', true)
        }
      }
    } catch (e) {
      ok('la consulta de precios no tumba el servidor', false, `(${e.message})`)
    }
  } catch (e) {
    ok('la API responde', false, `(${e.message})`)
  }
}

console.log('\nSistema visual')
{
  const appSrcAll = readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8')
  const cssSrc = readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8')

  // Una sola familia de iconos. Mezclar emoji a color con símbolos unicode se
  // ve improvisado y se renderiza distinto en cada plataforma.
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu
  // U+2713 (✓) se excluye a propósito: es válido como marca de estado dentro
  // de un checkbox. El resto de pictogramas a color no lo son.
  const emojiHits = [...appSrcAll.matchAll(EMOJI)].map(m => m[0]).filter(c => c !== '\u2713')
  ok('la interfaz no usa emoji como iconografía', emojiHits.length === 0,
    emojiHits.length ? `(quedan: ${[...new Set(emojiHits)].join(' ')})` : '')

  // Un check tipográfico DENTRO de un control (la marca del checkbox) es
  // correcto y más nítido que un SVG. Como texto decorativo, no.
  // '✓' solo es la marca de un checkbox (válido). '✓ algo' es decoración.
  const decorativeChecks = [...appSrcAll.matchAll(/'✓[^']+'/g)].map(m => m[0])
  ok('el check tipográfico solo vive dentro de controles', decorativeChecks.length === 0,
    decorativeChecks.length ? `(decorativos: ${[...new Set(decorativeChecks)].join(' ')})` : '')

  // Símbolos geométricos usados antes como iconos de la barra inferior.
  const GLYPH = /◎|≡|⌖|☑/
  ok('no quedan símbolos unicode sueltos como iconos', !GLYPH.test(appSrcAll))

  ok('existe la familia de iconos SVG',
    existsSync(path.join(ROOT, 'src/lib/icons.jsx')))
  if (existsSync(path.join(ROOT, 'src/lib/icons.jsx'))) {
    const ic = readFileSync(path.join(ROOT, 'src/lib/icons.jsx'), 'utf8')
    // Todos los iconos comparten viewBox y heredan color, que es lo que los hace
    // verse como un sistema y no como piezas sueltas.
    ok('los iconos comparten viewBox 24 y currentColor',
      /viewBox="0 0 24 24"/.test(ic) && /stroke="currentColor"/.test(ic))
    // Cada pestaña debe apuntar a un icono existente, o el tab sale sin icono.
    const tabIcons = [...appSrcAll.matchAll(/\{ id: '(\w+)', label: '[^']+', ic: '(\w+)' \}/g)]
    const defined = new Set([...ic.matchAll(/^  (\w+):/gm)].map(m => m[1]))
    const missing = tabIcons.filter(([, , name]) => !defined.has(name)).map(([, , n]) => n)
    ok('todas las pestañas usan un icono definido', missing.length === 0,
      missing.length ? `(faltan: ${missing.join(', ')})` : `(${tabIcons.length} pestañas)`)
  }

  // El color debe tener intención: un solo acento primario declarado.
  ok('el sistema declara tokens de color',
    /--accent:/.test(cssSrc) && /--ink:/.test(cssSrc) && /--paper:/.test(cssSrc))
  // Un solo acento cromático fuerte; el resto son semánticos.
  ok('el acento es un único color declarado', (cssSrc.match(/--accent:/g) || []).length === 1)
  // Las fotos son contenido real y se sirven del propio servidor (offline).
  const photosDir = path.join(ROOT, 'public/photos')
  const photoFiles = existsSync(photosDir) ? readdirSync(photosDir).filter(f => f.endsWith('.jpg')) : []
  ok('hay fotos reales de los sitios', photoFiles.length >= 6, `(${photoFiles.length} fotos)`)
  ok('las fotos se sirven local, no desde un CDN externo',
    /PHOTOS/.test(readFileSync(path.join(ROOT, 'src/data/trip.js'), 'utf8'))
    && !/https?:\/\/[^']*\.(jpg|jpeg|png)/.test(appSrcAll))
  // Tipografía propia alojada aquí: sin señal, una webfont remota no carga.
  const fontsDir = path.join(ROOT, 'public/fonts')
  ok('las fuentes se sirven desde el propio servidor',
    existsSync(fontsDir) && readdirSync(fontsDir).some(f => f.endsWith('.woff2')))
  ok('respeta prefers-reduced-motion',
    /prefers-reduced-motion/.test(cssSrc))
}

console.log('\nCache y despliegue')
{
  const srv = readFileSync(path.join(ROOT, 'server/index.js'), 'utf8')
  const sw = readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8')

  // Un deploy solo se ve si el HTML y el service worker no se cachean. Con un
  // max-age global el navegador seguía sirviendo el shell viejo — que apunta al
  // JS viejo — y el rediseño quedaba invisible.
  ok('el shell (index.html) no se cachea',
    /no-cache/.test(srv) && /index\.html/.test(srv))
  ok('index.html y sw.js se sirven sin caché',
    /sw\.js/.test(srv) && /no-cache/.test(srv))
  // Los assets llevan hash del build: ahí sí conviene cache largo.
  ok('los assets con hash se cachean como inmutables',
    /immutable/.test(srv) && /index-\[A-Za-z0-9_-\]/.test(srv))
  // El fallback SPA también sirve el shell, así que también debe ir sin caché.
  const fallback = srv.slice(srv.indexOf('SPA fallback'))
  ok('el fallback SPA aplica la misma regla', /no-cache/.test(fallback))

  // El service worker no debe quedarse pegado al build anterior.
  ok('el service worker versiona su caché', /roadtrip-usa-v\d/.test(sw))
  ok('el service worker no sirve el HTML viejo primero',
    /network first/i.test(sw) || /network-first/.test(sw))
}

console.log(failures === 0 ? '\nTodo en orden.\n' : `\n${failures} fallo(s).\n`)
process.exit(failures === 0 ? 0 : 1)
