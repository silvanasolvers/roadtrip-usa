#!/usr/bin/env python3
"""
Flight prices for the roadtrip, including its open-jaw shape.

The trip is NOT a round trip: the group arrives at Las Vegas (LAS) and leaves
from San Francisco (SFO). That makes it an open-jaw itinerary.

Important finding: Google Flights' multi-city payload cannot be read by
`fast-flights`. Its parser assumes the round-trip structure (it reads
itineraries from payload[3][0] and airline metadata from payload[7][1][1]),
while a multi-city response puts None in payload[3] and never ships itineraries
in that slot at all — so it raises IndexError. There is no flag that fixes it.

So this script prices the open-jaw as what it actually is in practice: two
one-way searches, outbound and return, reported individually and then combined
into the best date pair. Two separate tickets is also frequently the cheapest
way to fly open-jaw, so this is a competitive estimate rather than a worse one.
The combined figure is labelled as such in the API and the UI.

Reads JSON on stdin:
  {"outbound": {"from":"BOG","to":"LAS","dates":["2026-10-10", ...]},
   "returns":  {"from":"SFO","to":"BOG","dates":["2026-10-28", ...]},
   "adults": 1, "currency": "USD", "targetCop": 2000000}

Writes JSON on stdout:
  {"legs": [...], "combos": [...], "cheapestCombo": {...},
   "rate": {...}, "target": {...}, "errors": [...], "fetchedAt": "..."}
"""
import json
import sys
import time
import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from fast_flights import FlightQuery, Passengers, create_query, get_flights
except Exception as exc:  # pragma: no cover - surfaced to the caller
    print(json.dumps({"legs": [], "combos": [], "errors": [f"import fast_flights: {exc}"]}))
    sys.exit(0)


def cheapest_one_way(origin, dest, date, adults, currency, language):
    """Cheapest itinerary for one date, or None."""
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


def usd_cop_rate():
    """Live USD->COP rate so the COP target stays comparable to USD fares."""
    import urllib.request
    try:
        with urllib.request.urlopen("https://open.er-api.com/v6/latest/USD", timeout=20) as r:
            d = json.load(r)
        return {"cop": d["rates"]["COP"], "source": "open.er-api.com",
                "at": d.get("time_last_update_utc")}
    except Exception as exc:
        return {"cop": None, "error": str(exc)}


def main():
    payload = json.load(sys.stdin)
    outbound = payload.get("outbound", {})
    returns = payload.get("returns", {})
    adults = int(payload.get("adults", 1))
    currency = payload.get("currency", "USD")
    language = payload.get("language", "es-419")
    delay = float(payload.get("delaySeconds", 0.4))
    target_cop = payload.get("targetCop")

    tasks = []
    for date in outbound.get("dates", []):
        tasks.append(("out", outbound.get("from"), outbound.get("to"), date))
    for date in returns.get("dates", []):
        tasks.append(("ret", returns.get("from"), returns.get("to"), date))

    legs, errors = [], []

    def work(task):
        kind, origin, dest, date = task
        # A short stagger keeps Google from rate-limiting bursts of queries.
        time.sleep(delay * (hash(date + origin) % 5))
        best = cheapest_one_way(origin, dest, date, adults, currency, language)
        if not best:
            return {"error": f"sin resultados {origin}->{dest} {date}"}
        return {
            "leg": kind, "from": origin, "to": dest, "date": date,
            "usd": best["usd"], "stops": best["stops"], "durMin": best["durMin"],
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
                    legs.append(r)
            except Exception as exc:
                k, o, d, dt = futures[fut]
                errors.append(f"{o}->{d} {dt}: {type(exc).__name__}: {exc}")

    legs.sort(key=lambda r: (r["leg"], r["date"]))

    # Combine every outbound with every valid return into an open-jaw estimate.
    outs = [l for l in legs if l["leg"] == "out"]
    rets = [l for l in legs if l["leg"] == "ret"]
    combos = []
    for o in outs:
        for r in rets:
            if r["date"] <= o["date"]:
                continue  # a return can never leave before the outbound
            combos.append({
                "usd": round(o["usd"] + r["usd"], 2),
                "outDate": o["date"], "retDate": r["date"],
                "outbound": o, "return": r,
                "days": (datetime.date.fromisoformat(r["date"])
                         - datetime.date.fromisoformat(o["date"])).days,
                "stops": o["stops"] + r["stops"],
            })
    combos.sort(key=lambda c: (c["usd"], c["days"]))

    rate = usd_cop_rate()
    target = None
    if target_cop and rate.get("cop"):
        target_usd = target_cop / rate["cop"]
        target = {"cop": target_cop, "usd": round(target_usd, 2),
                  "perLegUsd": round(target_usd / 2, 2)}
        if combos:
            best = combos[0]["usd"]
            target["bestUsd"] = best
            target["bestCop"] = round(best * rate["cop"])
            target["gapUsd"] = round(best - target_usd, 2)
            target["gapPct"] = round((best - target_usd) / target_usd * 100, 1)
            target["met"] = best <= target_usd

    print(json.dumps({
        "legs": legs,
        "combos": combos[:12],
        "cheapestCombo": combos[0] if combos else None,
        "rate": rate,
        "target": target,
        "errors": errors,
        "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }))


if __name__ == "__main__":
    main()
