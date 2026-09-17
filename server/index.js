import express from 'express'
import multer from 'multer'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const STORE = path.join(DATA_DIR, 'store.json')
const UPLOADS = path.join(DATA_DIR, 'uploads')
const DIST = path.join(ROOT, 'dist')

const PORT = process.env.PORT || 3000
const PUSH_SECRET = process.env.FLIGHT_PUSH_SECRET || ''

fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(UPLOADS, { recursive: true })

// ---------------------------------------------------------------- state store
let state = null
let writeChain = Promise.resolve()

function emptyState() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    checklist: [],
    expenses: [],
    packing: {},          // { [packingItemId]: { [personId]: true } }
    notes: [],
    driveAssignments: {}, // { [segmentId]: personId }
    docs: [],             // metadata only; files live in data/uploads
    trips: { startDate: null, endDate: null, confirmed: false },
    flights: {
      updatedAt: null, legs: [], combos: [], cheapestCombo: null,
      rate: null, target: null, error: null,
    },
  }
}

// Bring an older store.json forward. Without this, changing a nested shape
// (e.g. flights from {results} to {legs,combos}) leaves the running board
// reading undefined fields and crashing on keys it expects.
function migrate(s) {
  const base = emptyState()
  for (const k of Object.keys(base)) {
    if (s[k] === undefined) s[k] = base[k]
  }

  // flights: flat {results,cheapestByDate} -> open-jaw {legs,combos,...}
  const f = s.flights
  if (f && (f.legs === undefined || f.combos === undefined)) {
    const legacy = Array.isArray(f.results) ? f.results : []
    s.flights = {
      ...base.flights,
      updatedAt: f.updatedAt ?? null,
      // Old results were per-leg one-ways with no leg kind; treat them as
      // outbound so nothing is silently presented as a return fare.
      legs: legacy.map(r => ({ ...r, leg: r.leg || 'out' })),
      error: legacy.length ? null : (f.error ?? null),
    }
  }

  // Older entries may predate the `doneBy`/`doneAt` audit fields.
  for (const c of s.checklist || []) {
    if (c.done === undefined) c.done = false
    if (c.doneBy === undefined) c.doneBy = null
    if (c.doneAt === undefined) c.doneAt = null
  }

  return s
}

async function loadState() {
  try {
    state = migrate(JSON.parse(await fsp.readFile(STORE, 'utf8')))
  } catch {
    state = emptyState()
  }
}

// Serialize every mutation so 8 concurrent users never clobber the file.
function mutate(fn) {
  writeChain = writeChain.then(async () => {
    const result = fn(state)
    state.updatedAt = new Date().toISOString()
    const tmp = STORE + '.tmp'
    await fsp.writeFile(tmp, JSON.stringify(state, null, 2))
    await fsp.rename(tmp, STORE) // atomic replace
    return result
  })
  return writeChain
}

const uid = () => crypto.randomBytes(8).toString('hex')
const app = express()
app.use(express.json({ limit: '2mb' }))

// ------------------------------------------------------------- flight bridge
// Google Flights prices come from a Python bridge (fast-flights). Refreshes are
// normally pushed by a scheduled job; the local endpoint is an optional path.
//
// The `error` listener is mandatory, not defensive: if the interpreter is
// missing, spawn emits an unhandled 'error' event and Node kills the WHOLE
// process — taking the board down because an optional price lookup failed.
// A missing interpreter must degrade to a 503 on one endpoint, nothing more.
function runFlightFetch(payload) {
  return new Promise((resolve, reject) => {
    const py = process.env.FLIGHT_PYTHON
    if (!py) return reject(new Error('FLIGHT_PYTHON no configurado'))
    const script = path.join(ROOT, 'scripts', 'fetch-flights.py')
    if (!fs.existsSync(script)) return reject(new Error('script de vuelos ausente'))

    let child
    try {
      child = spawn(py, [script], { cwd: ROOT })
    } catch (e) {
      return reject(new Error('no se pudo lanzar el intérprete: ' + e.message))
    }

    let out = '', err = '', settled = false
    const done = (fn, v) => { if (!settled) { settled = true; fn(v) } }

    child.on('error', e => done(reject, new Error(
      `no se pudo ejecutar ${py}: ${e.code || e.message}. ` +
      'Instala Python y fast-flights en la imagen (ver Dockerfile), ' +
      'o deja que el monitor empuje precios vía /api/flights/push.')))

    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })

    child.on('close', code => {
      if (code !== 0) return done(reject, new Error(err.slice(0, 400) || `exit ${code}`))
      try { done(resolve, JSON.parse(out)) }
      catch { done(reject, new Error('salida no-JSON: ' + out.slice(0, 200))) }
    })

    try { child.stdin.end(JSON.stringify(payload)) }
    catch (e) { done(reject, new Error('no se pudo enviar el payload: ' + e.message)) }
  })
}

