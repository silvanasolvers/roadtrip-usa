// Hospedaje — motor de búsqueda por parada.
//
// Ni Booking ni Airbnb exponen una API pública de búsqueda: Booking bloquea
// acceso automatizado y Airbnb no publica endpoint. Lo que sí aceptan las dos
// es una búsqueda pre-armada por URL con fechas y ocupación reales, así que el
// tablero hace exactamente eso: calcula el tramo de cada parada a partir de la
// ruta (noches encadenadas desde la salida), arma los enlaces de Booking y
// Airbnb con las fechas y la ocupación del grupo, y los abre en una pestaña
// nueva. La "inteligencia" no está en inventar precios que no podemos verificar,
// sino en: fechas correctas por tramo, filtros correctos por plataforma, y el
// calendario real de cuándo hay que reservar cada tipo de alojamiento — que es
// el dato que de verdad decide si consiguen dormir dentro de un parque o no.
//
// Ventanas de reserva verificadas contra la fuente (sep 2026):
//   - Zion Lodge (Xanterra, único alojamiento dentro de Zion): 12 meses.
//     zionlodge.com/lodging/lodge-policies → "stays up to 12 months in advance".
//   - Yosemite: 366 días — nps.gov/yose: "Reservations are available 366 days
//     in advance"; la reserva la opera el concesionario (Travel Yosemite).
//   - Sequoia & Kings Canyon: 366 días (visitsequoia.com, concesionario
//     Delaware North: "may be booked up to 366 days (one year and one day)").
//   - Booking/Airbnb: disponibilidad rodante (verificado: Airbnb ya muestra
//     inventario para agosto de 2027).
// Estas fechas no son adorno: en temporada alta los lodges de parque se agotan
// rápido, y por eso el tablero muestra la fecha exacta en que cada ventana se
// abre para el viaje.

import { STOPS, TRIP, addDays } from '../data/trip.js'

// ---------------------------------------------------------------- ocupación
// El grupo es de 8. Para casas completas (Airbnb) se busca capacidad para 8.
// Para hotel (Booking) 8 adultos no caben en una habitación: la búsqueda se
// abre con 4 habitaciones, que es la configuración estándar para un grupo así.
export const GROUP_SIZE = 8
export const HOTEL_ROOMS = 4

// Fecha de salida por defecto: la más temprana de la ventana del viaje. Es la
// que da más margen para reservar los alojamientos de parque antes de que se
// agoten. El usuario puede cambiarla desde la vista, y si el tablero ya tiene
// fechas confirmadas, la vista ofrece usarlas.
export const DEFAULT_DEPARTURE = TRIP.dateWindow.from

// --------------------------------------------------------------- ventanas
// Cada alojamiento crítico con su ventana de reserva real. Se declara una sola
// vez y la fecha de apertura se calcula para la salida elegida — nunca
// hardcodeada, porque el viaje es 2027 y las ventanas se abren en 2026.
export const BOOKING_WINDOWS = [
  {
    id: 'zionlodge',
    stopIds: ['zion'],
    label: 'Zion Lodge (dentro del parque)',
    days: 365,
    note: 'Único alojamiento dentro de Zion. Abre 12 meses antes y se agota rápido; ' +
      'el depósito es la primera noche.',
    url: 'https://www.zionlodge.com/check-availability/',
  },
  {
    id: 'yosemite',
    stopIds: ['yosemite'],
    label: 'Yosemite (lodges dentro del valle)',
    days: 366,
    note: 'Los lodges del valle (Curry Village, Yosemite Valley Lodge…) abren 366 días ' +
      'antes. Es la reserva más competitiva del viaje: se agotan rápido.',
    url: 'https://travelyosemite.com/lodging',
  },
  {
    id: 'sequoia',
    stopIds: ['threerivers'],
    label: 'Sequoia / Kings Canyon (dentro del parque)',
    days: 366,
    note: 'Alojamiento dentro del parque (Wuksachi Lodge y otros) vía el concesionario. ' +
      'También abre 366 días antes.',
    url: 'https://www.nps.gov/seki/planyourvisit/lodging.htm',
  },
]

// Nota general para las plataformas de disponibilidad rodante. Aplica a todas
// las paradas que no tienen ventana fija.
export const GENERAL_STAY_NOTE =
  'Booking y Airbnb abren disponibilidad de forma rodante: ya se puede mirar y comparar para ' +
  'las fechas del viaje (Airbnb ya muestra inventario para agosto de 2027) y conviene volver ' +
  'a revisar cuando se acerque. Para las paradas sin ventana fija (Las Vegas, Page, ' +
  'Bakersfield, Oakhurst, American Canyon, Napa) no hay urgencia de meses, salvo Page en temporada.'

