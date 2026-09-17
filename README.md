# Roadtrip USA 2026 — tablero del viaje

Tablero compartido para el roadtrip **Las Vegas → Page → Zion → Sequoia → Yosemite → Napa → San Francisco**.

Ruta original: https://maps.app.goo.gl/x5T75ni1JyGSMEra6

## Qué trae

- **Inicio** — fechas, distancia, manejo total, progreso de preparación y advertencias críticas.
- **Itinerario** — las 11 paradas con distancias/horas reales por tramo, qué hacer, advertencias, costo y notas del grupo.
- **Mapa** — proyección propia de la ruta con paradas clicables (sin dependencias externas, funciona offline).
- **Vuelos** — precios reales de Google Flights por fecha, para decidir cuándo comprar.
- **Checklist** — tareas de preparación con responsable y estado.
- **Gastos** — quién pagó qué, división por subconjunto del grupo y liquidación minimizada.
- **Maletas** — packing list compartida, cada persona marca lo suyo.
- **Documentos** — reservas, tiquetes y pases subidos por cualquiera.
- **Info** — dinero/propinas, vehículos, reglas de parques y señal/GPS.

## Por qué así

- **Multi-usuario real:** el estado vive en el servidor (`data/store.json`), no en el navegador. Los 8 ven lo mismo, con polling cada 8 s que se pausa mientras hay una escritura en vuelo.
- **Offline:** es una PWA con service worker. En Zion Canyon, Yosemite Valley y la carretera de Page no hay señal; el tablero abre y muestra el último estado sincronizado.
- **Sin dependencias de mapas:** el mapa es un SVG con proyección equirectangular. Nada de Google Maps SDK, nada de API keys, y funciona sin red.

## Comandos

```bash
npm install
npm run build          # build del front
npm start              # sirve dist/ + API en :3000
npm run check          # verifica datos de ruta, matemática de gastos y artefactos

# verificación con API viva
CHECK_API=http://localhost:3000 npm run check

# consulta manual de precios de vuelo (requiere fast-flights en ese intérprete)
echo '{"routes":[{"from":"BOG","to":"LAS","dates":["2026-10-15"]}]}' \
  | python3 scripts/fetch-flights.py
```

## Variables de entorno

| Variable | Para qué |
|---|---|
| `PORT` | Puerto del runtime (default 3000) |
| `FLIGHT_PYTHON` | Intérprete con `fast-flights` para el endpoint manual `POST /api/flights/refresh` |
| `FLIGHT_PUSH_SECRET` | Secreto compartido que exige `POST /api/flights/push` |

## Datos de la ruta

Todo el contenido del viaje está en `src/data/trip.js`: personas, paradas, checklist, packing y wiki.
Los datos duros (distancias y tiempos por tramo) salieron de OSRM sobre las coordenadas reales de las paradas.

Los avisos operativos (shuttle de Zion, lotería de Angels Landing, timed-entry de Yosemite, tarifas de parques, tours de Antelope Canyon) están verificados contra NPS y operadores, con fecha de verificación en el propio texto.
