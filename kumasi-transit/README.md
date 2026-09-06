# Kumasi Transit

Real-time transit information for Kumasi's trotro, shared-taxi and intercity fleets: the working
software behind the KsTU-led seed pilot proposal ("Real-Time Transit Information for Kumasi",
Phases 0–2). Everything is open data, feature-phone first (USSD), and built so that KMA can host
it and KsTU students can maintain it.

| Proposal phase | What this repository delivers | Where |
| --- | --- | --- |
| **Phase 0** data validation | Frequency-based open GTFS builder for the four pilot corridors, a dependency-free GTFS validator (works on the existing DT4A feed too), and a **versioned fare table** tied to GPRTU announcements | `kumasi_transit/gtfs/`, `data/gtfs_seed/`, `data/fares/` |
| **Phase 1** terminal loading status | Station masters report "car for Suame loading at bay 7, half full" over USSD or the terminal app API; passengers query by USSD shortcode (any handset, zero data) or a web page; terminal boards for Kejetia, Asafo, Tech Junction, Suame | `kumasi_transit/loading/`, `/ussd/*`, `/dashboard/terminal/*` |
| **Phase 2** intercity tracking | MQTT → Python asyncio ingest → SQL store (SQLite or PostGIS/TimescaleDB) → map-matching and ETA → **GTFS-Realtime** feed for OpenTripPlanner; free owner dashboards for STC, VIP and Metro Mass; fleet simulator standing in for trackers | `kumasi_transit/tracking/`, `/gtfs-rt/*`, `/dashboard/operator/*` |
| Cadence study (budget line 12) | Analytic model of reporting interval vs. SIM data cost vs. position error, cross-checked by Monte Carlo, plus an **OMNeT++ 6** model of trackers over a lossy cellular link | `kumasi_transit/cadence/`, `omnet/` |
| City view | KMA dashboard: active loading reports, live vehicles, feed validity, fare version | `/` |

## Quick start (laptop, no Docker)

```bash
cd kumasi-transit
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest                          # 39 tests
scripts/demo.sh                 # seeds SQLite, builds GTFS, simulates the fleet, serves on :8000
```

Then open:

- `http://localhost:8000/` – city dashboard (KMA view)
- `http://localhost:8000/passenger` – "find a car" for smartphones
- `http://localhost:8000/dashboard/terminal/KEJETIA` – Kejetia loading board
- `http://localhost:8000/dashboard/operator/STC` – STC telematics dashboard (map + ETAs)
- `http://localhost:8000/docs` – OpenAPI reference
- `http://localhost:8000/ussd/simulate?phone=0240000001&text=1*1*7*3` – walk the USSD menu

### The USSD service in two minutes

Demo station masters are pre-registered (`data/terminals.json`): `0240000001` Kejetia,
`0240000002` Asafo, `0240000003` Tech Junction, `0240000004` Suame. Any other number is a passenger.

```
Station master 0240000001 dials the code:      Passenger dials the code:
  Kejetia station                                Kumasi Transit
  1 Report car loading                           1 Find a car
  2 Update / departed                            2 Fares
  3 Find a car                                   3 Station master login
  4 Fares
→ 1 → "Car loading to?" 1 Tech Junction        → 1 → "Where are you?" 2 Kejetia
→ bay 7 → "How full?" 3 (1/2 full)             → "Going to?" 1 Tech Junction
  Saved: bay 7 to Tech Junction, half full.      Kejetia > Tech Junction (KNUST)
                                                 Bay 7: half full, just now
                                                 Fare GHS 4.80 (GPRTU 02 Jun 2026)
```

Aggregator callbacks: `POST /ussd/africastalking` (form, `text=1*2*1`), `POST /ussd/hubtel`
(JSON, latest input only, session kept server-side), `POST /ussd/arkesel` (JSON; NALO is the same
shape). Point the shortcode you buy from Hubtel/Arkesel/NALO at the matching URL.

## Full stack (Docker: TimescaleDB + PostGIS, Mosquitto, API, ingest)

```bash
docker compose up --build                    # api on :8000, MQTT on :1883
docker compose --profile demo up simulator   # fake fleet publishing to kumasi/fleet/<op>/<vehicle>/pos
```

Real trackers publish JSON to `kumasi/fleet/<operator>/<vehicle>/pos`:

```json
{"id": "STC-001", "ts": "2026-09-06T08:00:00Z", "lat": 6.6165, "lon": -1.2160, "spd": 16.7, "hdg": 100, "route_id": "IC-STC-ACC"}
```

