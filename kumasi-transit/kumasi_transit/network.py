"""Read-only view of the seed network (stops, routes, shapes) used by the loading service,
the USSD menus and the tracking pipeline. Loaded once from ``data/gtfs_seed/corridors.json``."""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .config import DATA_DIR
from .geo import polyline_length_m


@dataclass(frozen=True)
class Stop:
    id: str
    name: str
    lat: float
    lon: float
    terminal: bool = False


@dataclass(frozen=True)
class Route:
    id: str
    agency: str
    mode: str
    short_name: str
    long_name: str
    stops: tuple[str, ...]
    speed_kph: float
    corridor: int | None = None

    def direction_for(self, origin: str, destination: str) -> int | None:
        """0 if the route runs origin->destination in its listed order, 1 if reversed, else None."""
        if origin in self.stops and destination in self.stops:
            return 0 if self.stops.index(origin) < self.stops.index(destination) else 1
        return None

    def stops_in_direction(self, direction: int) -> tuple[str, ...]:
        return self.stops if direction == 0 else tuple(reversed(self.stops))


class Network:
    def __init__(self, data: dict):
        self.stops: dict[str, Stop] = {
            sid: Stop(sid, s["name"], float(s["lat"]), float(s["lon"]), bool(s.get("terminal", False)))
            for sid, s in data["stops"].items()
        }
        self.routes: dict[str, Route] = {
            r["id"]: Route(
                id=r["id"],
                agency=r["agency"],
                mode=r.get("mode", "trotro"),
                short_name=r.get("short_name", r["id"]),
                long_name=r.get("long_name", ""),
                stops=tuple(r["stops"]),
                speed_kph=float(r.get("speed_kph", 16)),
                corridor=r.get("corridor"),
            )
            for r in data["routes"]
        }

    @classmethod
    def load(cls, path: Path | str | None = None) -> "Network":
        path = Path(path) if path else DATA_DIR / "gtfs_seed" / "corridors.json"
        return cls(json.loads(path.read_text(encoding="utf-8")))

    def stop_name(self, stop_id: str) -> str:
        stop = self.stops.get(stop_id)
        return stop.name if stop else stop_id

    def routes_between(self, origin: str, destination: str) -> list[tuple[Route, int]]:
        """Routes serving origin -> destination, trotros first, then shared taxis, then others."""
        order = {"trotro": 0, "shared_taxi": 1, "bus": 2, "coach": 3}
        found = []
        for route in self.routes.values():
            direction = route.direction_for(origin, destination)
            if direction is not None:
                found.append((route, direction))
        found.sort(key=lambda rd: (order.get(rd[0].mode, 9), rd[0].id))
        return found

    def shape_points(self, route_id: str, direction: int = 0) -> list[tuple[float, float]]:
        route = self.routes[route_id]
        return [(self.stops[s].lat, self.stops[s].lon) for s in route.stops_in_direction(direction)]

    def stop_distances(self, route_id: str, direction: int = 0) -> list[tuple[str, float]]:
        """(stop_id, distance along shape in metres) for each stop in travel order."""
        pts = self.shape_points(route_id, direction)
        stops = self.routes[route_id].stops_in_direction(direction)
        out = []
        for i, sid in enumerate(stops):
            out.append((sid, polyline_length_m(pts[: i + 1]) if i else 0.0))
        return out


@lru_cache
def get_network() -> Network:
    return Network.load()