// ------------------------------------------------------------------- read API
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

app.get('/api/state', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json(state)
})

app.get('/api/flights', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json(state.flights)
})

// ------------------------------------------------------------------ write API
const api = express.Router()

api.post('/checklist/add', (req, res) => {
  const { label, category = 'Varios', owner = null } = req.body || {}
  if (!label || !String(label).trim()) return res.status(400).json({ error: 'label requerido' })
  mutate(s => {
    s.checklist.push({
      id: uid(), label: String(label).trim(), category,
      owner, done: false, createdBy: req.body?.by || null, ts: new Date().toISOString(),
    })
  }).then(() => res.json({ ok: true })).catch(e => res.status(500).json({ error: String(e) }))
})

api.post('/checklist/update', (req, res) => {
  const { id } = req.body || {}
  mutate(s => {
    const it = s.checklist.find(x => x.id === id)
    if (!it) return
    for (const f of ['label', 'category', 'owner']) {
      if (req.body[f] !== undefined) it[f] = req.body[f]
    }
    if (req.body.done !== undefined) {
      it.done = !!req.body.done
      it.doneBy = it.done ? (req.body.by || null) : null
      it.doneAt = it.done ? new Date().toISOString() : null
    }
  }).then(() => res.json({ ok: true })).catch(e => res.status(500).json({ error: String(e) }))
})

api.post('/checklist/remove', (req, res) => {
  const { id } = req.body || {}
  mutate(s => { s.checklist = s.checklist.filter(x => x.id !== id) })
    .then(() => res.json({ ok: true })).catch(e => res.status(500).json({ error: String(e) }))
})

api.post('/expenses/add', (req, res) => {
  const { concept, amountUsd, paidBy, splitAmong } = req.body || {}
  const amt = Number(amountUsd)
  if (!concept || !String(concept).trim()) return res.status(400).json({ error: 'concepto requerido' })
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'monto inválido' })
  if (!paidBy) return res.status(400).json({ error: 'quién pagó es requerido' })
  const among = Array.isArray(splitAmong) && splitAmong.length ? splitAmong : []
  if (!among.length) return res.status(400).json({ error: 'a quiénes se divide es requerido' })
  mutate(s => {
    s.expenses.push({
      id: uid(), concept: String(concept).trim(), amountUsd: Math.round(amt * 100) / 100,
      paidBy, splitAmong: among, category: req.body.category || 'Varios',
      stopId: req.body.stopId || null, date: req.body.date || new Date().toISOString().slice(0, 10),
      ts: new Date().toISOString(),
    })
  }).then(() => res.json({ ok: true })).catch(e => res.status(500).json({ error: String(e) }))
})

api.post('/expenses/remove', (req, res) => {
  const { id } = req.body || {}
  mutate(s => { s.expenses = s.expenses.filter(x => x.id !== id) })
    .then(() => res.json({ ok: true })).catch(e => res.status(500).json({ error: String(e) }))
})

api.post('/packing/toggle', (req, res) => {
  const { itemId, personId } = req.body || {}
  if (!itemId || !personId) return res.status(400).json({ error: 'itemId y personId requeridos' })
  mutate(s => {
    if (!s.packing[itemId]) s.packing[itemId] = {}
    if (s.packing[itemId][personId]) delete s.packing[itemId][personId]
    else s.packing[itemId][personId] = new Date().toISOString()
  }).then(() => res.json({ ok: true })).catch(e => res.status(500).json({ error: String(e) }))
})

api.post('/notes/add', (req, res) => {
  const { stopId, text, author } = req.body || {}
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'texto requerido' })
  mutate(s => {
    s.notes.push({
      id: uid(), stopId: stopId || 'general', text: String(text).trim().slice(0, 2000),
      author: author || 'anónimo', ts: new Date().toISOString(),
    })
  }).then(() => res.json({ ok: true })).catch(e => res.status(500).json({ error: String(e) }))
})

api.post('/notes/remove', (req, res) => {
  const { id } = req.body || {}
  mutate(s => { s.notes = s.notes.filter(x => x.id !== id) })
    .then(() => res.json({ ok: true })).catch(e => res.status(500).json({ error: String(e) }))
})

api.post('/drive/assign', (req, res) => {
  const { segmentId, personId } = req.body || {}
  if (!segmentId) return res.status(400).json({ error: 'segmentId requerido' })
  mutate(s => {
    if (!personId) delete s.driveAssignments[segmentId]
    else s.driveAssignments[segmentId] = personId
  }).then(() => res.json({ ok: true })).catch(e => res.status(500).json({ error: String(e) }))
})

