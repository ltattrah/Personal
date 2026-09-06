"""FastAPI application factory."""

import logging
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import __version__
from ..config import Settings, get_settings
from ..db import get_db, init_db, session_scope
from ..gtfs import FareTable, build_feed, validate_feed, write_feed
from ..loading import LoadingService, UssdEngine
from ..loading.service import normalise_msisdn
from ..network import get_network
from ..seed import seed_all
from ..tracking import PositionIngestor, PositionStore, build_feed_message, feed_to_dict
from ..tracking.ingest import parse_payload
from . import ussd as ussd_adapters

log = logging.getLogger(__name__)
TEMPLATES = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))


class AppState:
    fares: FareTable
    gtfs_zip: Path
    validation: dict


def build_gtfs(settings: Settings, fares: FareTable) -> tuple[Path, dict]:
    feed = build_feed(fare_table=fares)
    report = validate_feed(feed, fares)
    out = settings.build_dir / "gtfs" / "kumasi-gtfs.zip"
    write_feed(feed, out)
    return out, {"ok": report.ok, "errors": report.errors, "warnings": report.warnings, "stats": report.stats}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db(settings.database_url)
        db = session_scope()
        try:
            seed_all(db)
        finally:
            db.close()
        app.state.fares = FareTable.load(settings.data_dir / "fares")
        app.state.gtfs_zip, app.state.validation = build_gtfs(settings, app.state.fares)
        log.info("GTFS built at %s (%s)", app.state.gtfs_zip, "valid" if app.state.validation["ok"] else "INVALID")
        yield

    app = FastAPI(
        title="Kumasi Transit",
        version=__version__,
        description="Real-time transit information for Kumasi: open GTFS, terminal loading status over USSD, and intercity GTFS-Realtime.",
        lifespan=lifespan,
    )
    network = get_network()

    def loading_service(db: Annotated[Session, Depends(get_db)]) -> LoadingService:
        return LoadingService(db, settings.loading_report_ttl_seconds, network)

    def store(db: Annotated[Session, Depends(get_db)]) -> PositionStore:
        return PositionStore(db, network)

    def engine(request: Request, svc: Annotated[LoadingService, Depends(loading_service)]) -> UssdEngine:
        return UssdEngine(svc, request.app.state.fares, network)

    # ------------------------------------------------------------------ health / open data
    @app.get("/health")
    def health(request: Request):
        return {"status": "ok", "version": __version__, "gtfs_valid": request.app.state.validation["ok"]}

    @app.get("/api/stats")
    def stats(svc: Annotated[LoadingService, Depends(loading_service)], st: Annotated[PositionStore, Depends(store)]):
        return {"loading": svc.stats(), "tracking": st.counts(), "gtfs": {"routes": len(network.routes), "stops": len(network.stops)}}

    @app.get("/gtfs/kumasi-gtfs.zip")
    def gtfs_zip(request: Request):
        return FileResponse(request.app.state.gtfs_zip, media_type="application/zip", filename="kumasi-gtfs.zip")

    @app.get("/gtfs/validation")
    def gtfs_validation(request: Request):
        return request.app.state.validation

    @app.get("/api/routes")
    def routes():
        return [
            {"route_id": r.id, "agency": r.agency, "mode": r.mode, "short_name": r.short_name, "long_name": r.long_name, "stops": list(r.stops), "corridor": r.corridor}
            for r in network.routes.values()
        ]

    @app.get("/api/routes/{route_id}/shape")
    def route_shape(route_id: str, direction: int = 0):
        if route_id not in network.routes:
            raise HTTPException(404, "unknown route")
        return {"route_id": route_id, "direction": direction, "points": network.shape_points(route_id, direction)}

    @app.get("/api/stops")
    def stops():
        return [{"stop_id": s.id, "name": s.name, "lat": s.lat, "lon": s.lon, "terminal": s.terminal} for s in network.stops.values()]

    @app.get("/api/fares")
    def fares(request: Request, as_of: date | None = None):
        table: FareTable = request.app.state.fares
        current = table.current(as_of)
        return {"current": current.to_dict(), "versions": [{"version": v.version, "effective_from": v.effective_from.isoformat(), "change_pct": v.change_pct, "source": v.source} for v in table.versions]}

    @app.get("/api/fares/{route_id}")
    def fare_history(request: Request, route_id: str):
        table: FareTable = request.app.state.fares
        hist = table.history(route_id)
        if not hist:
            raise HTTPException(404, "no fare on record for this route")
        return {"route_id": route_id, "current": table.fare(route_id), "history": [{"version": v, "effective_from": d.isoformat(), "price": p} for v, d, p in hist]}

    # ------------------------------------------------------------------ Phase 1: loading status
    class ReportIn(BaseModel):
        msisdn: str = Field(description="Registered station-master phone number")
        destination_id: str
        bay: int = Field(ge=1)
        occupancy: int = Field(ge=0, le=4, description="0 empty .. 4 full")
        plate: str = ""
        reported_at: datetime | None = Field(default=None, description="Original time for reports queued offline by the terminal app (UTC)")

    class UpdateIn(BaseModel):
        msisdn: str
        occupancy: int | None = Field(default=None, ge=0, le=4)
        departed: bool = False

    class StationMasterIn(BaseModel):
        msisdn: str
        name: str
        terminal_id: str

    @app.get("/api/terminals")
    def terminals(svc: Annotated[LoadingService, Depends(loading_service)]):
        return [
            {"terminal_id": t.id, "name": t.name, "lat": t.lat, "lon": t.lon, "bays": t.bays, "destinations": [{"stop_id": d, "name": n} for d, n in svc.destinations(t.id)]}
            for t in svc.terminals()
        ]

    @app.get("/api/terminals/{terminal_id}/board")
    def board(terminal_id: str, svc: Annotated[LoadingService, Depends(loading_service)]):
        if svc.terminal(terminal_id) is None:
            raise HTTPException(404, "unknown terminal")
        return {"terminal_id": terminal_id, "generated_at": datetime.utcnow().isoformat() + "Z", "loading": [e.to_dict() for e in svc.board(terminal_id)]}

    @app.get("/api/terminals/{terminal_id}/find")
    def find(terminal_id: str, request: Request, svc: Annotated[LoadingService, Depends(loading_service)], destination: str = Query(...)):
        if svc.terminal(terminal_id) is None:
            raise HTTPException(404, "unknown terminal")
        cars = [e.to_dict() for e in svc.find(terminal_id, destination)]
        fare = None
        for route, _d in network.routes_between(terminal_id, destination):
            price = request.app.state.fares.fare(route.id)
            if price is not None:
                fare = {"route_id": route.id, "price": price, "currency": "GHS", "version": request.app.state.fares.current().version}
                break
        return {"terminal_id": terminal_id, "destination_id": destination, "destination": network.stop_name(destination), "loading": cars, "fare": fare}

    @app.post("/api/terminals/{terminal_id}/reports", status_code=201)
    def create_report(terminal_id: str, body: ReportIn, svc: Annotated[LoadingService, Depends(loading_service)]):
        master = svc.station_master(body.msisdn)
        if master is None or master.terminal_id != terminal_id:
            raise HTTPException(403, "phone number is not a registered station master for this terminal")
        now = None
        if body.reported_at is not None:
            now = body.reported_at.replace(tzinfo=None) if body.reported_at.tzinfo is None else body.reported_at.astimezone(timezone.utc).replace(tzinfo=None)
            now = min(now, datetime.utcnow())  # never accept a report from the future
        try:
            rep = svc.report(terminal_id, body.destination_id, body.bay, body.occupancy, master.msisdn, body.plate, now=now)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return {"report_id": rep.id, "status": rep.status, "reported_at": rep.reported_at.isoformat() + "Z"}

    @app.patch("/api/reports/{report_id}")
    def update_report(report_id: int, body: UpdateIn, svc: Annotated[LoadingService, Depends(loading_service)]):
        master = svc.station_master(body.msisdn)
        if master is None:
            raise HTTPException(403, "phone number is not a registered station master")
        try:
            rep = svc.update(report_id, body.occupancy, body.departed)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
        if rep.terminal_id != master.terminal_id:
            raise HTTPException(403, "report belongs to another terminal")
        return {"report_id": rep.id, "status": rep.status, "occupancy": rep.occupancy}

    @app.get("/api/station-masters/{msisdn}")
    def station_master_lookup(msisdn: str, svc: Annotated[LoadingService, Depends(loading_service)]):
        """Used by the terminal app at login. Pilot trust model: a registered number is enough;
        production should add an OTP step through the USSD aggregator's SMS API."""
        master = svc.station_master(msisdn)
        if master is None:
            raise HTTPException(404, "phone number is not a registered station master")
        terminal = svc.terminal(master.terminal_id)
        return {"msisdn": master.msisdn, "name": master.name, "terminal_id": master.terminal_id, "terminal_name": terminal.name, "bays": terminal.bays}

    @app.post("/api/station-masters", status_code=201)
    def register_master(body: StationMasterIn, svc: Annotated[LoadingService, Depends(loading_service)], x_admin_key: Annotated[str | None, Header()] = None):
        if x_admin_key != settings.tracker_api_key:
            raise HTTPException(401, "admin key required")
        try:
            sm = svc.register_station_master(body.msisdn, body.name, body.terminal_id)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return {"msisdn": sm.msisdn, "terminal_id": sm.terminal_id}

    # ------------------------------------------------------------------ USSD callbacks
    @app.post("/ussd/africastalking", response_class=PlainTextResponse)
    async def ussd_at(request: Request, eng: Annotated[UssdEngine, Depends(engine)]):
        form = await request.form()
        return ussd_adapters.handle_africastalking(eng, str(form.get("phoneNumber", "")), str(form.get("text", "")))

    @app.post("/ussd/hubtel")
    async def ussd_hubtel(request: Request, eng: Annotated[UssdEngine, Depends(engine)], db: Annotated[Session, Depends(get_db)]):
        return ussd_adapters.handle_hubtel(eng, db, await request.json())

    @app.post("/ussd/arkesel")
    async def ussd_arkesel(request: Request, eng: Annotated[UssdEngine, Depends(engine)], db: Annotated[Session, Depends(get_db)]):
        return ussd_adapters.handle_arkesel(eng, db, await request.json())

    @app.get("/ussd/simulate", response_class=PlainTextResponse)
    def ussd_simulate(eng: Annotated[UssdEngine, Depends(engine)], phone: str = "0551234567", text: str = ""):
        """Developer helper: walk the menu with ?phone=...&text=1*2*1 (Africa's Talking format)."""
        return ussd_adapters.handle_africastalking(eng, phone, text)

    # ------------------------------------------------------------------ Phase 2: tracking
    @app.post("/api/tracking/positions", status_code=202)
    async def post_positions(request: Request, db: Annotated[Session, Depends(get_db)], x_tracker_key: Annotated[str | None, Header()] = None):
        """HTTP fallback for gateways that cannot speak MQTT. Body: one record or a list."""
        if x_tracker_key != settings.tracker_api_key:
            raise HTTPException(401, "invalid tracker key")
        raw = await request.body()
        try:
            messages = parse_payload(raw)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        ing = PositionIngestor(db, PositionStore(db, network), auto_register=False)
        accepted = ing.ingest(messages)
        return {"accepted": accepted, "rejected": len(messages) - accepted}

    @app.get("/api/operators")
    def operators(st: Annotated[PositionStore, Depends(store)]):
        seen: dict[str, int] = {}
        for s in st.live_states():
            seen[s.operator_id] = seen.get(s.operator_id, 0) + 1
        return [{"operator_id": k, "vehicles_live": v} for k, v in sorted(seen.items())]

    @app.get("/api/vehicles")
    def vehicles(st: Annotated[PositionStore, Depends(store)], operator: str | None = None):
        return [s.to_dict() for s in st.live_states(operator)]

    @app.get("/api/vehicles/{vehicle_id}")
    def vehicle(vehicle_id: str, st: Annotated[PositionStore, Depends(store)]):
        s = st.state(vehicle_id)
        if s is None:
            raise HTTPException(404, "no position for this vehicle")
        d = s.to_dict()
        d["next_stops"] = [{"stop_id": e.stop_id, "stop": e.stop_name, "eta": e.eta.replace(microsecond=0).isoformat() + "Z", "seconds": e.seconds, "distance_km": round(e.distance_m / 1000, 1)} for e in s.etas]
        return d

    @app.get("/api/vehicles/{vehicle_id}/track")
    def vehicle_track(vehicle_id: str, st: Annotated[PositionStore, Depends(store)], limit: int = 200):
        return [{"ts": p.ts.isoformat() + "Z", "lat": p.lat, "lon": p.lon, "speed_kph": None if p.speed_mps is None else round(p.speed_mps * 3.6, 1)} for p in st.history(vehicle_id, limit=limit)]

    @app.get("/gtfs-rt/feed.pb")
    def gtfs_rt(st: Annotated[PositionStore, Depends(store)]):
        msg = build_feed_message(st.live_states())
        return Response(msg.SerializeToString(), media_type="application/x-protobuf")

    @app.get("/gtfs-rt/vehicle-positions.pb")
    def gtfs_rt_vp(st: Annotated[PositionStore, Depends(store)]):
        msg = build_feed_message(st.live_states(), include_trip_updates=False)
        return Response(msg.SerializeToString(), media_type="application/x-protobuf")

    @app.get("/gtfs-rt/feed.json")
    def gtfs_rt_json(st: Annotated[PositionStore, Depends(store)]):
        return JSONResponse(feed_to_dict(build_feed_message(st.live_states())))

    # ------------------------------------------------------------------ dashboards
    @app.get("/", response_class=HTMLResponse)
    def city(request: Request, svc: Annotated[LoadingService, Depends(loading_service)], st: Annotated[PositionStore, Depends(store)]):
        return TEMPLATES.TemplateResponse(
            request,
            "city.html",
            {
                "loading": svc.stats(),
                "tracking": st.counts(),
                "terminals": svc.terminals(),
                "validation": request.app.state.validation,
                "fares": request.app.state.fares.current(),
                "routes": list(network.routes.values()),
            },
        )

    @app.get("/passenger", response_class=HTMLResponse)
    def passenger(request: Request, svc: Annotated[LoadingService, Depends(loading_service)]):
        return TEMPLATES.TemplateResponse(request, "passenger.html", {"terminals": svc.terminals(), "dest": {t.id: svc.destinations(t.id) for t in svc.terminals()}})

    @app.get("/dashboard/terminal/{terminal_id}", response_class=HTMLResponse)
    def terminal_dash(terminal_id: str, request: Request, svc: Annotated[LoadingService, Depends(loading_service)]):
        terminal = svc.terminal(terminal_id)
        if terminal is None:
            raise HTTPException(404, "unknown terminal")
        return TEMPLATES.TemplateResponse(request, "terminal.html", {"terminal": terminal, "board": svc.board(terminal_id), "destinations": svc.destinations(terminal_id)})

    @app.get("/dashboard/operator/{operator_id}", response_class=HTMLResponse)
    def operator_dash(operator_id: str, request: Request, st: Annotated[PositionStore, Depends(store)]):
        states = st.live_states(operator_id)
        return TEMPLATES.TemplateResponse(request, "operator.html", {"operator_id": operator_id, "vehicles": [s.to_dict() for s in states]})

    return app


app = create_app()
