import { useState, useEffect, useCallback, useRef } from 'react'
import { PEOPLE, TRIP, STOPS, PACKING_SEED, CATEGORIES, WIKI, TARGET_COP } from './data/trip.js'
import { useTripState, uploadDoc } from './lib/store.js'
import { computeBalances, settleUp, usd, km, hm } from './lib/money.js'

// ---------------------------------------------------------------- primitives
const byId = id => PEOPLE.find(p => p.id === id)
const nameOf = id => byId(id)?.name || '—'

function Avatar({ id, size = 25 }) {
  const p = byId(id)
  if (!p) return null
  return (
    <span className="avatar" style={{ background: p.color, width: size, height: size, fontSize: size * .4 }}>
      {p.initials}
    </span>
  )
}

function PersonPicker({ value, onChange, multi = false, allowAll = true }) {
  const list = multi ? (value || []) : null
  return (
    <div className="pgrid">
      {multi && allowAll && (
        <button
          type="button"
          className={'pbtn' + (list.length === PEOPLE.length ? ' on' : '')}
          onClick={() => onChange(list.length === PEOPLE.length ? [] : PEOPLE.map(p => p.id))}
        >Todos</button>
      )}
      {PEOPLE.map(p => {
        const on = multi ? list.includes(p.id) : value === p.id
        return (
          <button
            key={p.id}
            type="button"
            className={'pbtn' + (on ? ' on' : '')}
            onClick={() => multi
              ? onChange(on ? list.filter(x => x !== p.id) : [...list, p.id])
              : onChange(on ? '' : p.id)}
          >
            <Avatar id={p.id} size={19} />{p.name}
          </button>
        )
      })}
    </div>
  )
}

function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3 style={{ fontSize: 16 }}>{title}</h3>
          <button className="btn btn-sm" onClick={onClose}>Cerrar</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ overview
