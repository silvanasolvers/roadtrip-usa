// Datos reales de la ruta — extraídos del enlace de Google Maps de Valentin
// y validados con OSRM para distancias exactas por tramo.
// Fuente: https://maps.app.goo.gl/x5T75ni1JyGSMEra6
// Ruta: BOG/Medellín -> LAS (Las Vegas) -> Page -> Zion -> Bakersfield ->
//       Three Rivers (Sequoia) -> Oakhurst -> Yosemite -> American Canyon ->
//       Napa -> Golden Gate -> SFO

export const PEOPLE = [
  { id: 'jara', name: 'Jara', initials: 'JA', color: '#e8734a' },
  { id: 'cata', name: 'Cata', initials: 'CA', color: '#4a9ee8' },
  { id: 'negro', name: 'Negro', initials: 'NE', color: '#8b6fd4' },
  { id: 'dani', name: 'Dani', initials: 'DA', color: '#3fb98a' },
  { id: 'cuartas', name: 'Cuartas', initials: 'CU', color: '#d4a33f' },
  { id: 'florez', name: 'Florez', initials: 'FL', color: '#e85d8a' },
  { id: 'toro', name: 'Toro', initials: 'TO', color: '#5ec4d4' },
  { id: 'majo', name: 'Majo', initials: 'MA', color: '#c4574a' },
]

export const ADMINS = ['jara', 'cata']

// Foto de cada parada. Son imágenes de Wikimedia Commons con licencia libre
// (dominio público o CC), recortadas a 16:10 y guardadas en el propio servidor:
// el tablero tiene que abrir sin señal en Zion, Yosemite y la carretera de Page.
// Créditos completos en /creditos.
export const PHOTOS = {
  hero: '/photos/hero.jpg',
  las: '/photos/lasvegas.jpg',
  page: '/photos/page.jpg',
  zion: '/photos/zion.jpg',
  yosemite: '/photos/yosemite.jpg',
  napa: '/photos/napa.jpg',
  goldengate: '/photos/goldengate.jpg',
  threerivers: '/photos/sequoia.jpg',
}

// Precio objetivo por persona, ida y vuelta. El viaje es open-jaw (llegan a Las
// Vegas, salen de San Francisco), así que se compara contra la suma de los dos
// trayectos cotizados por separado.
export const TARGET_COP = 2000000

export const TRIP = {
  title: 'Roadtrip USA',
  subtitle: 'Las Vegas → Page → Zion → Sequoia → Yosemite → Napa → San Francisco',
  originAirports: ['BOG', 'MDE'],
  year: 2027,
  // 15 días de viaje. Las fechas exactas siguen flexibles: se esperan buenos
  // precios, pero la duración ya está definida.
  durationDays: 15,
  dateWindow: { from: '2027-08-01', to: '2027-10-31' },
  routeUrl: 'https://maps.app.goo.gl/x5T75ni1JyGSMEra6',
  totalMiles: 1368,
  totalDriveHours: 28.7,
  // Precio objetivo por persona, ida y vuelta. El viaje es open-jaw (entran por
  // LAS, salen por SFO), así que se compara contra la suma de los dos trayectos.
  targetCop: 2000000,
  currencies: { copPerUsdFallback: 3114 },
}

// Google Flights solo cotiza vuelos dentro de una ventana de ~11 meses. Pedir
// fechas más lejanas devuelve FlightsNotFound y un error rojo inútil. Estas
// funciones calculan el grid de fechas en tiempo de ejecución — nunca
// hardcodeado — y exponen cuándo se va "acoplando" cada fecha conforme el
// horizonte de reserva avanza.
export const BOOKING_HORIZON_DAYS = 330

export function daysUntil(dateStr, from = new Date()) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const f = new Date(from.toISOString().slice(0, 10) + 'T00:00:00Z')
  return Math.round((d - f) / 86400000)
}

// Última fecha que Google ya puede cotizar hoy.
export function lastBookableDate(from = new Date()) {
  const d = new Date(from.getTime() + BOOKING_HORIZON_DAYS * 86400000)
  return d.toISOString().slice(0, 10)
}

export function addDays(dateStr, n) {
  return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + n * 86400000)
    .toISOString().slice(0, 10)
}

