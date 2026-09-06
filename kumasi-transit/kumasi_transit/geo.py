"""Small geodesy helpers shared by the GTFS builder, the map-matcher and the simulator."""
from __future__ import annotations

import math
from dataclasses import dataclass

EARTH_RADIUS_M = 6_371_008.8


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlmb = math.radians(lon2 - lon1)
    x = math.sin(dlmb) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dlmb)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def destination_point(lat: float, lon: float, bearing: float, distance_m: float) -> tuple[float, float]:
    """Point reached by travelling ``distance_m`` from (lat, lon) on ``bearing`` degrees."""
    d = distance_m / EARTH_RADIUS_M
    b = math.radians(bearing)
    p1, l1 = math.radians(lat), math.radians(lon)
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), math.degrees(l2)


@dataclass(frozen=True)
class LocalProjection:
    """Equirectangular projection around a reference latitude; accurate to well under 1 % over a city."""

    ref_lat: float
    ref_lon: float

    def to_xy(self, lat: float, lon: float) -> tuple[float, float]:
        k = math.cos(math.radians(self.ref_lat))
        x = math.radians(lon - self.ref_lon) * k * EARTH_RADIUS_M
        y = math.radians(lat - self.ref_lat) * EARTH_RADIUS_M
        return x, y

    def to_latlon(self, x: float, y: float) -> tuple[float, float]:
        k = math.cos(math.radians(self.ref_lat))
        lat = self.ref_lat + math.degrees(y / EARTH_RADIUS_M)
        lon = self.ref_lon + math.degrees(x / (k * EARTH_RADIUS_M))
        return lat, lon


def polyline_length_m(points: list[tuple[float, float]]) -> float:
    return sum(haversine_m(*points[i], *points[i + 1]) for i in range(len(points) - 1))


def point_along_polyline(points: list[tuple[float, float]], dist_m: float) -> tuple[float, float]:
    """Interpolate the (lat, lon) at ``dist_m`` metres along a polyline, clamped to its ends."""
    if dist_m <= 0:
        return points[0]
    remaining = dist_m
    for i in range(len(points) - 1):
        seg = haversine_m(*points[i], *points[i + 1])
        if remaining <= seg and seg > 0:
            f = remaining / seg
            (a_lat, a_lon), (b_lat, b_lon) = points[i], points[i + 1]
            return a_lat + f * (b_lat - a_lat), a_lon + f * (b_lon - a_lon)
        remaining -= seg
    return points[-1]