function Overview({ state, go }) {
  const cl = state.checklist
  const done = cl.filter(c => c.done).length
  const pct = cl.length ? Math.round(done / cl.length * 100) : 0
  const bal = computeBalances(state.expenses, PEOPLE)

  const packingTotal = PACKING_SEED.filter(p => p.everyone).length * PEOPLE.length
  const packingDone = Object.values(state.packing).reduce((s, m) => s + Object.keys(m).length, 0)

  const dates = state.trips
  const dateLabel = dates?.startDate
    ? `${dates.startDate}${dates.endDate ? ' → ' + dates.endDate : ''}${dates.confirmed ? '' : ' (tentativo)'}`
    : 'Por definir — esperando buenos precios'

  const pending = state.checklist.filter(c => !c.done)

  return (
    <>
      <div className="page-head">
        <h2>Roadtrip USA</h2>
        <p>{TRIP.subtitle}</p>
      </div>

      <div className="grid g3 mb14">
        <div className="stat"><div className="k">Fechas</div><div className="v" style={{ fontSize: 15 }}>{dateLabel}</div></div>
        <div className="stat"><div className="k">Distancia total</div><div className="v">{TRIP.totalMiles.toLocaleString('en-US')} mi</div></div>
        <div className="stat"><div className="k">Manejo total</div><div className="v">{hm(TRIP.totalDriveHours)}</div></div>
        <div className="stat"><div className="k">Viajeros</div><div className="v">{PEOPLE.length}</div></div>
        <div className="stat"><div className="k">Paradas</div><div className="v">{STOPS.length}</div></div>
        <div className="stat"><div className="k">Fondo común</div><div className="v">{usd(bal.total)}</div></div>
      </div>

      {!dates?.startDate && (
        <div className="alert info mb14">
          <span>🗓️</span>
          <div>
            <b>Fechas abiertas.</b> El viaje se mueve entre agosto y octubre según precios de vuelo.
            El tablero de <b>Vuelos</b> revisa tarifas y marca los días más baratos para decidir.
          </div>
        </div>
      )}

      <div className="grid g2">
        <div className="card card-pad">
          <div className="row-between mb8">
            <h3 style={{ fontSize: 15 }}>Preparación del viaje</h3>
            <span className="mono small muted">{done}/{cl.length}</span>
          </div>
          <div className="bar mb14"><i style={{ width: pct + '%' }} /></div>
          <p className="tiny dim mb8">Siguientes pendientes:</p>
          {pending.length === 0
            ? <div className="hint">Todo listo. Ya pueden irse.</div>
            : <ul className="list">
                {pending.slice(0, 5).map(c => (
                  <li key={c.id}><span className="bl">○</span><span>{c.label}</span></li>
                ))}
              </ul>}
          {pending.length > 5 && (
            <button className="btn btn-sm" style={{ marginTop: 11 }} onClick={() => go('checklist')}>
              Ver los {pending.length} pendientes
            </button>
          )}
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 15 }} className="mb8">Los 8</h3>
          <div className="pgrid mb14">
            {PEOPLE.map(p => (
              <span key={p.id} className="chip">
                <Avatar id={p.id} size={18} />{p.name}
              </span>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            <div className="stat"><div className="k">Equipaje marcado</div><div className="v" style={{ fontSize: 16 }}>{packingDone}/{packingTotal}</div></div>
            <div className="stat"><div className="k">Gastos</div><div className="v" style={{ fontSize: 16 }}>{state.expenses.length}</div></div>
          </div>
          <button className="btn btn-sm" style={{ marginTop: 11 }} onClick={() => go('packing')}>Abrir packing list</button>
        </div>
      </div>

      <div className="card card-pad mb14" style={{ marginTop: 14 }}>
        <h3 style={{ fontSize: 15 }} className="mb14">Advertencias críticas de esta ruta</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div className="alert">
            <span>🎟️</span>
            <div><b>Zion / Angels Landing:</b> la lotería estacional de otoño ya cerró (20 jul 2026).
              Solo queda la <b>day-before</b>: aplican entre 12:01 a.m. y 3:00 p.m. MT del día anterior.</div>
          </div>
          <div className="alert">
            <span>🚌</span>
            <div><b>Zion Scenic Drive:</b> solo shuttle del 7 mar al 28 nov 2026. No hay excepción para carro propio.</div>
          </div>
          <div className="alert">
            <span>🚐</span>
            <div><b>8 personas:</b> necesitan mínimo 2 vehículos con equipaje. Un solo carro no funciona.</div>
          </div>
          <div className="alert good">
            <span>✅</span>
            <div><b>Yosemite 2026:</b> sin timed-entry ni reserva de vehículo. Solo pagar la entrada ($35/carro).</div>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <h3 style={{ fontSize: 15 }} className="mb14">Resumen del recorrido</h3>
        <table className="tbl">
          <thead>
            <tr><th>#</th><th>Parada</th><th>Tramo</th><th>Noches</th></tr>
          </thead>
          <tbody>
            {STOPS.map((s, i) => (
              <tr key={s.id}>
                <td className="mono dim">{i + 1}</td>
                <td>
                  <b>{s.name}</b>
                  <div className="tiny dim">{s.state}</div>
                </td>
                <td className="small muted">
                  {s.driveFromPrev
                    ? <>{s.driveMiles} mi · {hm(s.driveHours)}<div className="tiny dim">desde {s.driveFromPrev}</div></>
                    : <span className="dim">— inicio</span>}
                </td>
                <td className="mono">{s.nights || <span className="dim">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ itinerary
function DriveAssign({ segmentId, state, send, me }) {
  const cur = state.driveAssignments?.[segmentId] || ''
  return (
    <select
      className="select"
      style={{ maxWidth: 150, padding: '4px 8px', fontSize: 12 }}
      value={cur}
      onChange={e => send('/drive/assign', { segmentId, personId: e.target.value || null })}
    >
      <option value="">¿quién maneja?</option>
      {PEOPLE.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  )
}

function Itinerary({ state, send, me }) {
  const [open, setOpen] = useState(() => localStorage.getItem('rt_open_stop') || 'las')
  const [noteText, setNoteText] = useState({})

  const toggle = id => {
    const next = open === id ? '' : id
    setOpen(next)
    localStorage.setItem('rt_open_stop', next)
  }

  return (
    <>
      <div className="page-head">
        <h2>Itinerario</h2>
        <p>{STOPS.length} paradas · {(TRIP.totalMiles).toLocaleString('en-US')} mi · {hm(TRIP.totalDriveHours)} de manejo</p>
      </div>

      {STOPS.map((s, i) => {
        const isOpen = open === s.id
        const notes = state.notes.filter(n => n.stopId === s.id)
        return (
          <div className="stop" key={s.id}>
            <div className="stop-dot">{i + 1}</div>
            <div className="stop-card">
              <div className="stop-head" onClick={() => toggle(s.id)} style={{ cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="stop-title">
                    {s.name}
                    <span className={'tag tag-' + s.kind}>{s.kind}</span>
                    {s.nights > 0 && <span className="chip tiny">{s.nights} {s.nights === 1 ? 'noche' : 'noches'}</span>}
                  </div>
                  <div className="stop-sub">{s.place} · {s.state}</div>
                  {!isOpen && <div className="stop-tagline">{s.tagline}</div>}
                </div>
                <span className="dim" style={{ fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && (
                <div className="stop-body">
                  <p className="small muted" style={{ margin: '0 0 13px' }}>{s.tagline}</p>

                  {s.driveFromPrev && (
                    <div className="drive-strip mb14">
                      <span>🚗 desde <b>{s.driveFromPrev}</b></span>
                      <span>·</span>
                      <span><b>{s.driveMiles} mi</b> ({km(s.driveMiles)} km)</span>
                      <span>·</span>
                      <span><b>{hm(s.driveHours)}</b></span>
                      <span className="spacer" />
                      <DriveAssign segmentId={s.id} state={state} send={send} me={me} />
                    </div>
                  )}

                  {s.mustDo?.length > 0 && (
                    <>
                      <h4 className="small mb8" style={{ color: 'var(--sage)' }}>Qué hacer</h4>
                      <ul className="list mb14">
                        {s.mustDo.map((m, k) => <li key={k}><span className="bl">◆</span><span>{m}</span></li>)}
                      </ul>
                    </>
                  )}

                  {s.warnings?.length > 0 && (
                    <>
                      <h4 className="small mb8" style={{ color: 'var(--red)' }}>Ojo con esto</h4>
                      <ul className="list warn mb14">
                        {s.warnings.map((w, k) => <li key={k}><span className="bl">!</span><span>{w}</span></li>)}
                      </ul>
                    </>
                  )}

                  {s.costNotes && (
                    <div className="hint mb14"><b>Costo:</b> {s.costNotes}</div>
                  )}

                  <h4 className="small mb8">Notas del grupo</h4>
                  {notes.length === 0 && <p className="tiny dim">Nadie ha escrito nada sobre esta parada.</p>}
                  {notes.map(n => (
                    <div key={n.id} className="row" style={{ alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
                      <Avatar id={n.author} size={19} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="tiny dim">{nameOf(n.author)} · {new Date(n.ts).toLocaleDateString('es-CO')}</div>
                        <div className="small">{n.text}</div>
                      </div>
                      {(n.author === me || !n.author) && (
                        <button className="btn btn-sm btn-danger" onClick={() => send('/notes/remove', { id: n.id })}>×</button>
                      )}
                    </div>
                  ))}
                  <div className="row" style={{ marginTop: 9 }}>
                    <input
                      className="input"
                      placeholder="Escribir una nota para esta parada…"
                      value={noteText[s.id] || ''}
                      onChange={e => setNoteText({ ...noteText, [s.id]: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (noteText[s.id] || '').trim()) {
                          send('/notes/add', { stopId: s.id, text: noteText[s.id], author: me })
                          setNoteText({ ...noteText, [s.id]: '' })
                        }
                      }}
                    />
                    <button
                      className="btn"
                      disabled={!(noteText[s.id] || '').trim()}
                      onClick={() => {
                        send('/notes/add', { stopId: s.id, text: noteText[s.id], author: me })
                        setNoteText({ ...noteText, [s.id]: '' })
                      }}
                    >Enviar</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ----------------------------------------------------------------------- map
function MapView({ state }) {
  // Equirectangular projection with a corrected aspect ratio for ~36°N.
  const lons = STOPS.map(s => s.lon), lats = STOPS.map(s => s.lat)
  const pad = 1.2
  const minLon = Math.min(...lons) - pad, maxLon = Math.max(...lons) + pad
  const minLat = Math.min(...lats) - pad, maxLat = Math.max(...lats) + pad
  const W = 900, H = 520
  const kx = Math.cos((minLat + maxLat) / 2 * Math.PI / 180)
  const sx = W / ((maxLon - minLon) * kx)
  const sy = H / (maxLat - minLat)
  const sc = Math.min(sx, sy)
  const ox = (W - (maxLon - minLon) * kx * sc) / 2
  const oy = (H - (maxLat - minLat) * sc) / 2
  const px = s => ox + (s.lon - minLon) * kx * sc
  const py = s => oy + (maxLat - s.lat) * sc

  const [sel, setSel] = useState(null)
  const chosen = STOPS.find(s => s.id === sel)
  const path = STOPS.map((s, i) => `${i ? 'L' : 'M'}${px(s).toFixed(1)},${py(s).toFixed(1)}`).join(' ')

  return (
    <>
      <div className="page-head">
        <h2>Mapa de la ruta</h2>
        <p>Toca cada parada para ver el detalle del tramo</p>
      </div>

      <div className="card card-pad mb14">
        <svg className="map-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mapa del recorrido">
          <defs>
            <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4a9ee8" />
              <stop offset="55%" stopColor="#4fb98a" />
              <stop offset="100%" stopColor="#f0a03c" />
            </linearGradient>
          </defs>
          <rect width={W} height={H} fill="#0e151d" rx="14" />
          {[...Array(9)].map((_, i) => (
            <line key={'v' + i} x1={i * W / 8} y1="0" x2={i * W / 8} y2={H} stroke="#1a2532" strokeWidth="1" />
          ))}
          {[...Array(6)].map((_, i) => (
            <line key={'h' + i} x1="0" y1={i * H / 5} x2={W} y2={i * H / 5} stroke="#1a2532" strokeWidth="1" />
          ))}
          <path d={path} fill="none" stroke="url(#routeGrad)" strokeWidth="3.5"
            strokeLinecap="round" strokeLinejoin="round" opacity=".92" />
          <path d={path} fill="none" stroke="#0e151d" strokeWidth="1.4" strokeDasharray="6 9" opacity=".65" />

          {STOPS.map((s, i) => (
            <g key={s.id} className="map-node" onClick={() => setSel(sel === s.id ? null : s.id)}>
              <circle cx={px(s)} cy={py(s)} r={sel === s.id ? 11 : 7}
                fill={s.kind === 'parque' ? '#4fb98a' : s.kind === 'hito' ? '#8b6fd4' : s.kind === 'salida' ? '#e8584a' : '#f0a03c'}
                stroke="#0e151d" strokeWidth="2.5" />
              <text x={px(s)} y={py(s) - 15} textAnchor="middle" className="map-label">
                {i + 1}. {s.name}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {chosen && (
        <div className="card card-pad">
          <div className="row-between mb8">
            <h3 style={{ fontSize: 16 }}>{chosen.order + 1}. {chosen.name}</h3>
            <span className={'tag tag-' + chosen.kind}>{chosen.kind}</span>
          </div>
          <p className="small muted" style={{ marginTop: 0 }}>{chosen.place}</p>
          {chosen.driveFromPrev && (
            <div className="drive-strip mb14">
              <span>desde <b>{chosen.driveFromPrev}</b></span><span>·</span>
              <span><b>{chosen.driveMiles} mi</b> / {km(chosen.driveMiles)} km</span><span>·</span>
              <span><b>{hm(chosen.driveHours)}</b></span>
            </div>
          )}
          <ul className="list">
            {chosen.mustDo.slice(0, 3).map((m, k) => <li key={k}><span className="bl">◆</span><span>{m}</span></li>)}
          </ul>
        </div>
      )}
    </>
  )
}

// ----------------------------------------------------------------- checklist
function Checklist({ state, send, me }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ label: '', category: 'Varios', owner: '' })
  const [filter, setFilter] = useState('todas')

  const cats = ['todas', ...CATEGORIES.filter(c => state.checklist.some(i => i.category === c))]
  const list = filter === 'todas' ? state.checklist : state.checklist.filter(i => i.category === filter)
  const done = state.checklist.filter(c => c.done).length

  const grouped = list.reduce((acc, it) => {
    (acc[it.category] ||= []).push(it)
    return acc
  }, {})

  return (
    <>
      <div className="page-head">
        <h2>Checklist de preparación</h2>
        <p>{done} de {state.checklist.length} completadas · todos pueden marcar</p>
      </div>

      <div className="card card-pad mb14">
        <div className="bar mb14"><i style={{ width: (state.checklist.length ? done / state.checklist.length * 100 : 0) + '%' }} /></div>
        <div className="row wrapflex">
          {cats.map(c => (
            <button key={c} className={'chip' + (filter === c ? ' on' : '')} onClick={() => setFilter(c)}>
              {c}{c !== 'todas' && ` (${state.checklist.filter(i => i.category === c).length})`}
            </button>
          ))}
          <span className="spacer" />
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Agregar</button>
        </div>
      </div>

      {Object.keys(grouped).length === 0 && <div className="card empty">No hay tareas en esta categoría.</div>}

      {Object.entries(grouped).map(([cat, items]) => (
        <div className="card mb14" key={cat}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--line)' }}>
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--txt-2)' }}>
              {cat} <span className="dim mono" style={{ fontWeight: 400 }}>{items.filter(i => i.done).length}/{items.length}</span>
            </h3>
          </div>
          {items.map(it => (
            <div className={'item' + (it.done ? ' done' : '')} key={it.id}>
              <button className={'check' + (it.done ? ' on' : '')}
                onClick={() => send('/checklist/update', { id: it.id, done: !it.done })}>
                {it.done ? '✓' : ''}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="lbl">{it.label}</div>
                <div className="tiny dim">
                  {it.owner ? <>Asignado a {nameOf(it.owner)}</> : 'Sin asignar'}
                  {it.done && it.doneBy && <> · hecho por {nameOf(it.doneBy)}</>}
                  {it.done && it.doneAt && <> · {new Date(it.doneAt).toLocaleDateString('es-CO')}</>}
                </div>
              </div>
              <PersonPicker
                value={it.owner}
                onChange={v => send('/checklist/update', { id: it.id, owner: v || null })}
              />
              <button className="btn btn-sm btn-danger" onClick={() => send('/checklist/remove', { id: it.id })}>×</button>
            </div>
          ))}
        </div>
      ))}

      {adding && (
        <Modal
          title="Nueva tarea"
          onClose={() => setAdding(false)}
          footer={
            <>
              <button className="btn" onClick={() => setAdding(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!form.label.trim()} onClick={() => {
                send('/checklist/add', form)
                setForm({ label: '', category: 'Varios', owner: '' })
                setAdding(false)
              }}>Agregar</button>
            </>
          }
        >
          <div className="field">
            <label>Qué hay que hacer</label>
            <input className="input" autoFocus value={form.label}
              onChange={e => setForm({ ...form, label: e.target.value })}
              placeholder="Ej: reservar el tour de Antelope Canyon" />
          </div>
          <div className="field">
            <label>Categoría</label>
            <select className="select" value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Quién se encarga</label>
            <PersonPicker value={form.owner} onChange={v => setForm({ ...form, owner: v })} />
          </div>
        </Modal>
      )}
    </>
  )
}

// ------------------------------------------------------------------ expenses
function Expenses({ state, send, me }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({
    concept: '', amountUsd: '', paidBy: '', splitAmong: PEOPLE.map(p => p.id),
    category: 'Varios',
  })

  const bal = computeBalances(state.expenses, PEOPLE)
  const transfers = settleUp(bal.net)

  return (
    <>
      <div className="page-head">
        <h2>Gastos compartidos</h2>
        <p>Quién puso la plata y cómo queda el saldo entre los 8</p>
      </div>

      <div className="grid g3 mb14">
        <div className="stat"><div className="k">Total gastado</div><div className="v">{usd(bal.total)}</div></div>
        <div className="stat"><div className="k">Por persona (parejo)</div><div className="v">{usd(bal.total / PEOPLE.length)}</div></div>
        <div className="stat"><div className="k">Movimientos para saldar</div><div className="v">{transfers.length}</div></div>
      </div>

      <div className="card card-pad mb14">
        <div className="row-between mb14">
          <h3 style={{ fontSize: 15 }}>Cómo saldar</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Registrar gasto</button>
        </div>
        {transfers.length === 0
          ? <div className="hint">Todo cuadrado. Nadie le debe nada a nadie.</div>
          : <table className="tbl">
              <thead><tr><th>Quién paga</th><th>A quién</th><th style={{ textAlign: 'right' }}>Monto</th></tr></thead>
              <tbody>
                {transfers.map((t, i) => (
                  <tr key={i}>
                    <td><span className="row" style={{ gap: 7 }}><Avatar id={t.from} size={20} />{nameOf(t.from)}</span></td>
                    <td><span className="row" style={{ gap: 7 }}><Avatar id={t.to} size={20} />{nameOf(t.to)}</span></td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 650 }}>{usd(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
      </div>

      <div className="card card-pad mb14">
        <h3 style={{ fontSize: 15 }} className="mb14">Balance por persona</h3>
        <table className="tbl">
          <thead>
            <tr>
              <th>Persona</th>
              <th style={{ textAlign: 'right' }}>Puso</th>
              <th style={{ textAlign: 'right' }}>Le tocaba</th>
              <th style={{ textAlign: 'right' }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {PEOPLE.map(p => {
              const n = bal.net[p.id] || 0
              return (
                <tr key={p.id}>
                  <td><span className="row" style={{ gap: 7 }}><Avatar id={p.id} size={20} />{p.name}</span></td>
                  <td className="mono" style={{ textAlign: 'right' }}>{usd(bal.paid[p.id])}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{usd(bal.owed[p.id])}</td>
                  <td className="mono" style={{
                    textAlign: 'right', fontWeight: 650,
                    color: n > 0.01 ? 'var(--sage)' : n < -0.01 ? 'var(--red)' : 'var(--txt-3)',
                  }}>
                    {n > 0.01 ? '+' + usd(n) : n < -0.01 ? '−' + usd(-n) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ fontSize: 15 }}>Historial ({state.expenses.length})</h3>
        </div>
        {state.expenses.length === 0
          ? <div className="empty">Todavía nadie registra gastos. El primero en pagar algo, que lo anote aquí.</div>
          : [...state.expenses].reverse().map(e => (
              <div className="item" key={e.id}>
                <Avatar id={e.paidBy} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="lbl">{e.concept}</div>
                  <div className="tiny dim">
                    Pagó {nameOf(e.paidBy)} · se divide entre {e.splitAmong.length}
                    {e.splitAmong.length < PEOPLE.length && ' (parcial)'} · {e.category} · {e.date}
                  </div>
                </div>
                <div className="mono" style={{ fontWeight: 650, whiteSpace: 'nowrap' }}>{usd(e.amountUsd)}</div>
                <button className="btn btn-sm btn-danger" onClick={() => send('/expenses/remove', { id: e.id })}>×</button>
              </div>
            ))}
      </div>

      {adding && (
        <Modal
          title="Registrar gasto"
          onClose={() => setAdding(false)}
          footer={
            <>
              <button className="btn" onClick={() => setAdding(false)}>Cancelar</button>
              <button className="btn btn-primary"
                disabled={!form.concept.trim() || !form.amountUsd || !form.paidBy || !form.splitAmong.length}
                onClick={() => {
                  send('/expenses/add', { ...form, amountUsd: Number(form.amountUsd) })
                  setForm({ concept: '', amountUsd: '', paidBy: '', splitAmong: PEOPLE.map(p => p.id), category: 'Varios' })
                  setAdding(false)
                }}>Guardar</button>
            </>
          }
        >
          <div className="field">
            <label>Qué se pagó</label>
            <input className="input" autoFocus value={form.concept}
              onChange={e => setForm({ ...form, concept: e.target.value })}
              placeholder="Ej: gasolina del tramo a Page" />
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 11 }}>
            <div className="field">
              <label>Monto (USD)</label>
              <input className="input" type="number" min="0" step="0.01" value={form.amountUsd}
                onChange={e => setForm({ ...form, amountUsd: e.target.value })} placeholder="120.00" />
            </div>
            <div className="field">
              <label>Categoría</label>
              <select className="select" value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}>
                {['Gasolina', 'Peajes', 'Alojamiento', 'Comida', 'Tours', 'Parques', 'Varios'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Quién pagó</label>
            <PersonPicker value={form.paidBy} onChange={v => setForm({ ...form, paidBy: v })} />
          </div>
          <div className="field">
            <label>Entre quiénes se divide</label>
            <PersonPicker multi value={form.splitAmong} onChange={v => setForm({ ...form, splitAmong: v })} />
          </div>
        </Modal>
      )}
    </>
  )
}

// ------------------------------------------------------------------- packing
function Packing({ state, send, me }) {
  const [onlyMine, setOnlyMine] = useState(false)
  const cats = [...new Set(PACKING_SEED.map(p => p.category))]

  const marked = id => state.packing[id] || {}
  const totalMarked = Object.values(state.packing).reduce((s, m) => s + Object.keys(m).length, 0)
  const totalPossible = PACKING_SEED.reduce((s, p) => s + (p.everyone ? PEOPLE.length : 1), 0)

  if (!me) {
    return (
      <>
        <div className="page-head"><h2>Packing list</h2></div>
        <div className="alert info">
          <span>👤</span>
          <div>Elige quién eres arriba a la derecha para marcar tus propias cosas.</div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="page-head">
        <h2>Packing list</h2>
        <p>Cada uno marca lo suyo · {totalMarked} de {totalPossible} marcados</p>
      </div>

      <div className="card card-pad mb14">
        <div className="bar mb14"><i style={{ width: (totalMarked / totalPossible * 100) + '%' }} /></div>
        <div className="row wrapflex">
          <button className={'chip' + (onlyMine ? ' on' : '')} onClick={() => setOnlyMine(!onlyMine)}>
            Solo lo compartido
          </button>
          <span className="spacer" />
          <span className="row tiny muted" style={{ gap: 7 }}><Avatar id={me} size={19} />Marcando como <b>{nameOf(me)}</b></span>
        </div>
      </div>

      {cats.map(cat => {
        const items = PACKING_SEED.filter(p => p.category === cat && (!onlyMine || p.everyone))
        if (!items.length) return null
        return (
          <div className="card mb14" key={cat}>
            <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--line)' }}>
              <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--txt-2)' }}>{cat}</h3>
            </div>
            {items.map(it => {
              const m = marked(it.id)
              const mine = !!m[me]
              const count = Object.keys(m).length
              const need = it.everyone ? PEOPLE.length : 1
              return (
                <div className={'item' + (mine ? ' done' : '')} key={it.id}>
                  <button className={'check' + (mine ? ' on' : '')}
                    onClick={() => send('/packing/toggle', { itemId: it.id, personId: me })}>
                    {mine ? '✓' : ''}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="lbl">{it.label}</div>
                    <div className="row tiny dim" style={{ gap: 6, marginTop: 3 }}>
                      {it.everyone && <span className="mono">{count}/{need}</span>}
                      {it.everyone && <span className="pgrid" style={{ gap: 3 }}>
                        {PEOPLE.map(p => (
                          <span key={p.id} className="avatar" style={{
                            background: m[p.id] ? p.color : 'var(--line)',
                            width: 15, height: 15, fontSize: 8,
                            color: m[p.id] ? '#0b0f14' : 'transparent',
                          }}>{m[p.id] ? '✓' : ''}</span>
                        ))}
                      </span>}
                      {!it.everyone && count > 0 && <span>alguien lo lleva</span>}
                      {!it.everyone && count === 0 && <span>nadie lo lleva todavía</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </>
  )
}

// --------------------------------------------------------------------- flights
// The trip is an open-jaw: they fly into Las Vegas and home from San Francisco.
// Multi-city cannot be read from Google via the library, so the board prices it
// as two one-ways and combines them — which is also how it is usually bought.
const REFRESH = {
  outbound: {
    from: 'BOG', to: 'LAS',
    dates: ['2026-09-26', '2026-10-03', '2026-10-10', '2026-10-14', '2026-10-17', '2026-10-24'],
  },
  returns: {
    from: 'SFO', to: 'BOG',
    dates: ['2026-10-24', '2026-10-25', '2026-10-28', '2026-11-01'],
  },
  adults: 1,
  targetCop: TARGET_COP,
  // The road trip runs about 12 days; a "trip" under a week is an artifact of
  // the date grid, not a real itinerary.
  minTripDays: 7,
  maxTripDays: 28,
}

function Flights({ state, refresh, status }) {
  const f = state.flights || {}
  const legs = f.legs || []
  const combos = f.combos || []
  const target = f.target
  const rate = f.rate?.cop
  const cheapest = combos[0] || null
  const [fetching, setFetching] = useState(false)
  const [msg, setMsg] = useState(null)
  const autoTried = useRef(false)

  const cop = usd => rate ? `${Math.round(usd * rate).toLocaleString('en-US')} COP` : null

  const askRefresh = useCallback(async () => {
    setFetching(true)
    try {
      const r = await fetch('/api/flights/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(REFRESH),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setMsg(`✓ ${d.legs?.length || 0} fechas consultadas · ${d.combos?.length || 0} combinaciones`)
      await refresh(true)
    } catch (e) {
      setMsg('No se pudo consultar: ' + String(e.message || e))
    } finally {
      setFetching(false)
    }
  }, [refresh])

  // Opening the tab should show current fares, not whatever was cached days
  // ago. The server also refreshes on its own; this covers the case of someone
  // checking the board after a long gap.
  useEffect(() => {
    if (autoTried.current) return
    const age = f.updatedAt ? Date.now() - new Date(f.updatedAt).getTime() : Infinity
    if (age > 20 * 3600 * 1000) {
      autoTried.current = true
      askRefresh()
    }
  }, [f.updatedAt, askRefresh])

  const outs = legs.filter(l => l.leg === 'out').sort((a, b) => a.date.localeCompare(b.date))
  const rets = legs.filter(l => l.leg === 'ret').sort((a, b) => a.date.localeCompare(b.date))

  return (
    <>
      <div className="page-head">
        <h2>Vuelos</h2>
        <p>Open-jaw: entran por Las Vegas, salen por San Francisco · precios reales de Google Flights</p>
      </div>

      <div className="card card-pad mb14">
        <div className="row-between wrapflex mb14">
          <div>
            <div className="tiny dim">Objetivo del grupo</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{TARGET_COP.toLocaleString('en-US')} COP</div>
            <div className="tiny dim">ida y vuelta por persona</div>
          </div>
          {target && (
            <div className="stat" style={target.met ? { borderColor: 'var(--sage)', background: 'rgba(79,185,138,.08)' } : {}}>
              <div className="k">{target.met ? 'Objetivo alcanzado' : 'Brecha sobre el objetivo'}</div>
              <div className="v" style={{ color: target.met ? 'var(--sage)' : 'var(--sun)' }}>
                {/* A partial push (target without a computed gap) must not render NaN. */}
                {target.met ? '✓ sí'
                  : Number.isFinite(target.gapPct) ? `+${target.gapPct}%`
                  : '—'}
              </div>
              <div className="tiny dim">
                {target.met
                  ? `mejor: ${usd(target.bestUsd)}${target.bestCop ? ` (${target.bestCop.toLocaleString('en-US')} COP)` : ''}`
                  : Number.isFinite(target.gapUsd)
                    ? `brecha ${usd(target.gapUsd)} · necesitan ${usd(target.usd)}`
                    : `necesitan ${usd(target.usd)}`}
              </div>
            </div>
          )}
          <button className="btn" disabled={fetching} onClick={askRefresh}>
            {fetching ? <span className="spin" /> : '↻'} {fetching ? 'Consultando…' : 'Consultar precios'}
          </button>
        </div>

        {rate && (
          <div className="tiny dim">
            Tipo de cambio usado: 1 USD = {Math.round(rate).toLocaleString('en-US')} COP
            {f.rate?.at && <> · {f.rate.at}</>}
            · actualizado {f.updatedAt ? new Date(f.updatedAt).toLocaleString('es-CO') : 'nunca'}
          </div>
        )}

        {msg && <div className={'alert ' + (msg.startsWith('No') ? '' : 'good')} style={{ marginTop: 12 }}><span>{msg.startsWith('No') ? '!' : '✓'}</span><div>{msg}</div></div>}
        {!msg && !legs.length && (
          <div className="alert info" style={{ marginTop: 12 }}>
            <span>✈️</span>
            <div>Todavía no hay precios. Pulsa <b>Consultar precios</b> para traer tarifas reales de las fechas clave del viaje.</div>
          </div>
        )}
        {f.error && <div className="alert" style={{ marginTop: 12 }}><span>!</span><div>{f.error}</div></div>}
      </div>

      {cheapest && (
        <div className="card card-pad mb14">
          <h3 style={{ fontSize: 15 }} className="mb14">Combinación más barata</h3>
          <div className="grid g3">
            <div className="stat">
              <div className="k">Ida · BOG/MDE → LAS</div>
              <div className="v" style={{ fontSize: 16 }}>{cheapest.outDate}</div>
              <div className="tiny dim">{usd(cheapest.outbound.usd)} · {cheapest.outbound.airlines.join('/')}</div>
            </div>
            <div className="stat">
              <div className="k">Regreso · SFO → BOG</div>
              <div className="v" style={{ fontSize: 16 }}>{cheapest.retDate}</div>
              <div className="tiny dim">{usd(cheapest.return.usd)} · {cheapest.return.airlines.join('/')}</div>
            </div>
            <div className="stat" style={{ borderColor: 'var(--sage)', background: 'rgba(79,185,138,.08)' }}>
              <div className="k">Total por persona</div>
              <div className="v">{usd(cheapest.usd)}</div>
              <div className="tiny dim">{cheapest.days} días {cop(cheapest.usd) && <>· {cop(cheapest.usd)}</>}</div>
            </div>
          </div>
        </div>
      )}

      {combos.length > 0 && (
        <div className="card mb14">
          <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--line)' }}>
            <h3 style={{ fontSize: 15 }}>Todas las combinaciones ({combos.length})</h3>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Ida</th><th>Regreso</th><th>Días</th>
                <th style={{ textAlign: 'right' }}>USD</th>
                <th style={{ textAlign: 'right' }}>COP</th>
                <th style={{ textAlign: 'right' }}>vs objetivo</th>
              </tr>
            </thead>
            <tbody>
              {combos.map((c, i) => {
                const diff = target ? c.usd - target.usd : null
                return (
                  <tr key={i}>
                    <td className="mono nowrap">{c.outDate}<div className="tiny dim">{usd(c.outbound.usd)} {c.outbound.airlines.join('/')}</div></td>
                    <td className="mono nowrap">{c.retDate}<div className="tiny dim">{usd(c.return.usd)} {c.return.airlines.join('/')}</div></td>
                    <td className="mono">{c.days}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 650 }}>{usd(c.usd)}</td>
                    <td className="mono small nowrap" style={{ textAlign: 'right' }}>{cop(c.usd) || '—'}</td>
                    <td className="mono small nowrap" style={{
                      textAlign: 'right',
                      color: diff === null ? 'var(--txt-3)' : diff <= 0 ? 'var(--sage)' : 'var(--sun)',
                    }}>
                      {diff === null ? '—' : diff <= 0 ? '✓ alcanza' : '+' + usd(diff)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {legs.length > 0 && (
        <div className="grid g2">
          {[['Ida — BOG/MDE → Las Vegas', outs], ['Regreso — San Francisco → BOG', rets]].map(([title, list]) => (
            <div className="card" key={title}>
              <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--line)' }}>
                <h3 style={{ fontSize: 15 }}>{title}</h3>
              </div>
              {list.map((l, i) => (
                <div className="item" key={i}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="lbl mono">{l.date}</div>
                    <div className="tiny dim">
                      {l.from} → {l.to} · {l.airlines.join('/')} · {l.stops === 0 ? 'directo' : `${l.stops} escala(s) vía ${(l.via || []).join('/')}`}
                    </div>
                    <div className="tiny dim mono">{l.dep} → {l.arr} · {Math.floor(l.durMin / 60)}h{l.durMin % 60 ? String(l.durMin % 60).padStart(2, '0') : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono" style={{ fontWeight: 650 }}>{usd(l.usd)}</div>
                    {cop(l.usd) && <div className="tiny dim nowrap">{cop(l.usd)}</div>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="hint" style={{ marginTop: 14 }}>
        <b>Cómo se calcula:</b> este viaje es <i>open-jaw</i> (llegan a Las Vegas, vuelven desde San Francisco), no ida y vuelta.
        Google no expone el multi-city de forma legible, así que el tablero cotiza los dos trayectos por separado y los combina —
        que es además la forma más común de comprar este tipo de ruta. Los totales son la suma de dos tiquetes.
      </div>
    </>
  )
}

// ------------------------------------------------------------------- documents
function Documents({ state, send, me, refresh }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const onPick = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setErr(null)
    try {
      await uploadDoc(file, { name: file.name, by: me || 'anónimo', stopId: 'general' })
      await refresh(true)
    } catch (ex) {
      setErr(String(ex.message || ex))
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <>
      <div className="page-head">
        <h2>Documentos y reservas</h2>
        <p>Tiquetes, hoteles, tours y pases. Todo en un solo lugar, para todos.</p>
      </div>

      <div className="card card-pad mb14">
        <div className="row wrapflex">
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            {busy ? <span className="spin" /> : '↑'} Subir archivo
            <input type="file" hidden onChange={onPick} accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" />
          </label>
          <span className="tiny dim">PDF o imagen · máx 20 MB</span>
        </div>
        {err && <div className="alert" style={{ marginTop: 12 }}><span>!</span><div>{err}</div></div>}
        <div className="hint" style={{ marginTop: 12 }}>
          Descárguenlos en el celular antes del viaje: en los parques no hay señal.
        </div>
      </div>

      <div className="card">
        <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ fontSize: 15 }}>Archivos ({state.docs.length})</h3>
        </div>
        {state.docs.length === 0
          ? <div className="empty">Todavía no hay documentos. El primero que reserve algo, que suba el PDF aquí.</div>
          : [...state.docs].reverse().map(d => (
              <div className="item" key={d.id}>
                <span style={{ fontSize: 19 }}>{d.mime?.includes('pdf') ? '📄' : '🖼️'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={`/files/${d.stored}`} target="_blank" rel="noreferrer" className="lbl">{d.name}</a>
                  <div className="tiny dim">
                    {nameOf(d.uploadedBy) === '—' ? d.uploadedBy : nameOf(d.uploadedBy)} ·{' '}
                    {(d.size / 1024).toFixed(0)} KB · {new Date(d.ts).toLocaleDateString('es-CO')}
                  </div>
                </div>
                <button className="btn btn-sm btn-danger" onClick={() => send('/docs/remove', { id: d.id })}>×</button>
              </div>
            ))}
      </div>
    </>
  )
}

// ----------------------------------------------------------------------- wiki
function Wiki({ WIKI }) {
  const [open, setOpen] = useState(WIKI[0].id)
  return (
    <>
      <div className="page-head">
        <h2>Información práctica</h2>
        <p>Lo que hay que saber antes de salir</p>
      </div>
      {WIKI.map(w => (
        <div className="card mb14" key={w.id}>
          <button className="row-between" style={{ width: '100%', padding: '14px 16px', textAlign: 'left' }}
            onClick={() => setOpen(open === w.id ? '' : w.id)}>
            <h3 style={{ fontSize: 15 }}>{w.title}</h3>
            <span className="dim small">{open === w.id ? '▲' : '▼'}</span>
          </button>
          {open === w.id && (
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <ul className="list">
                {w.items.map((it, k) => <li key={k}><span className="bl">◆</span><span>{it}</span></li>)}
              </ul>
            </div>
          )}
        </div>
      ))}
    </>
  )
}

// ------------------------------------------------------------------------ app
const TABS = [
  { id: 'home', label: 'Inicio', ic: '◎' },
  { id: 'itinerary', label: 'Itinerario', ic: '≡' },
  { id: 'map', label: 'Mapa', ic: '⌖' },
  { id: 'flights', label: 'Vuelos', ic: '✈' },
  { id: 'checklist', label: 'Checklist', ic: '☑' },
  { id: 'expenses', label: 'Gastos', ic: '$' },
  { id: 'packing', label: 'Maletas', ic: '🧳' },
  { id: 'docs', label: 'Documentos', ic: '📄' },
  { id: 'wiki', label: 'Info', ic: 'ℹ' },
]

export default function App() {
  const { state, status, error, send, refresh, me, chooseMe } = useTripState()
  const [tab, setTab] = useState(() => location.hash.slice(1) || 'home')

  const go = t => {
    setTab(t)
    location.hash = t
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!state) {
    return (
      <div className="app">
        <div className="wrap" style={{ display: 'grid', placeItems: 'center', minHeight: '80vh' }}>
          <div className="center">
            <div className="spin" style={{ margin: '0 auto 14px', width: 26, height: 26 }} />
            <p className="muted small">Cargando el tablero del roadtrip…</p>
            {error && <p className="tiny" style={{ color: 'var(--red)' }}>{error}</p>}
          </div>
        </div>
      </div>
    )
  }

  const pendingCount = state.checklist.filter(c => !c.done).length

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <div className="brand-mark">🚐</div>
            <div className="brand-txt">
              <h1>Roadtrip USA</h1>
              <p>Vegas → Page → Zion → Sequoia → Yosemite → Napa → SF</p>
            </div>
          </div>
          <div className="topbar-right">
            <span className={'save-dot ' + status}>
              <i />{status === 'saving' ? 'guardando' : status === 'err' ? 'sin conexión' : 'al día'}
            </span>
            <span className="who">
              {me ? <Avatar id={me} size={21} /> : <span className="avatar" style={{ background: 'var(--line-2)', width: 21, height: 21, fontSize: 9 }}>?</span>}
              <select value={me} onChange={e => chooseMe(e.target.value)}>
                <option value="">¿quién eres?</option>
                {PEOPLE.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </span>
          </div>
        </div>
      </div>

      <div className="wrap">
        {error && status === 'err' && (
          <div className="alert mb14">
            <span>!</span>
            <div>No pude sincronizar con el servidor: {error}. Los cambios podrían no estar guardados.</div>
          </div>
        )}

        {tab === 'home' && <Overview state={state} go={go} />}
        {tab === 'itinerary' && <Itinerary state={state} send={send} me={me} />}
        {tab === 'map' && <MapView state={state} />}
        {tab === 'flights' && <Flights state={state} refresh={refresh} status={status} />}
        {tab === 'checklist' && <Checklist state={state} send={send} me={me} />}
        {tab === 'expenses' && <Expenses state={state} send={send} me={me} />}
        {tab === 'packing' && <Packing state={state} send={send} me={me} />}
        {tab === 'docs' && <Documents state={state} send={send} me={me} refresh={refresh} />}
        {tab === 'wiki' && <Wiki WIKI={WIKI} />}
      </div>

      <nav className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' on' : '')} onClick={() => go(t.id)}>
            <span className="ic">{t.ic}</span>
            <span>{t.label}</span>
            {t.id === 'checklist' && pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
}