api.post('/trips/dates', (req, res) => {
  const { startDate, endDate, confirmed } = req.body || {}
  mutate(s => {
    s.trips = {
      startDate: startDate || null,
      endDate: endDate || null,
      confirmed: !!confirmed,
    }
  }).then(() => res.json({ ok: true })).catch(e => res.status(500).json({ error: String(e) }))
})

// ---------------------------------------------------------------- documents
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_').slice(-80)
    cb(null, `${Date.now()}-${uid().slice(0, 6)}-${safe}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /pdf|image\/(png|jpe?g|webp|heic)|text\/plain/.test(file.mimetype)
    cb(ok ? null : new Error('tipo de archivo no permitido'), ok)
  },
})

api.post('/docs/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'archivo requerido' })
  mutate(s => {
    s.docs.push({
      id: uid(), name: req.body?.name || req.file.originalname,
      stopId: req.body?.stopId || 'general', stored: req.file.filename,
      size: req.file.size, mime: req.file.mimetype,
      uploadedBy: req.body?.by || 'anónimo', ts: new Date().toISOString(),
    })
  }).then(() => res.json({ ok: true })).catch(e => res.status(500).json({ error: String(e) }))
})

api.post('/docs/remove', (req, res) => {
  const { id } = req.body || {}
  mutate(async s => {
    const d = s.docs.find(x => x.id === id)
    if (d) {
      try { await fsp.unlink(path.join(UPLOADS, d.stored)) } catch {}
      s.docs = s.docs.filter(x => x.id !== id)
    }
  }).then(() => res.json({ ok: true })).catch(e => res.status(500).json({ error: String(e) }))
})

// ------------------------------------------------------------ flight results
// Shape note: the trip is an open-jaw (arrive LAS, depart SFO), so results are
// per-leg plus combined outbound+return combos. See scripts/fetch-flights.py
// for why multi-city is priced as two one-ways.
const EMPTY_FLIGHTS = {
  updatedAt: null, legs: [], combos: [], cheapestCombo: null,
  rate: null, target: null, error: null,
}

// The scheduled monitor POSTs here (shared secret). Results are also what the
// Flights view reads to show per-date fares and whether the COP target is met.
api.post('/flights/push', (req, res) => {
  if (!PUSH_SECRET || req.get('x-push-secret') !== PUSH_SECRET) {
    return res.status(401).json({ error: 'no autorizado' })
  }
  const d = req.body || {}
  mutate(s => {
    s.flights = {
      updatedAt: new Date().toISOString(),
      legs: d.legs || [],
      combos: d.combos || [],
      cheapestCombo: d.cheapestCombo || null,
      rate: d.rate || null,
      target: d.target || null,
      error: d.error || null,
    }
  }).then(() => res.json({ ok: true, legs: (d.legs || []).length, combos: (d.combos || []).length }))
    .catch(e => res.status(500).json({ error: String(e) }))
})

api.post('/flights/refresh', (req, res) => {
  runFlightFetch(req.body || {})
    .then(out => mutate(s => {
      s.flights = {
        updatedAt: new Date().toISOString(),
        legs: out.legs || [],
        combos: out.combos || [],
        cheapestCombo: out.cheapestCombo || null,
        rate: out.rate || null,
        target: out.target || null,
        error: (out.errors || []).length ? out.errors.join(' · ') : null,
      }
    }))
    .then(() => res.json({ ok: true, ...state.flights }))
    .catch(e => res.status(503).json({ ok: false, error: String(e.message || e) }))
})

// Automatic refresh so the board has current fares even when nobody opens it,
// which is the point of a price watch: the numbers should already be fresh when
// someone checks. Runs on startup and every FLIGHT_REFRESH_HOURS (default 12).
// Failure is logged, never fatal — the board keeps serving the last good prices.
//
// The date grid is COMPUTED, never hardcoded. Google Flights only quotes about
// 11 months out, so for a 2027 trip most of the window is not bookable yet.
// Asking anyway returns FlightsNotFound and paints a pointless red error on the
// board. The grid grows by itself as the departure window enters the horizon.
async function refreshRoutes() {
  const { TRIP, bookingDateGrid, daysUntil } = await import(path.join(ROOT, 'src/data/trip.js'))
  const outDates = bookingDateGrid(7)
  // Returns are generated by adding the trip length to each outbound date, so
  // every combination is a real ~15 day trip instead of an arbitrary pairing.
  const len = TRIP.durationDays || 15
  const retDates = [...new Set(outDates.map(d => {
    const x = new Date(`${d}T00:00:00Z`)
    x.setUTCDate(x.getUTCDate() + len)
    return x.toISOString().slice(0, 10)
  }))]
  return {
    outbound: { from: 'BOG', to: 'LAS', dates: outDates },
    returns: { from: 'SFO', to: 'BOG', dates: retDates },
    adults: 1,
    targetCop: Number(process.env.FLIGHT_TARGET_COP) || TRIP.targetCop || 2000000,
    minTripDays: len,
    maxTripDays: len,
    tripYear: TRIP.year,
    daysUntilTrip: daysUntil(TRIP.dateWindow.from),
  }
}

async function autoRefreshFlights(reason) {
  if (!process.env.FLIGHT_PYTHON) {
    console.log('[flights] sin FLIGHT_PYTHON: se omiten las consultas automáticas')
    return
  }
  try {
    const routes = await refreshRoutes()
    if (!routes.outbound.dates.length) {
      console.log('[flights] el viaje aún está fuera del horizonte de reserva '
        + `(~11 meses). Faltan ${routes.daysUntilTrip} días; se reintenta luego.`)
      return
    }
    console.log(`[flights] consultando precios (${reason}): `
      + `${routes.outbound.dates.length} salidas × ${routes.returns.dates.length} regresos`)
    const out = await runFlightFetch(routes)
    await mutate(s => {
      s.flights = {
        updatedAt: new Date().toISOString(),
        legs: out.legs || [],
        combos: out.combos || [],
        cheapestCombo: out.cheapestCombo || null,
        rate: out.rate || null,
        target: out.target || null,
        tripYear: routes.tripYear,
        daysUntilTrip: routes.daysUntilTrip,
        error: (out.errors || []).length ? out.errors.join(' · ') : null,
      }
    })
    const best = state.flights.cheapestCombo
    console.log(`[flights] ${(out.legs || []).length} tramos, ${(out.combos || []).length} combos`
      + (best ? `, mejor $${best.usd} (${best.outDate}→${best.retDate})` : '')
      + (state.flights.target?.met ? ' — OBJETIVO ALCANZADO' : ''))
  } catch (e) {
    // Keep the previous good numbers rather than wiping them with an error.
    console.error('[flights] fallo la consulta:', String(e.message || e))
  }
}

app.use('/api', api)

app.get('/files/:stored', (req, res) => {
  const d = state.docs.find(x => x.stored === req.params.stored)
  if (!d) return res.status(404).end()
  res.sendFile(path.join(UPLOADS, d.stored))
})

// Multer and body-parser failures must come back as JSON, not an HTML stack
// trace, so the client can show a real message.
app.use((err, _req, res, next) => {
  if (!err) return next()
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
  res.status(status).json({ error: err.message || 'error de subida' })
})

app.use('/data', express.static(DATA_DIR, { setHeaders: r => r.set('Cache-Control', 'no-store') }))
app.use(express.static(DIST, { maxAge: '1h' }))

// SPA fallback — must stay last so /api and /files keep working.
app.get(/^\/(?!api|files|data).*/, (_req, res) => {
  const idx = path.join(DIST, 'index.html')
  if (fs.existsSync(idx)) res.sendFile(idx)
  else res.status(503).send('build no encontrado')
})

// Seed the checklist once, from the canonical route data, so the group starts
// with something real instead of an empty board.
async function seedIfEmpty() {
  await loadState()
  if (state.checklist.length === 0) {
    const { CHECKLIST_SEED } = await import(path.join(ROOT, 'src/data/trip.js')).catch(() => ({ CHECKLIST_SEED: [] }))
    if (CHECKLIST_SEED?.length) {
      await mutate(s => {
        s.checklist = CHECKLIST_SEED.map(c => ({
          ...c, createdBy: 'silvana', ts: new Date().toISOString(),
          doneBy: null, doneAt: null,
        }))
      })
      console.log(`[seed] ${CHECKLIST_SEED.length} items de checklist`)
    }
  }
}

// Last-resort net: an unexpected throw anywhere (a stray unhandled rejection,
// a broken optional integration) must never take the board offline for eight
// people mid-trip. Log it and keep serving.
process.on('unhandledRejection', e => {
  console.error('[unhandledRejection]', e?.message || e)
})
process.on('uncaughtException', e => {
  console.error('[uncaughtException]', e?.stack || e?.message || e)
})

seedIfEmpty().then(() => {
  app.listen(PORT, () => console.log(`roadtrip-usa escuchando en :${PORT}`))

  // Refresh fares shortly after boot, then on an interval. Delayed a little so
  // startup and the first health checks are not blocked by a network call.
  const hours = Number(process.env.FLIGHT_REFRESH_HOURS) || 12
  setTimeout(() => autoRefreshFlights('arranque'), 20000).unref?.()
  setInterval(() => autoRefreshFlights('programada'), hours * 3600 * 1000).unref?.()
})
