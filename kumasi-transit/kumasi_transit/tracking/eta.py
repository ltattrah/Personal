"""Arrival-time estimation for a vehicle on a known route.

ETA to each downstream stop = remaining distance / speed estimate + dwell at intermediate stops.
The speed estimate is an exponentially weighted average of recent matched speeds, falling back to
the route's planning speed when the vehicle has just started or is stationary at a stop.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from ..gtfs.builder import MODE_DWELL_S
from ..network import Network, get_network
from .mapmatch import MapMatcher


@dataclass(frozen=True)
class StopEta:
    stop_id: str
    stop_name: str
    stop_sequence: int
    distance_m: float
    eta: datetime
    seconds: int


class EtaModel:
    def __init__(self, network: Network | None = None, matcher: MapMatcher | None = None, alpha: float = 0.3, min_speed_mps: float = 3.0):
        self.network = network or get_network()
        self.matcher = matcher or MapMatcher(self.network)
        self.alpha = alpha
        self.min_speed_mps = min_speed_mps
        self._speed: dict[str, float] = {}

    def default_speed_mps(self, route_id: str) -> float:
        return self.network.routes[route_id].speed_kph * 1000 / 3600

    def estimate_speed(self, route_id: str, observations: list[float | None]) -> float:
        """Exponentially weighted speed estimate from oldest-to-newest observations (m/s).

        Stationary fixes (dwell, traffic) are floored at ``min_speed_mps`` so they do not drag the
        estimate to zero; with no observations the route planning speed is returned.
        """
        est = self.default_speed_mps(route_id)
        for obs in observations:
            if obs is None:
                continue
            est = self.alpha * max(obs, self.min_speed_mps) + (1 - self.alpha) * est
        return est

    def set_speed(self, vehicle_id: str, speed_mps: float) -> None:
        self._speed[vehicle_id] = speed_mps

    def speed_estimate(self, vehicle_id: str, route_id: str) -> float:
        return self._speed.get(vehicle_id, self.default_speed_mps(route_id))

    def etas(self, vehicle_id: str, route_id: str, direction: int, dist_along_m: float, now: datetime) -> list[StopEta]:
        route = self.network.routes[route_id]
        speed = max(self.speed_estimate(vehicle_id, route_id), self.min_speed_mps)
        dwell = MODE_DWELL_S.get(route.mode, 60)
        out: list[StopEta] = []
        pending = 0
        for seq, (stop_id, stop_dist) in enumerate(self.network.stop_distances(route_id, direction), start=1):
            remaining = stop_dist - dist_along_m
            if remaining < -50:  # already passed
                continue
            secs = max(0.0, remaining) / speed + pending * dwell
            out.append(
                StopEta(
                    stop_id=stop_id,
                    stop_name=self.network.stop_name(stop_id),
                    stop_sequence=seq,
                    distance_m=max(0.0, remaining),
                    eta=now + timedelta(seconds=secs),
                    seconds=int(secs),
                )
            )
            pending += 1
        return out