Traccar-style payloads (`deviceId`, `fixTime`, `latitude`, `longitude`, `speed` in knots, `course`)
and batched lists from store-and-forward trackers are accepted too. Gateways without MQTT can
`POST /api/tracking/positions` with header `X-Tracker-Key`.

OpenTripPlanner: build the graph from `/gtfs/kumasi-gtfs.zip` and add a `vehicle-positions` /
`stop-time-updater` pointing at `/gtfs-rt/vehicle-positions.pb` and `/gtfs-rt/feed.pb`.

## Command line

```bash
kumasi-transit build-gtfs [--as-of 2026-09-06]   # build + validate build/gtfs/kumasi-gtfs.zip
kumasi-transit validate-gtfs path/to/feed.zip     # e.g. the DT4A Kumasi feed, before Phase 0 field work
kumasi-transit fares                              # current fare version and history per route
kumasi-transit fares --derive --effective-from 2026-11-01 --change-pct 10 --source "GPRTU circular ..."
kumasi-transit seed                               # terminals, station masters, fleet
kumasi-transit serve                              # API + dashboards
kumasi-transit simulate [--direct]                # fleet simulator (MQTT, or straight into the DB)
kumasi-transit ingest                             # MQTT → database service
kumasi-transit cadence --vehicles 70 --months 14  # reporting-interval study
```

Sample cadence output (60 km/h, 5 % loss, 180 B/report, 14 h/day):

```
 T (s)  mean err (m)  p95 err (m)  reports/day  MB/month  USD/month
    20           184          333         2520     13.61       1.27
    30           276          500         1680      9.07       1.18  <- recommended (p95 <= 500 m)
    60           553         1000          840      4.54       1.09
Fleet of 70 for 14 months: USD 1,158  (proposal line 8 budget: USD 6,000)
```

## Data model and conventions

- **Fares live outside the GTFS.** `data/fares/<date>.json` is one version per GPRTU announcement;
  `FareTable.current(date)` picks the one in force. `build-gtfs` stamps the current version into
  `fare_attributes.txt` and the feed version (`seed-2026-09+fares-2026-06-02`), and every USSD fare
  answer names the GPRTU date it comes from.
- **Trotros are frequency-based** (`frequencies.txt`, `exact_times=0`); coaches and Metro Mass get
  one trip per departure; shared taxis use extended route type 1501 so Phase 3 can treat them
  separately (the validator warns because some consumers only accept 0–12).
- **Seed coordinates and headways are desk estimates**, flagged in `corridors.json`. Phase 0's job
  is to replace them with field-verified values; the validator is the gate.
- **Loading reports** expire after 20 minutes (`LOADING_REPORT_TTL_SECONDS`), a new report for
  the same bay supersedes the old one, "full" lingers five minutes as "leaving", "departed" drops at
  once.
- **Direction and speed** are derived from history, not kept in process memory, so several API
  workers or the ingest service can share one database.
- **Privacy (Act 843):** the service stores station-master and vehicle data only. No passenger
  identifiers are stored; USSD session state holds only the menu path and is deleted at session end.

## Layout

```
kumasi-transit/
  kumasi_transit/
    gtfs/        feed.py (zip I/O), builder.py, validator.py, fares.py
    loading/     service.py (board logic), ussd.py (menu engine)
    tracking/    ingest.py (MQTT/asyncio), mapmatch.py, eta.py, store.py, gtfsrt.py, simulator.py
    cadence/     model.py (analytic study)
    api/         app.py (FastAPI), ussd.py (aggregator adapters), templates/
    network.py   shared view of stops/routes/shapes;  db.py  SQLAlchemy models;  cli.py
  data/          gtfs_seed/corridors.json, terminals.json, fleet.json, fares/*.json
  omnet/         OMNeT++ 6 cadence model (NED, C++, ini, analyse.py)
  tests/         pytest suite
  deploy/        mosquitto.conf, init-timescale.sql;  docker-compose.yml;  Dockerfile
```

## What is deliberately not here

- The Flutter passenger app and the Android terminal app: both are thin clients of
  `/api/terminals/*` and `/api/terminals/{id}/reports`; the `/passenger` page shows the same flow.
- Phase 3 (trotro tracking at scale, crowdsourcing, driver incentives) is a follow-on in the proposal.
- The OMNeT++ model was written against the OMNeT++ 6 API but has not been compiled in this
  environment; run `omnet/build.sh` with a local OMNeT++ install.
