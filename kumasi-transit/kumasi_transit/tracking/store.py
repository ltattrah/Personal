"""Position persistence and per-vehicle state (latest fix, direction, ETAs)."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import Position, Vehicle
from ..network import Network, get_network
from .eta import EtaModel, StopEta
from .mapmatch import MapMatcher, MatchResult


@dataclass
class VehicleState:
    vehicle_id: str
    operator_id: str
    plate: str
    route_id: str | None
    trip_id: str | None
    direction: int
    ts: datetime
    lat: float
    lon: float
    speed_mps: float | None
    heading: float | None
    match: MatchResult | None
    etas: list[StopEta] = field(default_factory=list)

    @property
    def age_seconds(self) -> int:
        return int((datetime.utcnow() - self.ts).total_seconds())

    def to_dict(self) -> dict:
        return {
            "vehicle_id": self.vehicle_id,
            "operator_id": self.operator_id,
            "plate": self.plate,
            "route_id": self.route_id,
            "trip_id": self.trip_id,
            "direction": self.direction,
            "timestamp": self.ts.isoformat() + "Z",
            "lat": self.lat,
            "lon": self.lon,
            "speed_kph": None if self.speed_mps is None else round(self.speed_mps * 3.6, 1),
            "heading": self.heading,
            "on_route": self.match.on_route if self.match else None,
            "dist_along_km": None if self.match is None else round(self.match.dist_along_m / 1000, 2),
            "offset_m": None if self.match is None else round(self.match.offset_m, 1),
            "next_stops": [
                {"stop_id": e.stop_id, "stop": e.stop_name, "eta": e.eta.replace(microsecond=0).isoformat() + "Z", "seconds": e.seconds, "distance_km": round(e.distance_m / 1000, 1)}
                for e in self.etas[:3]
            ],
        }


class PositionStore:
    def __init__(self, db: Session, network: Network | None = None, matcher: MapMatcher | None = None, eta_model: EtaModel | None = None):
        self.db = db
        self.network = network or get_network()
        self.matcher = matcher or MapMatcher(self.network)
        self.eta = eta_model or EtaModel(self.network, self.matcher)
        self._direction: dict[str, int] = {}

    def vehicle(self, vehicle_id: str) -> Vehicle | None:
        return self.db.get(Vehicle, vehicle_id)

    def register_vehicle(self, vehicle_id: str, operator_id: str, plate: str = "", route_id: str | None = None, tracker_id: str = "") -> Vehicle:
        v = self.db.get(Vehicle, vehicle_id)
        if v is None:
            v = Vehicle(id=vehicle_id)
            self.db.add(v)
        v.operator_id, v.plate, v.route_id, v.tracker_id = operator_id, plate, route_id, tracker_id
        self.db.commit()
        return v

    def record(
        self,
        vehicle_id: str,
        ts: datetime,
        lat: float,
        lon: float,
        speed_mps: float | None = None,
        heading: float | None = None,
        route_id: str | None = None,
        trip_id: str | None = None,
    ) -> Position:
        vehicle = self.vehicle(vehicle_id)
        if vehicle is None:
            raise ValueError(f"unknown vehicle {vehicle_id}; register it first")
        route_id = route_id or vehicle.route_id
        trip_id = trip_id or vehicle.trip_id
        pos = Position(vehicle_id=vehicle_id, ts=ts, lat=lat, lon=lon, speed_mps=speed_mps, heading=heading, route_id=route_id, trip_id=trip_id)
        if route_id and route_id in self.network.routes:
            direction = self._update_direction(vehicle_id, route_id, lat, lon)
            m = self.matcher.match(route_id, lat, lon, direction)
            pos.direction = direction
            pos.matched_lat, pos.matched_lon = m.matched_lat, m.matched_lon
            pos.dist_along_m, pos.offset_m = m.dist_along_m, m.offset_m
        self.db.add(pos)
        if route_id != vehicle.route_id or trip_id != vehicle.trip_id:
            vehicle.route_id, vehicle.trip_id = route_id, trip_id
        self.db.commit()
        return pos

    def _update_direction(self, vehicle_id: str, route_id: str, lat: float, lon: float) -> int:
        last = self.db.scalars(
            select(Position).where(Position.vehicle_id == vehicle_id, Position.route_id == route_id).order_by(Position.ts.desc()).limit(3)
        ).all()
        fixes = [(p.lat, p.lon) for p in reversed(last)] + [(lat, lon)]
        if len(fixes) >= 2:
            self._direction[vehicle_id] = self.matcher.infer_direction(route_id, fixes)
        return self._direction.get(vehicle_id, 0)

    def latest(self, vehicle_id: str) -> Position | None:
        return self.db.scalars(select(Position).where(Position.vehicle_id == vehicle_id).order_by(Position.ts.desc()).limit(1)).first()

    def history(self, vehicle_id: str, since: datetime | None = None, limit: int = 500) -> list[Position]:
        stmt = select(Position).where(Position.vehicle_id == vehicle_id)
        if since:
            stmt = stmt.where(Position.ts >= since)
        return list(self.db.scalars(stmt.order_by(Position.ts.desc()).limit(limit)))[::-1]

    def state(self, vehicle_id: str, now: datetime | None = None) -> VehicleState | None:
        now = now or datetime.utcnow()
        vehicle = self.vehicle(vehicle_id)
        pos = self.latest(vehicle_id)
        if vehicle is None or pos is None:
            return None
        direction = pos.direction if pos.direction is not None else self._direction.get(vehicle_id, 0)
        match = None
        etas: list[StopEta] = []
        if pos.route_id and pos.route_id in self.network.routes and pos.dist_along_m is not None:
            match = MatchResult(pos.matched_lat, pos.matched_lon, pos.dist_along_m, pos.offset_m, 0, pos.offset_m <= self.matcher.max_offset_m)
            if match.on_route:
                recent = self.history(vehicle_id, since=pos.ts - timedelta(minutes=10), limit=20)
                self.eta.set_speed(vehicle_id, self.eta.estimate_speed(pos.route_id, [p.speed_mps for p in recent]))
                etas = self.eta.etas(vehicle_id, pos.route_id, direction, pos.dist_along_m, now)
        return VehicleState(
            vehicle_id=vehicle_id,
            operator_id=vehicle.operator_id,
            plate=vehicle.plate,
            route_id=pos.route_id,
            trip_id=pos.trip_id,
            direction=direction,
            ts=pos.ts,
            lat=pos.lat,
            lon=pos.lon,
            speed_mps=pos.speed_mps,
            heading=pos.heading,
            match=match,
            etas=etas,
        )

    def live_states(self, operator_id: str | None = None, max_age: timedelta = timedelta(minutes=30), now: datetime | None = None) -> list[VehicleState]:
        now = now or datetime.utcnow()
        stmt = select(Vehicle)
        if operator_id:
            stmt = stmt.where(Vehicle.operator_id == operator_id)
        states = []
        for v in self.db.scalars(stmt):
            s = self.state(v.id, now)
            if s and now - s.ts <= max_age:
                states.append(s)
        return states

    def counts(self, now: datetime | None = None) -> dict:
        now = now or datetime.utcnow()
        total = self.db.scalar(select(func.count(Vehicle.id))) or 0
        live = len(self.live_states(now=now))
        fixes_24h = self.db.scalar(select(func.count(Position.id)).where(Position.ts >= now - timedelta(hours=24))) or 0
        return {"vehicles_registered": total, "vehicles_live": live, "fixes_last_24h": fixes_24h}
