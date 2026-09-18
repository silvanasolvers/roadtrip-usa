import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { PEOPLE, TRIP, STOPS, PACKING_SEED, CATEGORIES, WIKI, TARGET_COP, PHOTOS, bookingDateGrid, bookingPlan, bookingTimeline, addDays, daysUntil } from './data/trip.js'
import { useTripState, uploadDoc } from './lib/store.js'
import { computeBalances, settleUp, usd, km, hm } from './lib/money.js'
import { Icon } from './lib/icons.jsx'
import { DEFAULT_DEPARTURE, STAY_NOTES, GENERAL_STAY_NOTE, departureRange, stayDates, tripNights, stayLinks, calendarStatus } from './lib/stays.js'

// ---------------------------------------------------------------- primitives
const byId = id => PEOPLE.find(p => p.id === id)
const nameOf = id => byId(id)?.name || '—'

// La portada. Es lo primero que se ve y lo que decide si esto se siente como el
// plan de un viaje o como un panel de datos. Va con una foto real del paisaje
// (Monument Valley, el corazón del suroeste) y las cifras encima, no en tarjetas
// sueltas que podrían ser de cualquier producto.
function Hero({ dateLabel, go }) {
  const days = daysUntil(TRIP.dateWindow.from)
  return (
    <section className="hero">
      <img className="hero-img" src={PHOTOS.hero} alt="" aria-hidden="true" />
      <div className="hero-veil" />
      <div className="hero-body">
        <div className="hero-kicker">Suroeste de Estados Unidos · {TRIP.year}</div>
        <h1 className="hero-title">Roadtrip USA</h1>
        <p className="hero-sub">
          {STOPS.length} paradas de Las Vegas a San Francisco · {TRIP.totalMiles.toLocaleString('en-US')} mi
          · {TRIP.durationDays} días
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => go('itinerary')}>
            Ver el itinerario <Icon name="arrowRight" size="sm" />
          </button>
          <button className="btn btn-ghost-inv" onClick={() => go('flights')}>
            <Icon name="plane" size="sm" /> Precios de vuelo
          </button>
        </div>
        <div className="hero-stats">
          <div><b>{days.toLocaleString('en-US')}</b><span>días faltan</span></div>
          <div><b>{PEOPLE.length}</b><span>viajeros</span></div>
          <div><b>{hm(TRIP.totalDriveHours)}</b><span>al volante</span></div>
          <div><b>{dateLabel.split(' ')[0]}</b><span>fechas</span></div>
        </div>
      </div>
    </section>
  )
}

