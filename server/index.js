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
    flights: { updatedAt: null, results: [], cheapestByDate: {}, error: null },
  }
}

async function loadState() {
  try {
    state = JSON.parse(await fsp.readFile(STORE, 'utf8'))
    for (const k of Object.keys(emptyState())) {
      if (state[k] === undefined) state[k] = emptyState()[k]
    }
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
function runFlightFetch(payload) {
  return new Promise((resolve, reject) => {
    const py = process.env.FLIGHT_PYTHON
    if (!py) return reject(new Error('FLIGHT_PYTHON no configurado'))
    const script = path.join(ROOT, 'scripts', 'fetch-flights.py')
    if (!fs.existsSync(script)) return reject(new Error('script de vuelos ausente'))
    const child = spawn(py, [script], { cwd: ROOT })
    let out = '', err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('close', code => {
      if (code !== 0) return reject(new Error(err.slice(0, 400) || `exit ${code}`))
      try { resolve(JSON.parse(out)) } catch (e) { reject(new Error('salida no-JSON: ' + out.slice(0, 200))) }
    })
    child.stdin.end(JSON.stringify(payload))
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
// The scheduled monitor POSTs here (shared secret). Results are also what the
// calendar view reads to highlight the cheapest departure dates.
api.post('/flights/push', (req, res) => {
  if (!PUSH_SECRET || req.get('x-push-secret') !== PUSH_SECRET) {
    return res.status(401).json({ error: 'no autorizado' })
  }
  const { results = [], error = null } = req.body || {}
  mutate(s => {
    s.flights = {
      updatedAt: new Date().toISOString(),
      results,
      error,
      cheapestByDate: results.reduce((acc, r) => {
        const cur = acc[r.date]
        if (cur === undefined || r.usd < cur) acc[r.date] = r.usd
        return acc
      }, {}),
    }
  }).then(() => res.json({ ok: true, count: results.length }))
    .catch(e => res.status(500).json({ error: String(e) }))
})

api.post('/flights/refresh', (req, res) => {
  runFlightFetch(req.body || {})
    .then(out => mutate(s => {
      s.flights = {
        updatedAt: new Date().toISOString(),
        results: out.results || [], error: null,
        cheapestByDate: (out.results || []).reduce((acc, r) => {
          const cur = acc[r.date]
          if (cur === undefined || r.usd < cur) acc[r.date] = r.usd
          return acc
        }, {}),
      }
    }))
    .then(() => res.json({ ok: true, ...state.flights }))
    .catch(e => res.status(503).json({ ok: false, error: String(e.message || e) }))
})

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

seedIfEmpty().then(() => {
  app.listen(PORT, () => console.log(`roadtrip-usa escuchando en :${PORT}`))
})