// --------------------------------------------------------- notas por parada
// Contexto útil para decidir dónde dormir en cada punto. Sale de los datos de
// la ruta y de lo verificado para cada parque; no son precios estimados.
export const STAY_NOTES = {
  las: 'Una noche de llegada cerca del aeropuerto. Si miran hoteles del Strip, ojo con el resort fee: se cobra aparte y sube el total.',
  page: 'Pocos hoteles y demanda alta en temporada de Antelope Canyon. Es de las paradas donde conviene no dejarlo para el final.',
  zion: 'La única opción dentro del parque es el Zion Lodge. Todo lo demás está en Springdale, a minutos de la entrada y del shuttle.',
  bakersfield: 'Parada técnica sin atractivo: hay bastante hotel económico sobre la ruta. No requiere reservar con meses.',
  threerivers: 'Puerta sur de Sequoia. Dentro del parque está Wuksachi (ventana de 366 días); Three Rivers es más barato y queda a ~20 min de la entrada.',
  oakhurst: 'Base sur de Yosemite con servicios completos. Es el respaldo natural si no hay cupo dentro del valle.',
  yosemite: 'Los alojamientos del valle abren 366 días antes y son los primeros en agotarse del viaje. Si no hay cupo: Fish Camp u Oakhurst, entrando temprano.',
  americancanyon: 'Base norte de la bahía, a ~15 min de Napa y bastante más barata.',
  napa: 'La noche de bodegas. Es la zona más cara del tramo: conviene mirar con tiempo y comparar con American Canyon.',
}

// Fecha en que se abre la ventana para una entrada concreta.
export function windowOpensOn(checkIn, days) {
  return addDays(checkIn, -days)
}

// --------------------------------------------------------- fechas por parada
// Encadena las noches de la ruta a partir de la salida elegida. Cada parada
// con noches > 0 recibe check-in y check-out reales; las de paso (Golden Gate,
// SFO) no tienen alojamiento.
export function stayDates(departure = DEFAULT_DEPARTURE) {
  const out = []
  let cursor = departure
  for (const s of STOPS) {
    const nights = s.nights || 0
    const checkIn = cursor
    const checkOut = nights ? addDays(cursor, nights) : null
    out.push({
      stopId: s.id,
      order: s.order,
      name: s.name,
      place: s.place,
      state: s.state,
      kind: s.kind,
      nights,
      checkIn,
      checkOut,
    })
    if (nights) cursor = checkOut
  }
  return out
}

// Total de noches y comprobación de coherencia del encadenado.
export function tripNights(departure = DEFAULT_DEPARTURE) {
  const stays = stayDates(departure)
  const withNights = stays.filter(s => s.nights > 0)
  return {
    totalNights: withNights.reduce((n, s) => n + s.nights, 0),
    stays: withNights.length,
    lastCheckOut: withNights.length ? withNights[withNights.length - 1].checkOut : null,
  }
}

// Rango válido de la fecha de salida: la más temprana de la ventana del viaje
// y la más tardía que todavía mantiene todas las noches de la ruta dentro de
// esa ventana.
export function departureRange() {
  const total = tripNights(TRIP.dateWindow.from).totalNights
  return { min: TRIP.dateWindow.from, max: addDays(TRIP.dateWindow.to, -total) }
}

// -------------------------------------------------------------- url builders
// Formatos verificados (sep 2026):
// Booking: searchresults.html?ss=…&checkin=…&checkout=…&group_adults=N&no_rooms=N
// Airbnb:  /s/<slug>/homes?checkin=…&checkout=…&adults=N&min_bedrooms=N&room_types[]=…

// Slug de Airbnb por parada. Verificados en navegador real: cada URL resuelve
// a la ciudad correcta con las fechas y la ocupación puestas.
const AIRBNB_SLUG = {
  las: 'Las-Vegas--NV',
  page: 'Page--AZ',
  zion: 'Springdale--UT',
  bakersfield: 'Bakersfield--CA',
  threerivers: 'Three-Rivers--CA',
  oakhurst: 'Oakhurst--CA',
  yosemite: 'Yosemite-Valley--CA',
  americancanyon: 'American-Canyon--CA',
  napa: 'Napa--CA',
}