// Las paradas de la ruta, cada una con su foto. Un tablero de viaje sin las
// fotos de los sitios nunca se va a ver bien: los nombres solos no transmiten
// nada de lo que se va a ver.
function Stops({ go }) {
  return (
    <div className="stops">
      {STOPS.map((s, i) => {
        const photo = PHOTOS[s.id]
        const long = s.driveMiles >= 400
        // No todas las paradas son destino. Bakersfield es una parada técnica,
        // Oakhurst y American Canyon son puertas de entrada y SFO es la salida.
        // Una tarjeta sin foto al lado de otra con foto se lee como una imagen
        // que falló, así que estas se diseñan como un tipo distinto y explícito.
        if (!photo) {
          return (
            <article key={s.id} className="stop-plain" onClick={() => go('itinerary')}>
              <div className="stop-plain-num">
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3>{s.name}</h3>
              <div className="stop-plain-meta">
                {s.nights ? `${s.nights} noche${s.nights > 1 ? 's' : ''}` : s.state}
                {s.driveMiles ? ` · ${s.driveMiles} mi` : ''}
              </div>
              <div className="stop-plain-kind">
                <Icon name={s.kind === 'salida' ? 'plane' : 'van'} size="sm" />
                {s.kind === 'salida' ? 'Salida' : 'Punto de paso'}
              </div>
            </article>
          )
        }
        return (
          <article
            key={s.id}
            className={'stop-card2' + (photo ? '' : ' no-photo')}
            onClick={() => go('itinerary')}
          >
            {photo && <img src={photo} alt={s.name} loading="lazy" />}
            <div className="stop-card2-body">
              <div className="stop-card2-num">
                {String(i + 1).padStart(2, '0')}
                {long && <span className="stop-card2-flag">tramo largo</span>}
              </div>
              <h3>{s.name}</h3>
              <div className="stop-card2-meta">
                {s.nights ? `${s.nights} noche${s.nights > 1 ? 's' : ''}` : s.state}
                {s.driveMiles ? ` · ${s.driveMiles} mi` : ''}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

// La traza de la ruta en una línea, para leer el recorrido de un vistazo.
//
// Cada parada es un nodo sobre una línea de carretera, con su distancia real
// desde la anterior. Es lo que hace que este tablero se reconozca como el plan
// de ESTE viaje y no como una rejilla de indicadores genérica. Los tramos largos
// se marcan porque son los que exigen madrugar.
function RouteBoard({ dateLabel, go }) {
  const long = 400 // millas a partir de las cuales el tramo pide atención
  return (
    <div className="route-board mb14">
      <div className="route-head">
        <div>
          <div className="route-kicker">La ruta</div>
          <div className="route-title">{STOPS.length} paradas · {TRIP.totalMiles.toLocaleString('en-US')} mi</div>
        </div>
        <button className="btn btn-sm" onClick={() => go('itinerary')}>
          Ver itinerario <Icon name="arrowRight" size="sm" />
        </button>
      </div>

      <ol className="route-track">
        {STOPS.map((s, i) => {
          const isLong = s.driveMiles >= long
          return (
            <li key={s.id} className={'route-stop' + (isLong ? ' is-long' : '')}>
              <span className="route-node" aria-hidden="true">{i + 1}</span>
              <div className="route-info">
                <div className="route-name">{s.name}</div>
                <div className="route-meta">
                  {s.nights ? `${s.nights} noche${s.nights > 1 ? 's' : ''}` : s.state}
                  {s.driveMiles ? (
                    <span className="route-drive">
                      {s.driveMiles} mi{s.driveHours ? ` · ${hm(s.driveHours)}` : ''}
                      {isLong && ' · tramo largo'}
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="route-foot">
        <Icon name="calendar" size="sm" />
        <span>{dateLabel}</span>
        <span className="route-scroll-hint">
          Desliza <Icon name="arrowRight" size="sm" />
        </span>
      </div>
    </div>
  )
}

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
      <Hero dateLabel={dateLabel} go={go} />

      <RouteBoard dateLabel={dateLabel} go={go} />

      <div className="section-head">
        <h2>Las paradas</h2>
        <p>Un vistazo a lo que hay en cada punto del recorrido.</p>
      </div>
      <Stops go={go} />

      {!dates?.startDate && (
        <div className="alert info mb14">
          <Icon name="calendar" size="md" />
          <div>
            <b>Fechas abiertas.</b> El viaje es de <b>{TRIP.durationDays} días</b> en {TRIP.year} y se
            mueve entre agosto y octubre según precios de vuelo. El tablero de <b>Vuelos</b> revisa
            tarifas y marca los días más baratos para decidir.
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
            <Icon name="ticket" size="md" />
            <div><b>Zion / Angels Landing:</b> el permiso es obligatorio todos los días del año y se
              obtiene solo por lotería en Recreation.gov. La <b>estacional</b> hay que jugarla con
              meses de anticipación; queda la <b>day-before</b> (12:01 a.m.–3:00 p.m. hora de Utah
              del día anterior, resultados 4:00 p.m.). Las fechas de 2027 aún no se publican.</div>
          </div>
          <div className="alert">
            <Icon name="shuttle" size="md" />
            <div><b>Zion Scenic Drive:</b> en temporada de shuttle (aprox. 7 mar – 28 nov) es solo
              shuttle. No hay excepción para carro propio. Se puede recorrer en bici.</div>
          </div>
          <div className="alert">
            <Icon name="van" size="md" />
            <div><b>8 personas:</b> necesitan mínimo 2 vehículos con equipaje. Un solo carro no funciona.</div>
          </div>
          <div className="alert good">
            <Icon name="checkCircle" size="md" />
            <div><b>Yosemite:</b> los últimos años no exige timed-entry ni reserva de vehículo —
              solo pagar la entrada ($35/carro). Confirmar la política del año antes de viajar.</div>
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
                      <span className="row" style={{ gap: 5 }}><Icon name="van" size="sm" /> desde <b>{s.driveFromPrev}</b></span>
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
          <Icon name="user" size="md" />
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
//
// Dates are computed from the trip window, never hardcoded: Google Flights only
// quotes ~11 months ahead, so a 2027 trip is not fully bookable yet and the grid
// has to grow on its own as the window approaches.
function buildRefresh(dayByDay = false) {
  // Consulta por defecto con muestreo (cada 3 días) para no disparar cientos de
  // búsquedas; el usuario puede pedir día por día cuando el viaje ya esté activo.
  const step = dayByDay ? 1 : 3
  const outDates = bookingDateGrid(step)
  const len = TRIP.durationDays || 15
  const retDates = [...new Set(outDates.map(d => addDays(d, len)))]
  return {
    outbound: { from: 'BOG', to: 'LAS', dates: outDates },
    returns: { from: 'SFO', to: 'BOG', dates: retDates },
    adults: 1,
    targetCop: TARGET_COP,
    // Cada combinación debe ser un viaje real de 15 días, no un apareo arbitrario.
    minTripDays: len,
    maxTripDays: len,
  }
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
  const [planOpen, setPlanOpen] = useState(false)
  const autoTried = useRef(false)

  const cop = usd => rate ? `${Math.round(usd * rate).toLocaleString('en-US')} COP` : null

  // El plan completo de consulta: qué fechas ya se pueden buscar y cuándo se
  // activa cada una. Es lo que muestra el horizonte acoplándose solo.
  const timeline = useMemo(() => bookingTimeline(), [])
  const plan = useMemo(() => bookingPlan(1), [])
  const bookable = timeline.activeDates > 0

  const askRefresh = useCallback(async (dayByDay = false) => {
    setFetching(true)
    try {
      const r = await fetch('/api/flights/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRefresh(dayByDay)),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setMsg(`${d.legs?.length || 0} fechas consultadas · ${d.combos?.length || 0} combinaciones`)
      await refresh(true)
    } catch (e) {
      setMsg('No se pudo consultar: ' + String(e.message || e))
    } finally {
      setFetching(false)
    }
  }, [refresh])

  // Abrir la pestaña debe mostrar tarifas al día. El servidor también refresca
  // por su cuenta; esto cubre el caso de entrar tras un hueco largo.
  useEffect(() => {
    if (autoTried.current || !bookable) return
    const age = f.updatedAt ? Date.now() - new Date(f.updatedAt).getTime() : Infinity
    if (age > 20 * 3600 * 1000) {
      autoTried.current = true
      askRefresh()
    }
  }, [f.updatedAt, askRefresh, bookable])

  const outs = legs.filter(l => l.leg === 'out').sort((a, b) => a.date.localeCompare(b.date))
  const rets = legs.filter(l => l.leg === 'ret').sort((a, b) => a.date.localeCompare(b.date))
  const fmtMonth = m => {
    const [y, mm] = m.split('-')
    return new Date(Date.UTC(Number(y), Number(mm) - 1, 1))
      .toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  }

  return (
    <>
      <div className="page-head">
        <h2>Vuelos</h2>
        <p>
          Open-jaw: entran por Las Vegas, salen por San Francisco · {TRIP.durationDays} días en {TRIP.year}
        </p>
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
                {target.met ? 'alcanza'
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
          <div className="rowflex" style={{ gap: 8 }}>
            <button className="btn" disabled={fetching || !bookable} onClick={() => askRefresh(false)}>
              {fetching ? <span className="spin" /> : <Icon name="refresh" size="sm" />} {fetching ? 'Consultando…' : 'Consultar precios'}
            </button>
            {bookable && (
              <button className="btn btn-sm" disabled={fetching} onClick={() => askRefresh(true)}
                title="Busca todas las fechas disponibles, no solo una muestra">
                Día por día
              </button>
            )}
          </div>
        </div>

        {rate && (
          <div className="tiny dim">
            Tipo de cambio usado: 1 USD = {Math.round(rate).toLocaleString('en-US')} COP
            {f.rate?.at && <> · {f.rate.at}</>}
            · actualizado {f.updatedAt ? new Date(f.updatedAt).toLocaleString('es-CO') : 'nunca'}
          </div>
        )}

        {msg && (
          <div className={'alert ' + (msg.startsWith('No') ? '' : 'good')} style={{ marginTop: 12 }}>
            <Icon name={msg.startsWith('No') ? 'alert' : 'checkCircle'} size="md" />
            <div>{msg}</div>
          </div>
        )}

        {/* El estado honesto: cuántas fechas ya se pueden consultar y cuándo se
            activan las que faltan. Google Flights publica ~11 meses adelante, así
            que el grid se acopla solo mes a mes en vez de fallar o quedar vacío. */}
        <div className={'alert ' + (bookable ? 'good' : 'info')} style={{ marginTop: 12 }}>
          <Icon name={bookable ? 'checkCircle' : 'clock'} size="lg" />
          <div>
            {bookable ? (
              <>
                <b>{timeline.activeDates} de {timeline.totalDates} fechas ya se pueden consultar.</b><br />
                Google Flights publica tarifas con unos 11 meses de anticipación (hoy hasta el{' '}
                <b>{timeline.horizon}</b>), y la lista crece sola cada mes. Las{' '}
                {timeline.pendingDates} fechas restantes se irán sumando hasta completarse en{' '}
                <b>{fmtMonth(timeline.fullyBookableFrom)}</b>.
              </>
            ) : (
              <>
                <b>Los primeros precios aparecen el {timeline.firstFaresOn}</b> — en{' '}
                <b>{timeline.daysToFirstFares} días</b>.<br />
                Google Flights publica tarifas con unos 11 meses de anticipación y hoy llega hasta
                el <b>{timeline.horizon}</b>. La primera salida del viaje es el{' '}
                {timeline.firstOutbound} y su regreso el {timeline.firstReturn}: los dos deben
                entrar en ese rango. Desde ahí el tablero irá sumando fechas solo, mes a mes,
                hasta cubrir las {timeline.totalDates} salidas para{' '}
                <b>{fmtMonth(timeline.fullyBookableFrom)}</b>. No hay que hacer nada.
              </>
            )}
            <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setPlanOpen(o => !o)}>
              {planOpen ? 'Ocultar el plan de consulta' : 'Ver el plan de consulta fecha por fecha'}
            </button>
          </div>
        </div>
      </div>

      {planOpen && (
        <div className="card card-pad mb14">
          <h3 style={{ fontSize: 15 }} className="mb8">Plan de consulta — {plan.length} fechas de salida</h3>
          <p className="tiny dim mb14">
            Cada fila es una salida con su regreso 15 días después. Las activas ya se pueden
            consultar; las pendientes indican la fecha en que Google empezará a publicarlas.
            {timeline.pendingDates > 0 && ` Se van sumando mes a mes hasta completarse.`}
          </p>
          <table className="tbl">
            <thead>
              <tr><th>Mes</th><th>Salida</th><th>Regreso (15 d)</th><th>Estado</th><th>Se activa</th></tr>
            </thead>
            <tbody>
              {plan.map(p => (
                <tr key={p.dep} style={p.active ? {} : { opacity: 0.62 }}>
                  <td className="plan-month">{fmtMonth(p.dep.slice(0, 7)).split(' de ')[0]}</td>
                  <td className="mono">{p.dep}</td>
                  <td className="mono">{p.ret}</td>
                  <td>{p.active
                    ? <span className="chip" style={{ borderColor: 'var(--sage)', color: 'var(--sage)' }}>activa</span>
                    : <span className="chip">pendiente</span>}</td>
                  <td className="tiny dim">{p.active ? '—' : p.opensOn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {f.note && <div className="alert info mb14"><Icon name="info" size="md" /><div>{f.note}</div></div>}
      {f.error && <div className="alert mb14"><Icon name="alert" size="md" /><div>{f.error}</div></div>}

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
                      {diff === null ? '—' : diff <= 0 ? 'alcanza' : '+' + usd(diff)}
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

// ------------------------------------------------------------------- stays
// Hospedaje por parada.
//
// Ni Booking ni Airbnb exponen una API pública de búsqueda. Lo que sí aceptan
// es una consulta pre-armada por URL: el tablero calcula el tramo de cada
// parada (noches encadenadas a partir de la salida), arma el enlace con las
// fechas y la ocupación real de los 8 — casa completa con 4+ recámaras en
// Airbnb, 4 habitaciones en Booking — y lo abre en la plataforma. La capa
// inteligente es el calendario: qué lodge de parque hay que asegurar primero y
// la fecha exacta en que su ventana se abre para estas fechas.
function Stays({ state }) {
  const confirmed = state?.trips?.startDate || ''
  const [departure, setDeparture] = useState(() => confirmed || DEFAULT_DEPARTURE)
  const [showCal, setShowCal] = useState(true)

  const range = useMemo(() => departureRange(), [])
  const stays = useMemo(() => stayDates(departure), [departure])
  const totals = useMemo(() => tripNights(departure), [departure])
  const cal = useMemo(() => calendarStatus(departure), [departure])

  const fmt = (iso, opts) => new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString('es-CO', { ...(opts || { day: 'numeric', month: 'short' }), timeZone: 'UTC' })

  const setDep = v => {
    if (!v) return
    setDeparture(v < range.min ? range.min : v > range.max ? range.max : v)
  }

  const lodging = stays.filter(s => s.nights > 0)
  const parkWindow = Object.fromEntries(cal.items.map(i => [i.stopId, i]))
  const openNow = cal.items.filter(i => i.opensOn <= cal.today)

  return (
    <>
      <div className="page-head">
        <h2>Hospedaje</h2>
        <p>
          Búsqueda por parada con las fechas de cada tramo y la ocupación de los 8 ya puestas:
          casa completa de 4+ recámaras en Airbnb, 4 habitaciones en Booking.
        </p>
      </div>

      <div className="card card-pad mb14">
        <div className="row-between wrapflex" style={{ gap: 14 }}>
          <div>
            <div className="tiny dim">Inicio del viaje · llegada a Las Vegas</div>
            <input
              className="input mono" type="date" style={{ maxWidth: 185, marginTop: 5 }}
              min={range.min} max={range.max} value={departure}
              onChange={e => setDep(e.target.value)}
            />
            <div className="tiny dim" style={{ marginTop: 5 }}>
              Fechas posibles de inicio: {fmt(range.min, { day: 'numeric', month: 'short', year: 'numeric' })}
              {' → '}{fmt(range.max, { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
          <div className="stay-nights"><b>{lodging.length}</b><span>alojamientos</span></div>
          <div className="stay-nights"><b>{totals.totalNights}</b><span>noches</span></div>
          <div className="stay-nights"><b>{fmt(totals.lastCheckOut)}</b><span>último check-out</span></div>
        </div>

        {confirmed && confirmed !== departure && (
          <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => setDeparture(confirmed)}>
            <Icon name="calendar" size="sm" /> Usar las fechas confirmadas ({confirmed})
          </button>
        )}

        <div className={'alert ' + (openNow.length ? 'good' : 'info')} style={{ marginTop: 14 }}>
          <Icon name="bed" size="md" />
          <div>
            {openNow.length ? (
              <>
                <b>{openNow.length} de {cal.total} ventanas de los lodges de parque ya están abiertas para
                estas fechas.</b> Son los alojamientos que primero se agotan: vale la pena asegurarlos en
                cuanto las fechas estén firmes, mirando una política de cancelación que dé flexibilidad.
              </>
            ) : (
              <>
                <b>Las ventanas de los lodges de parque todavía no abren para estas fechas.</b>{' '}
                {cal.next && (
                  <>La primera se abre el{' '}
                    <b>{fmt(cal.next.opensOn, { day: 'numeric', month: 'long', year: 'numeric' })}</b>{' '}
                    (en {daysUntil(cal.next.opensOn)} días): {cal.next.windowLabel}.</>
                )}{' '}
                Booking y Airbnb se pueden mirar desde ya: abren disponibilidad rodante.
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid g2 mb14">
        {lodging.map(s => {
          const links = stayLinks(s.stopId, s.checkIn, s.checkOut)
          const w = parkWindow[s.stopId]
          return (
            <div className="card stay-card" key={s.stopId}>
              <div className="stay-head">
                <div className="stay-no" style={{ paddingTop: 3 }}>{String(s.order + 1).padStart(2, '0')}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="stay-title">
                    {s.name}
                    <span className={'tag tag-' + s.kind}>{s.kind}</span>
                  </div>
                  <div className="tiny dim" style={{ marginTop: 2 }}>{s.state}</div>
                  <div className="small mono" style={{ marginTop: 7 }}>
                    {fmt(s.checkIn)} → {fmt(s.checkOut)}
                  </div>
                </div>
                <div className="stay-nights">
                  <b>{s.nights}</b>
                  <span>noche{s.nights > 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="stay-body">
                <p className="small muted" style={{ margin: '0 0 12px' }}>{STAY_NOTES[s.stopId]}</p>
                <div className="stay-links">
                  <a className="btn btn-sm" href={links.booking} target="_blank" rel="noreferrer">
                    <Icon name="external" size="sm" /> Booking
                  </a>
                  <a className="btn btn-sm" href={links.airbnb} target="_blank" rel="noreferrer">
                    <Icon name="external" size="sm" /> Airbnb
                  </a>
                </div>
                {w && (
                  <div className="hint" style={{ marginTop: 11 }}>
                    <b>Ventana del lodge:</b>{' '}
                    {w.opensOn <= cal.today
                      ? 'ya abierta'
                      : <>abre el <b>{fmt(w.opensOn, { day: 'numeric', month: 'short', year: 'numeric' })}</b></>}
                    {' · '}{w.days} días ·{' '}
                    <a href={w.url} target="_blank" rel="noreferrer">sitio oficial</a>
                  </div>
                )}
                {links.nearby.length > 0 && (
                  <div className="stay-near">
                    <div className="tiny dim">Alternativas cercanas (distancia real en auto):</div>
                    {links.nearby.map(n => (
                      <div key={n.label} className="small" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <b>{n.label}</b> <span className="dim tiny">{n.minutes} min</span>
                        <span className="spacer" />
                        <a className="tiny" href={n.booking} target="_blank" rel="noreferrer">Booking</a>
                        <a className="tiny" href={n.airbnb} target="_blank" rel="noreferrer">Airbnb</a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card mb14">
        <div className="row-between wrapflex" style={{ padding: '13px 15px', borderBottom: showCal ? '1px solid var(--line)' : 'none' }}>
          <div>
            <h3 style={{ fontSize: 15 }}>Cuándo reservar cada alojamiento de parque</h3>
            <p className="tiny dim" style={{ margin: '4px 0 0' }}>
              Ventanas exactas para estas fechas, en orden de apertura.
            </p>
          </div>
          <button className="btn btn-sm" onClick={() => setShowCal(o => !o)}>
            {showCal ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        {showCal && (
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr><th>Se abre</th><th>Alojamiento</th><th>Parada</th><th>Tramo</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {cal.items.map(i => (
                  <tr key={i.windowId + '-' + i.stopId}>
                    <td className="mono nowrap">{i.opensOn}</td>
                    <td>
                      <b>{i.windowLabel}</b>
                      <div className="tiny dim">{i.days} días de ventana</div>
                    </td>
                    <td>{i.name}</td>
                    <td className="mono tiny nowrap">{i.checkIn} → {i.checkOut}</td>
                    <td>
                      {i.opensOn <= cal.today
                        ? <span className="chip ok">abierta</span>
                        : <span className="chip">en {daysUntil(i.opensOn)} días</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="hint">
        <b>Cómo funciona:</b> Booking y Airbnb no tienen API pública de búsqueda, así que el tablero
        arma la consulta con las fechas y la ocupación reales y la abre en la plataforma — los
        resultados y precios se ven allá, en vivo. {GENERAL_STAY_NOTE}
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
            {busy ? <span className="spin" /> : <Icon name="download" size="sm" />} Subir archivo
            <input type="file" hidden onChange={onPick} accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" />
          </label>
          <span className="tiny dim">PDF o imagen · máx 20 MB</span>
        </div>
        {err && <div className="alert" style={{ marginTop: 12 }}><Icon name="alert" size="md" /><div>{err}</div></div>}
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
                <Icon name={d.mime?.includes('pdf') ? 'file' : 'image'} size="lg" />
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
  { id: 'home', label: 'Inicio', ic: 'compass' },
  { id: 'itinerary', label: 'Itinerario', ic: 'route' },
  { id: 'map', label: 'Mapa', ic: 'pin' },
  { id: 'flights', label: 'Vuelos', ic: 'plane' },
  { id: 'stays', label: 'Hospedaje', ic: 'bed' },
  { id: 'checklist', label: 'Checklist', ic: 'clipboard' },
  { id: 'expenses', label: 'Gastos', ic: 'wallet' },
  { id: 'packing', label: 'Maletas', ic: 'luggage' },
  { id: 'docs', label: 'Documentos', ic: 'file' },
  { id: 'wiki', label: 'Info', ic: 'guidebook' },
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
            <div className="brand-mark"><Icon name="route" size="md" /></div>
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
            <Icon name="alert" size="md" />
            <div>No pude sincronizar con el servidor: {error}. Los cambios podrían no estar guardados.</div>
          </div>
        )}

        {tab === 'home' && <Overview state={state} go={go} />}
        {tab === 'itinerary' && <Itinerary state={state} send={send} me={me} />}
        {tab === 'map' && <MapView state={state} />}
        {tab === 'flights' && <Flights state={state} refresh={refresh} status={status} />}
        {tab === 'stays' && <Stays state={state} />}
        {tab === 'checklist' && <Checklist state={state} send={send} me={me} />}
        {tab === 'expenses' && <Expenses state={state} send={send} me={me} />}
        {tab === 'packing' && <Packing state={state} send={send} me={me} />}
        {tab === 'docs' && <Documents state={state} send={send} me={me} refresh={refresh} />}
        {tab === 'wiki' && <Wiki WIKI={WIKI} />}
      </div>

      <nav className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' on' : '')} onClick={() => go(t.id)}>
            <Icon name={t.ic} size="md" />
            <span className="tab-label">
              {t.label}
              {t.id === 'checklist' && pendingCount > 0 && <span className="badge">{pendingCount}</span>}
            </span>
          </button>
        ))}
      </nav>
    </div>
  )
}
