"""Kumasi Transit: real-time transit information for Kumasi's trotro, shared-taxi and intercity fleets.

Package layout mirrors the seed-pilot phases in the funding proposal:

- ``gtfs``     Phase 0: validated, frequency-based open GTFS plus a versioned fare table.
- ``loading``  Phase 1: terminal loading-status service (station-master reports, USSD passenger queries).
- ``tracking`` Phase 2: MQTT -> asyncio ingest -> store -> map-matching/ETA -> GTFS-Realtime.
- ``cadence``  Reporting-cadence study (analytic model; the OMNeT++ model lives in ``omnet/``).
- ``api``      FastAPI service tying everything together, with owner/terminal/city dashboards.
"""

__version__ = "0.1.0"