// PLAN COMPLETO de consulta: cada fecha de salida del viaje con su regreso, si
// ya es consultable hoy, y la fecha exacta en que lo será. Es lo que el tablero
// muestra para que se vea el horizonte acoplándose mes a mes, en vez de solo
// decir "todavía no".
export function bookingPlan(step = 1, from = new Date()) {
  const { from: start, to: end } = TRIP.dateWindow
  const len = TRIP.durationDays || 15
  const today = from.toISOString().slice(0, 10)
  const horizon = lastBookableDate(from)
  const out = []
  const cur = new Date(`${start}T00:00:00Z`)
  const stop = new Date(`${end}T00:00:00Z`)
  while (cur <= stop) {
    const dep = cur.toISOString().slice(0, 10)
    const ret = addDays(dep, len)
    out.push({
      dep, ret,
      // La fecha se vuelve consultable cuando el horizonte alcanza el REGRESO:
      // no basta con que la ida entre, porque entonces falta el vuelo de vuelta.
      active: ret <= horizon,
      opensOn: addDays(ret, -BOOKING_HORIZON_DAYS),
      monthsAhead: Math.round((new Date(`${dep}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / (30.44 * 86400000) * 10) / 10,
    })
    cur.setUTCDate(cur.getUTCDate() + step)
  }
  return out
}

// Grid de fechas a consultar: solo las que ya son cotizables por completo.
// Requiere que el viaje COMPLETO (ida + duración) entre en el horizonte; si la
// salida se cotiza pero el regreso no, el resultado son cero combinaciones y un
// error rojo inútil.
export function bookingDateGrid(step = 1, from = new Date()) {
  return bookingPlan(step, from).filter(f => f.active).map(f => f.dep)
}

// Cuándo aparece el primer precio consultable y cuántas fechas se van sumando
// cada mes. Alimenta el aviso y el plan que ve el usuario: el punto es mostrar
// el horizonte acoplándose solo, no un simple "todavía no".
export function bookingTimeline(from = new Date()) {
  const plan = bookingPlan(1, from)
  const horizon = lastBookableDate(from)
  const active = plan.filter(f => f.active)

  // La primera fecha de salida se vuelve consultable cuando el horizonte alcanza
  // su REGRESO (ida + duración): antes de eso falta el vuelo de vuelta.
  const first = plan[0]

  // Reparto por mes natural: cuántas fechas se estrenan en cada mes.
  const byMonth = new Map()
  for (const f of plan) {
    const m = f.opensOn.slice(0, 7)
    if (!byMonth.has(m)) byMonth.set(m, { month: m, newlyActive: 0, cumulative: 0 })
    byMonth.get(m).newlyActive++
  }
  let cum = 0
  const schedule = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
  for (const s of schedule) {
    cum += s.newlyActive
    s.cumulative = cum
  }

  return {
    horizon,
    today: from.toISOString().slice(0, 10),
    totalDates: plan.length,
    activeDates: active.length,
    pendingDates: plan.length - active.length,
    firstOutbound: first?.dep || null,
    firstReturn: first?.ret || null,
    firstFaresOn: first?.opensOn || null,
    daysToFirstFares: first ? daysUntil(first.opensOn, from) : null,
    // Mes en que el viaje completo queda consultable.
    fullyBookableFrom: schedule.length ? schedule[schedule.length - 1].month : null,
    schedule,
  }
}

export const STOPS = [
  {
    id: 'las',
    order: 0,
    name: 'Las Vegas',
    place: 'Harry Reid International Airport (LAS)',
    state: 'Nevada',
    lat: 36.0830907,
    lon: -115.1482238,
    nights: 1,
    kind: 'llegada',
    tagline: 'Punto de entrada. Recoger vehículos y dormir cerca del aeropuerto.',
    driveFromPrev: null,
    driveHours: 0,
    mustDo: [
      'Recoger los 2 vehículos (reserva one-way LAS → SFO)',
      'Comprar SIM/eSIM de datos para todos',
      'Comprar nevera, agua y snacks para la carretera',
      'Verificar el equipo de camping/parque si aplica',
    ],
    warnings: [
      '8 personas + maletas NO caben en un vehículo. Mínimo 2 vehículos: dos minivan 7 pax o dos SUV full size.',
      'El one-way a SFO casi siempre cobra drop-off fee. Cotizar antes de reservar.',
    ],
    costNotes: 'Hotel cerca de LAS. Ojo con resort fees en el Strip.',
  },
  {
    id: 'page',
    order: 1,
    name: 'Page',
    place: 'Page, Arizona',
    state: 'Arizona',
    lat: 36.9147222,
    lon: -111.4558333,
    nights: 2,
    kind: 'parada',
    tagline: 'Base de los slot canyons, el lago Powell y el mirador más fotografiado del suroeste.',
    driveFromPrev: 'Las Vegas',
    driveHours: 5.5,
    driveMiles: 280,
    mustDo: [
      'Antelope Canyon — tour guiado OBLIGATORIO, reservar con días/semanas de anticipación',
      'Horseshoe Bend — $10 por carro, caminata 0.7 mi sin sombra, mejor luz 4:30–6:00 pm',
      'Lake Powell — miradores y, si alcanza el tiempo, kayak o paseo en bote',
      'Glen Canyon Dam overlook',
    ],
    warnings: [
      'Antelope Canyon es territorio Navajo: solo con tour guiado, sin drones, sin trípodes, sin bolsos grandes. Se agota.',
      'Horseshoe Bend NO requiere reserva ni guía, solo el pago del parqueadero.',
    ],
    costNotes: 'Tour Antelope ~$15 entry + costo del tour por persona. Parqueadero Horseshoe $10/carro.',
  },
  {
    id: 'zion',
    order: 2,
    name: 'Zion',
    place: 'Zion Canyon Visitor Center, Springdale, UT',
    state: 'Utah',
    lat: 37.2000925,
    lon: -112.9869847,
    nights: 2,
    kind: 'parque',
    tagline: 'Cañón de arenisca roja, paredes verticales y el hike más famoso (y expuesto) de Utah.',
    driveFromPrev: 'Page',
    driveHours: 2.7,
    driveMiles: 116,
    mustDo: [
      'Angels Landing — requiere permiso de lotería',
      'The Narrows — caminata dentro del río (agua fría, se requiere equipo)',
      'Scenic Drive en shuttle (o e-bike)',
      'Emerald Pools / Watchman Trail si el tiempo aprieta',
    ],
    warnings: [
      'CRÍTICO: durante la temporada de shuttle (aprox. 7 mar – 28 nov) el Scenic Drive es SOLO shuttle. No hay excepción para carro propio, ni llegando temprano.',
      'CRÍTICO — Angels Landing exige permiso TODOS los días del año, sin excepción. Hay dos loterías en Recreation.gov: la ESTACIONAL (se aplica con meses de anticipación) y la DAY-BEFORE (12:01 a.m. a 3:00 p.m. hora de Utah del día anterior, resultados 4:00 p.m.). Si van en temporada alta, entren a la lotería estacional en cuanto abra: los cupos se agotan.',
      'Las fechas exactas de 2027 aún no están publicadas. En 2026 la lotería estacional funcionó así: feb para mar–may, abr para jun–ago, jul para sep–nov, oct para dic–feb. El calendario se replica cada año, así que hay que revisar Recreation.gov unos 6 meses antes.',
      'El permiso es intransferible y el titular debe estar presente. No se consigue en oficinas del parque, solo online en Recreation.gov.',
      'Todos deben empezar juntos en el Grotto Trailhead. El permiso es de un solo día.',
      'Sin señal en el sendero: guardar el permiso en el celular ANTES de subir.',
    ],
    costNotes: 'Permiso: $6 por grupo (hasta 6 personas) + $3 por persona si los seleccionan. Hiking 5.4 mi ida y vuelta, 1,488 ft de desnivel.',
  },
  {
    id: 'bakersfield',
    order: 3,
    name: 'Bakersfield',
    place: 'Bakersfield, California',
    state: 'California',
    lat: 35.3733492,
    lon: -119.020061,
    nights: 1,
    kind: 'traslado',
    tagline: 'Solo parada técnica para partir el tramo más largo hacia Sequoia. No es destino turístico.',
    driveFromPrev: 'Zion',
    driveHours: 8.4,
    driveMiles: 449,
    mustDo: [
      'Salir muy temprano de Zion — este es el día más largo del viaje (8.4 h de manejo)',
      'Rotar conductores cada 2 h',
      'Dormir temprano para madrugar hacia Sequoia',
    ],
    warnings: [
      'Día demoledor: 449 mi / 8.4 h. Con 8 personas y 2 carros, sumar paradas hace que sean 10-11 h reales.',
      'No hay nada imperdible aquí. El objetivo es llegar y descansar.',
    ],
    costNotes: 'Hotel barato de paso. Mucho más económico que dormir dentro del parque.',
  },
  {
    id: 'threerivers',
    order: 4,
    name: 'Three Rivers',
    place: 'Three Rivers, CA — puerta de Sequoia',
    state: 'California',
    lat: 36.4388364,
    lon: -118.9045445,
    nights: 1,
    kind: 'parque',
    tagline: 'Entrada sur de Sequoia por la Highway 198 (Ash Mountain).',
    driveFromPrev: 'Bakersfield',
    driveHours: 1.9,
    driveMiles: 89,
    mustDo: [
      'General Sherman — el árbol más grande del mundo por volumen',
      'Congress Trail',
      'Moro Rock — subida con escaleras y vista 360',
      'Tunnel Log y Crescent Meadow',
    ],
    warnings: [
      'La entrada a Sequoia es SIN reserva de horario, pero el pago de entrada es obligatorio.',
      'Los túneles y la carretera tienen límite de altura: verificar el vehículo si alquilan algo grande.',
      'Generals Highway hacia Oakhurst es LENTA y muy curva. No planear como si fuera autopista.',
    ],
    costNotes: 'Entrada $35 por vehículo, válida 7 días y cubre Sequoia + Kings Canyon. Solo tarjeta, el parque NO recibe efectivo. Crystal Cave requiere reserva aparte.',
  },
  {
    id: 'oakhurst',
    order: 5,
    name: 'Oakhurst',
    place: 'Oakhurst, CA — puerta sur de Yosemite',
    state: 'California',
    lat: 37.3279997,
    lon: -119.6493154,
    nights: 1,
    kind: 'traslado',
    tagline: 'Última ciudad con servicios completos antes de Yosemite. Base sur.',
    driveFromPrev: 'Three Rivers',
    driveHours: 2.5,
    driveMiles: 117,
    mustDo: [
      'Abastecer de comida y agua: dentro del valle es caro y escaso',
      'Cargar gasolina',
      'Verificar el clima del valle (puede cambiar rápido)',
    ],
    warnings: [
      'El tramo Three Rivers → Oakhurst por Generals Highway es el más lento del viaje por lo sinuoso.',
      'Dormir aquí y entrar al valle de madrugada es la mejor jugada.',
    ],
    costNotes: 'Alojamiento más barato que dentro del parque. Restaurantes y supermercado completos.',
  },
  {
    id: 'yosemite',
    order: 6,
    name: 'Yosemite',
    place: 'Yosemite Valley Welcome Center',
    state: 'California',
    lat: 37.7465139,
    lon: -119.5842598,
    nights: 2,
    kind: 'parque',
    tagline: 'El valle glaciar con las paredes de granito más icónicas de Estados Unidos.',
    driveFromPrev: 'Oakhurst',
    driveHours: 1.5,
    driveMiles: 48,
    mustDo: [
      'Tunnel View (mejor vista clásica, gratis desde la carretera)',
      'El Capitán — mirador desde el valle',
      'Glacier Point (si la carretera está abierta)',
      'Lower Yosemite Fall y el valle en bici o shuttle',
      'Hike a Vernal/Nevada Fall si el grupo está en forma',
    ],
    warnings: [
      'Yosemite: los últimos años no exige timed-entry ni reserva de vehículo (se entra pagando la entrada), pero la política se revisa cada año — confirmar antes de viajar.',
      'PERO el parqueadero del valle se llena a media mañana. Entrar temprano es obligatorio en la práctica.',
      'El parque es 100% cashless.',
      'El shuttle del valle es gratis y es la mejor forma de moverse sin pelear por parqueadero.',
    ],
    costNotes: 'Entrada $35 por vehículo, válida 7 días. Lodging dentro del valle se agota con muchos meses de anticipación.',
  },
  {
    id: 'americancanyon',
    order: 7,
    name: 'American Canyon',
    place: 'American Canyon, CA',
    state: 'California',
    lat: 38.1749178,
    lon: -122.2608044,
    nights: 1,
    kind: 'traslado',
    tagline: 'Base norte de la bahía, a minutos de Napa. Alojamiento más económico que Napa mismo.',
    driveFromPrev: 'Yosemite',
    driveHours: 4.7,
    driveMiles: 185,
    mustDo: [
      'Llegar y descansar después de la salida del parque',
      'Comprar vino o provisiones en American Canyon (más barato que Napa)',
    ],
    warnings: [
      'Salir de Yosemite por la tarde alarga el tramo: calcular 5.5–6 h reales.',
      'Es zona de bodegas: si alguien va a tomar, el conductor designado conduce.',
    ],
    costNotes: 'Hoteles notablemente más baratos que en Napa. Verificar horario de check-in.',
  },
  {
    id: 'napa',
    order: 8,
    name: 'Napa',
    place: 'Napa, California',
    state: 'California',
    lat: 38.2975381,
    lon: -122.286865,
    nights: 1,
    kind: 'parada',
    tagline: 'Valle de bodegas. Día de turismo gastronómico y vino.',
    driveFromPrev: 'American Canyon',
    driveHours: 0.2,
    driveMiles: 9,
    mustDo: [
      'Wine tasting en 1–3 bodegas (reservar, muchos se llenan)',
      'Almorzar en el centro de Napa o Yountville',
      'Castello di Amorosa o Domaine Carneros si quieren algo más turístico',
    ],
    warnings: [
      'Muchas catas exigen reserva previa, especialmente en fin de semana.',
      'Cuidado con el orden conductor/degustación. Rotar quién conduce.',
      'Napa es caro: definir presupuesto y número de catas por persona.',
    ],
    costNotes: 'Catas $40–$80+ por persona según bodega. Comida en Napa es el gasto más alto del día.',
  },
  {
    id: 'goldengate',
    order: 9,
    name: 'Golden Gate',
    place: 'Golden Gate Bridge, San Francisco',
    state: 'California',
    lat: 37.6145318,
    lon: -122.3853714,
    nights: 0,
    kind: 'hito',
    tagline: 'Cierre simbólico del roadtrip. Foto grupal obligatoria.',
    driveFromPrev: 'Napa',
    driveHours: 1.3,
    driveMiles: 59,
    mustDo: [
      'Foto grupal en el mirador (Vista Point o Battery Spencer del lado norte)',
      'Battery Spencer: la mejor foto con el puente de frente',
      'Cruzar el puente manejando de norte a sur',
    ],
    warnings: [
      'El peaje se cobra en dirección sur (entrando a SF). Verificar si el auto alquilado lo trae prepago.',
      'Neblina: si está nublado, esperar 30–60 min porque abre y cierra rápido.',
    ],
    costNotes: 'Parqueadero gratis en Battery Spencer (limitado). Peaje del puente ~$9–10.',
  },
  {
    id: 'sfo',
    order: 10,
    name: 'SFO',
    place: 'Terminal 1, San Francisco International Airport',
    state: 'California',
    lat: 37.61625,
    lon: -122.38345,
    nights: 0,
    kind: 'salida',
    tagline: 'Vuelo de regreso a Colombia. Entregar los vehículos.',
    driveFromPrev: 'Golden Gate',
    driveHours: 0.4,
    driveMiles: 16,
    mustDo: [
      'Devolver los 2 vehículos (verificar política de tanque lleno)',
      'Llegar 3 h antes por ser vuelo internacional',
      'Documentar el estado de los autos con fotos antes de entregar',
    ],
    warnings: [
      'FOTOS de los vehículos antes de entregar: es la única defensa ante cobros por daños.',
      'Verificar si el drop-off one-way ya está pagado en la reserva o se cobra al entregar.',
      'Gasolinera más cercana al aeropuerto para llenar el tanque (ahorrar el sobrecargo).',
    ],
    costNotes: 'Recargo one-way y limpieza si el auto va muy sucio.',
  },
]

// Checklist base — se puede editar desde la app
export const CHECKLIST_SEED = [
  { id: 'c1', label: 'Cotizar y reservar vuelos BOG/MDE → LAS y SFO → BOG', category: 'Vuelos', owner: null, done: false },
  { id: 'c2', label: 'Reservar 2 vehículos one-way LAS → SFO (minivan/SUV full size)', category: 'Transporte', owner: null, done: false },
  { id: 'c3', label: 'Cotizar drop-off fee del alquiler one-way', category: 'Transporte', owner: null, done: false },
  { id: 'c4', label: 'Reservar Antelope Canyon (Page) — se agota con anticipación', category: 'Tours', owner: null, done: false },
  { id: 'c5', label: 'Aplicar lotería day-before de Angels Landing (Zion)', category: 'Permisos', owner: null, done: false },
  { id: 'c6', label: 'Reservar alojamiento Las Vegas (1 noche)', category: 'Alojamiento', owner: null, done: false },
  { id: 'c7', label: 'Reservar alojamiento Page (2 noches)', category: 'Alojamiento', owner: null, done: false },
  { id: 'c8', label: 'Reservar alojamiento Springdale/Zion (2 noches)', category: 'Alojamiento', owner: null, done: false },
  { id: 'c9', label: 'Reservar alojamiento Bakersfield (1 noche)', category: 'Alojamiento', owner: null, done: false },
  { id: 'c10', label: 'Reservar alojamiento Three Rivers / Sequoia (1 noche)', category: 'Alojamiento', owner: null, done: false },
  { id: 'c11', label: 'Reservar alojamiento Oakhurst (1 noche)', category: 'Alojamiento', owner: null, done: false },
  { id: 'c12', label: 'Reservar alojamiento Yosemite (2 noches) — se agota muy rápido', category: 'Alojamiento', owner: null, done: false },
  { id: 'c13', label: 'Reservar alojamiento American Canyon (1 noche)', category: 'Alojamiento', owner: null, done: false },
  { id: 'c14', label: 'Reservar alojamiento Napa (1 noche)', category: 'Alojamiento', owner: null, done: false },
  { id: 'c15', label: 'Reservar catas de vino en Napa', category: 'Tours', owner: null, done: false },
  { id: 'c16', label: 'Tramitar visa/ESTA o verificar vigencia de visa americana', category: 'Documentos', owner: null, done: false },
  { id: 'c17', label: 'Seguro de viaje para los 8', category: 'Documentos', owner: null, done: false },
  { id: 'c18', label: 'eSIM / plan de datos para USA', category: 'Documentos', owner: null, done: false },
  { id: 'c19', label: 'Definir quién conduce en cada tramo', category: 'Logística', owner: null, done: false },
  { id: 'c20', label: 'Definir fondo común y quién adelanta pagos', category: 'Dinero', owner: null, done: false },
  { id: 'c21', label: 'Comprar America the Beautiful pass (si visitan 3+ parques)', category: 'Permisos', owner: null, done: false },
  { id: 'c22', label: 'Verificar altura del vehículo para túneles de Sequoia', category: 'Logística', owner: null, done: false },
]

export const CATEGORIES = ['Vuelos', 'Transporte', 'Alojamiento', 'Tours', 'Permisos', 'Documentos', 'Logística', 'Dinero', 'Varios']

export const WIKI = [
  {
    id: 'dinero',
    title: 'Dinero, propinas y fondo común',
    items: [
      'Tarjeta: casi todo se paga con tarjeta. Los parques nacionales son 100% cashless.',
      'Efectivo: tener $100–200 por persona para propinas, peajes pequeños y emergencias.',
      'Propina estándar en USA: 18–20% en restaurantes con servicio, $1–2 por trago en bar, $2–5/día por limpieza de hotel.',
      'Fondo común: mejor que una persona pague y luego se dividan por la app. Nunca pagar todo "de a uno" sin registrar.',
      'Registrar TODO gasto compartido: gasolina, peajes, hotel, entradas, tours, comida grupal. Los gastos personales (souvenirs, alcohol propio) no van al fondo.',
    ],
  },
  {
    id: 'vehiculos',
    title: 'Vehículos y conducción',
    items: [
      'MÍNIMO 2 vehículos para 8 personas + equipaje. Un solo vehículo NO funciona.',
      'Licencia colombiana: es aceptada para visitantes, pero debe estar en vigor y acompañarse del pasaporte. Recomendado llevar la licencia internacional de conducción como respaldo.',
      'Conductores adicionales: declararlos al recoger el vehículo. Si conduce alguien no declarado, el seguro puede no cubrir.',
      'Seguro: NO rechazar la cobertura de daños. En USA un golpe menor puede costar miles de dólares.',
      'Gasolina: es la más barata del viaje en Nevada/Arizona. En California, y sobre todo cerca de Yosemite, es la más cara. Llenar antes de entrar al parque.',
      'Peajes: casi no hay en esta ruta, excepto el Golden Gate en dirección a San Francisco. Verificar el prepago con el arrendador.',
      'Manejar cansado es el riesgo real de esta ruta. Rotar cada 2 h y no manejar de noche en tramos de montaña.',
    ],
  },
  {
    id: 'parques',
    title: 'Reglas de parques nacionales',
    items: [
      'Yosemite: entrada $35/carro, 100% cashless. Los últimos años no exige timed-entry; confirmar la política del año antes de viajar.',
      'Sequoia & Kings Canyon: sin timed-entry. Entrada $35/carro cubre ambos, válida 7 días, cashless.',
      'Zion: en temporada de shuttle (aprox. 7 mar – 28 nov) el Scenic Drive es solo shuttle, sin excepción. Se puede hacer en bici.',
      'Zion / Angels Landing: permiso obligatorio todos los días, solo online en Recreation.gov, intransferible. Entrar a la lotería estacional con meses de anticipación.',
      'Antelope Canyon (Page): solo con tour guiado de operadores Navajo. Sin drones, trípodes ni bolsos grandes.',
      'America the Beautiful pass: vale la pena si van a 3+ parques. Cubre la entrada, no camping ni tours.',
      'Todos los parques: no dejar comida en el carro visible (animales), no salirse del sendero, no drones.',
      'Llevar capas: en Yosemite y Zion la temperatura del amanecer puede estar 15°C por debajo del mediodía.',
    ],
  },
  {
    id: 'celular',
    title: 'Señal, GPS y apps',
    items: [
      'NO hay señal en Zion Canyon, en Yosemite Valley ni en la carretera de Page. Esto no es exageración.',
      'Descargar mapas offline de Google Maps para todo el suroeste ANTES de salir.',
      'Descargar los permisos y reservas como PDF/imagen en el celular, no depender de abrir correos sin señal.',
      'Compartir ubicación en tiempo real entre los 8 por si se separan los vehículos.',
      'El vehículo que va atrás debe tener copia del itinerario impreso o guardado.',
      'Cargadores de carro para todos: 2 por vehículo mínimo. Batería portátil por persona.',
    ],
  },
]

export const PACKING_SEED = [
  { id: 'p1', label: 'Pasaporte vigente (+6 meses)', category: 'Documentos', everyone: true },
  { id: 'p2', label: 'Visa / ESTA vigente', category: 'Documentos', everyone: true },
  { id: 'p3', label: 'Licencia de conducción', category: 'Documentos', everyone: true },
  { id: 'p4', label: 'Licencia internacional de conducción', category: 'Documentos', everyone: false },
  { id: 'p5', label: 'Seguro de viaje impreso', category: 'Documentos', everyone: true },
  { id: 'p6', label: 'Tarjetas de crédito (2, de diferente banco)', category: 'Dinero', everyone: true },
  { id: 'p7', label: 'Dólares en efectivo ($150-200)', category: 'Dinero', everyone: true },
  { id: 'p8', label: 'Botas o zapatos de hiking', category: 'Ropa', everyone: true },
  { id: 'p9', label: 'Chaqueta abrigada / rompevientos', category: 'Ropa', everyone: true },
  { id: 'p10', label: 'Gorra y gafas de sol', category: 'Ropa', everyone: true },
  { id: 'p11', label: 'Traje de baño', category: 'Ropa', everyone: true },
  { id: 'p12', label: 'Sudadera / capas térmicas', category: 'Ropa', everyone: true },
  { id: 'p13', label: 'Bloqueador solar SPF 50+', category: 'Salud', everyone: true },
  { id: 'p14', label: 'Medicamentos personales (con fórmula)', category: 'Salud', everyone: true },
  { id: 'p15', label: 'Botella de agua reutilizable', category: 'Salud', everyone: true },
  { id: 'p16', label: 'Batería portátil + cables', category: 'Electrónica', everyone: true },
  { id: 'p17', label: 'Adaptador de corriente tipo A/B (USA)', category: 'Electrónica', everyone: true },
  { id: 'p18', label: 'eSIM o SIM americana activada', category: 'Electrónica', everyone: true },
  { id: 'p19', label: 'Toalla de microfibra (Narrows/playa)', category: 'Varios', everyone: true },
  { id: 'p20', label: 'Bolsa impermeable para el celular', category: 'Varios', everyone: true },
  { id: 'p21', label: 'Bastones de trekking (Narrows/Angels Landing)', category: 'Varios', everyone: false },
  { id: 'p22', label: 'Mochila pequeña de día', category: 'Varios', everyone: true },
  { id: 'p23', label: 'Snacks y barras para la carretera', category: 'Varios', everyone: false },
  { id: 'p24', label: 'Nevera portátil y hielera', category: 'Varios', everyone: false },
]
