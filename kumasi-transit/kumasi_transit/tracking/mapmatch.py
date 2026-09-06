"""Geometric map-matching of tracker fixes onto a route shape.

Intercity coaches follow one known alignment, so a projection onto the route polyline (rather than
a full HMM road-network matcher) is enough to recover distance-along-route, which is what the ETA
model needs. Fixes further than ``max_offset_m`` from the shape are flagged as off-route.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..geo import LocalProjection, polyline_length_m
from ..network import Network, get_network


@dataclass(frozen=True)
class MatchResult:
    matched_lat: float
    matched_lon: float
    dist_along_m: float
    offset_m: float
    segment_index: int
    on_route: bool


class _ShapeIndex:
    def __init__(self, points: list[tuple[float, float]]):
        self.points = points
        self.proj = LocalProjection(points[0][0], points[0][1])
        self.xy = [self.proj.to_xy(lat, lon) for lat, lon in points]
        self.cum = [0.0]
        for i in range(1, len(points)):
            self.cum.append(self.cum[-1] + _dist(self.xy[i - 1], self.xy[i]))
        self.length_m = polyline_length_m(points)

    def project(self, lat: float, lon: float) -> tuple[float, float, float, int]:
        px, py = self.proj.to_xy(lat, lon)
        best = (float("inf"), 0.0, 0.0, 0.0, 0)
        for i in range(len(self.xy) - 1):
            (ax, ay), (bx, by) = self.xy[i], self.xy[i + 1]
            dx, dy = bx - ax, by - ay
            seg_len2 = dx * dx + dy * dy
            t = 0.0 if seg_len2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len2))
            cx, cy = ax + t * dx, ay + t * dy
            d = _dist((px, py), (cx, cy))
            if d < best[0]:
                best = (d, cx, cy, self.cum[i] + t * (self.cum[i + 1] - self.cum[i]), i)
        d, cx, cy, along, seg = best
        return d, along, seg, *self.proj.to_latlon(cx, cy)  # type: ignore[return-value]


class MapMatcher:
    def __init__(self, network: Network | None = None, max_offset_m: float = 250.0):
        self.network = network or get_network()
        self.max_offset_m = max_offset_m
        self._shapes: dict[tuple[str, int], _ShapeIndex] = {}

    def shape(self, route_id: str, direction: int = 0) -> _ShapeIndex:
        key = (route_id, direction)
        if key not in self._shapes:
            self._shapes[key] = _ShapeIndex(self.network.shape_points(route_id, direction))
        return self._shapes[key]

    def route_length_m(self, route_id: str) -> float:
        return self.shape(route_id, 0).length_m

    def match(self, route_id: str, lat: float, lon: float, direction: int = 0) -> MatchResult:
        shape = self.shape(route_id, direction)
        offset, along, seg, mlat, mlon = shape.project(lat, lon)
        return MatchResult(
            matched_lat=mlat,
            matched_lon=mlon,
            dist_along_m=along,
            offset_m=offset,
            segment_index=seg,
            on_route=offset <= self.max_offset_m,
        )

    def infer_direction(self, route_id: str, fixes: list[tuple[float, float]]) -> int:
        """Direction (0/1) in which a sequence of (lat, lon) fixes progresses along the route."""
        if len(fixes) < 2:
            return 0
        along = [self.match(route_id, lat, lon, 0).dist_along_m for lat, lon in fixes]
        return 0 if along[-1] >= along[0] else 1


def _dist(a: tuple[float, float], b: tuple[float, float]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5
