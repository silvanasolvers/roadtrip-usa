#!/usr/bin/env python3
"""
Fetch Google Flights prices for the roadtrip date window.

Reads a JSON payload on stdin:
  {"routes": [{"from":"BOG","to":"LAS","dates":["2026-10-01", ...]}],
   "adults": 1, "currency": "USD"}

Writes JSON to stdout:
  {"results": [{...}], "errors": [...], "fetchedAt": "..."}

Google Flights is queried through `fast-flights` (no API key required) and the
fallback fetch mode, so this runs headless on the server.

NOTE: the query builder API of fast-flights has moved between releases
(get_flights now takes a Query object, not FlightData kwargs). This script
uses the current create_query/FlightQuery API; if it breaks after an upgrade,
re-check the signature before rewriting the parsing logic.
"""
import json
import sys
import time
import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from fast_flights import FlightQuery, Passengers, create_query, get_flights
except Exception as exc:  # pragma: no cover - surfaced to the caller
    print(json.dumps({"results": [], "errors": [f"import fast_flights: {exc}"]}))
    sys.exit(0)


def one_way(origin, dest, date, adults, currency, language):
    """Cheapest itineraries for a single date. Returns a list of dicts."""
    q = create_query(
        flights=[FlightQuery(date=date, from_airport=origin, to_airport=dest)],
        trip="one-way",
        seat="economy",
        passengers=Passengers(adults=adults),
        currency=currency,
        language=language,
    )
    result = get_flights(q)

    out = []
    for group in result:
        segments = group.flights
        if not segments:
            continue
        out.append({
            "usd": group.price,
            "stops": len(segments) - 1,
            "durMin": sum(s.duration for s in segments),
            "airlines": list(group.airlines or []),
            "dep": f"{segments[0].departure.time[0]:02d}:{segments[0].departure.time[1]:02d}",
            "arr": f"{segments[-1].arrival.time[0]:02d}:{segments[-1].arrival.time[1]:02d}",
            "via": [s.to_airport.code for s in segments[:-1]],
        })

    # Cheapest by actual fare, then fewest stops, then shortest.
    out.sort(key=lambda x: (x["usd"], x["stops"], x["durMin"]))
    return out[0] if out else None


def main():
    payload = json.load(sys.stdin)
    routes = payload.get("routes", [])
    adults = int(payload.get("adults", 1))
    currency = payload.get("currency", "USD")
    language = payload.get("language", "es-419")
    delay = float(payload.get("delaySeconds", 0.4))

    tasks = []
    for route in routes:
        for date in route.get("dates", []):
            tasks.append((route.get("from"), route.get("to"), date))

    results, errors = [], []

    def work(task):
        origin, dest, date = task
        # A short stagger keeps Google from rate-limiting bursts of queries.
        time.sleep(delay * (hash(date + origin) % 5))
        best = one_way(origin, dest, date, adults, currency, language)
        if not best:
            return {"error": f"sin resultados {origin}->{dest} {date}"}
        return {
            "from": origin, "to": dest, "date": date,
            "usd": best["usd"],
            "stops": best["stops"], "durMin": best["durMin"],
            "airlines": best["airlines"], "dep": best["dep"], "arr": best["arr"],
            "via": best["via"],
        }

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(work, t): t for t in tasks}
        for fut in as_completed(futures):
            try:
                r = fut.result()
                if "error" in r:
                    errors.append(r["error"])
                else:
                    results.append(r)
            except Exception as exc:
                o, d, dt = futures[fut]
                errors.append(f"{o}->{d} {dt}: {type(exc).__name__}: {exc}")

    results.sort(key=lambda r: (r["date"], r["from"]))
    print(json.dumps({
        "results": results,
        "errors": errors,
        "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }))


if __name__ == "__main__":
    main()