// Bases alternativas de una parada, con distancia real (OSRM). Sirven cuando
// la base principal está cara o sin inventario.
const NEARBY = {
  zion: [
    { slug: 'La-Verkin--UT', dest: 'La Verkin, UT', label: 'La Verkin', minutes: 34 },
    { slug: 'Hurricane--UT', dest: 'Hurricane, UT', label: 'Hurricane', minutes: 38 },
  ],
  yosemite: [
    { slug: 'Fish-Camp--CA', dest: 'Fish Camp, CA', label: 'Fish Camp', minutes: 69 },
    { slug: 'Mariposa--CA', dest: 'Mariposa, CA', label: 'Mariposa', minutes: 78 },
  ],
}

export function airbnbUrl(stopId, checkIn, checkOut, opts = {}) {
  const slug = opts.slug || AIRBNB_SLUG[stopId]
  if (!slug || !checkIn || !checkOut) return null
  const p = new URLSearchParams({
    checkin: checkIn,
    checkout: checkOut,
    adults: String(GROUP_SIZE),
    currency: 'USD',
  })
  // Casa completa con 4+ recámaras: es lo que de verdad necesita un grupo de 8.
  p.set('min_bedrooms', '4')
  p.set('room_types[]', 'Entire home/apt')
  return `https://www.airbnb.com/s/${slug}/homes?${p.toString()}`
}

export function bookingUrl(stopId, checkIn, checkOut, opts = {}) {
  const dest = opts.dest || searchLabel(stopId)
  if (!dest || !checkIn || !checkOut) return null
  const p = new URLSearchParams({
    ss: dest,
    checkin: checkIn,
    checkout: checkOut,
    group_adults: String(GROUP_SIZE),
    no_rooms: String(HOTEL_ROOMS),
    group_children: '0',
    selected_currency: 'USD',
    lang: 'es',
    order: 'price',
  })
  return `https://www.booking.com/searchresults.html?${p.toString()}`
}

// Etiqueta de búsqueda por parada. Para Booking conviene el nombre de la
// ciudad + estado, no el nombre del parque (que devuelve resultados vagos).
function searchLabel(stopId) {
  const map = {
    las: 'Las Vegas, NV',
    page: 'Page, AZ',
    zion: 'Springdale, UT',
    bakersfield: 'Bakersfield, CA',
    threerivers: 'Three Rivers, CA',
    oakhurst: 'Oakhurst, CA',
    yosemite: 'Yosemite National Park, CA',
    americancanyon: 'American Canyon, CA',
    napa: 'Napa, CA',
  }
  return map[stopId] || null
}

// Enlaces para una parada: la búsqueda principal y las alternativas cercanas.
export function stayLinks(stopId, checkIn, checkOut) {
  const base = {
    airbnb: airbnbUrl(stopId, checkIn, checkOut),
    booking: bookingUrl(stopId, checkIn, checkOut),
  }
  const nearby = (NEARBY[stopId] || []).map(n => ({
    label: n.label,
    minutes: n.minutes,
    airbnb: airbnbUrl(stopId, checkIn, checkOut, { slug: n.slug }),
    booking: bookingUrl(stopId, checkIn, checkOut, { dest: n.dest }),
  }))
  return { ...base, nearby }
}

// ------------------------------------------------------------- calendario
// El plan de reserva: por parada crítica, cuándo se abre su ventana para las
// fechas del viaje, ordenado por fecha de apertura. Es la parte que decide el
// viaje: qué hay que reservar primero.
export function bookingCalendar(departure = DEFAULT_DEPARTURE) {
  const stays = stayDates(departure).filter(s => s.nights > 0)
  const items = []
  for (const w of BOOKING_WINDOWS) {
    for (const stay of stays) {
      if (w.stopIds && !w.stopIds.includes(stay.stopId)) continue
      items.push({
        windowId: w.id,
        windowLabel: w.label,
        stopId: stay.stopId,
        name: stay.name,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        nights: stay.nights,
        opensOn: windowOpensOn(stay.checkIn, w.days),
        days: w.days,
        url: w.url,
        note: w.note,
      })
    }
  }
  return items.sort((a, b) => a.opensOn.localeCompare(b.opensOn) || a.name.localeCompare(b.name))
}

// Resumen del calendario: cuántas ventanas ya están abiertas y cuál es la
// próxima en abrir. Se calcula, nunca se escribe a mano.
export function calendarStatus(departure = DEFAULT_DEPARTURE, today = new Date()) {
  const iso = today.toISOString().slice(0, 10)
  const items = bookingCalendar(departure)
  const open = items.filter(i => i.opensOn <= iso)
  const upcoming = items.filter(i => i.opensOn > iso).sort((a, b) => a.opensOn.localeCompare(b.opensOn))
  return {
    today: iso,
    total: items.length,
    openNow: open.length,
    next: upcoming[0] || null,
    items,
  }
}
