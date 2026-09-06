"""Structural and plausibility checks for a GTFS feed.

Written for Phase 0, where the team validates the existing DT4A Kumasi feed and its own rebuild.
It is deliberately dependency-free so students can run it on any laptop; for a full spec check
the published feed should also be run through the MobilityData canonical validator.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from ..geo import haversine_m
from .fares import FareTable
from .feed import REQUIRED_TABLES, Feed

REQUIRED_COLUMNS = {
    "agency": ["agency_name", "agency_url", "agency_timezone"],
    "stops": ["stop_id", "stop_name", "stop_lat", "stop_lon"],
    "routes": ["route_id", "route_type"],
    "trips": ["route_id", "service_id", "trip_id"],
    "stop_times": ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
    "frequencies": ["trip_id", "start_time", "end_time", "headway_secs"],
    "shapes": ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"],
    "calendar": ["service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "start_date", "end_date"],
}
STANDARD_ROUTE_TYPES = set(range(0, 13))
EXTENDED_ROUTE_TYPES = set(range(100, 1800))
GHANA_BBOX = (4.5, -3.3, 11.2, 1.3)
KUMASI_BBOX = (6.55, -1.80, 6.85, -1.45)


@dataclass
class ValidationReport:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    stats: dict[str, int | float] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.errors

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def as_text(self) -> str:
        lines = [f"GTFS validation: {'PASS' if self.ok else 'FAIL'} ({len(self.errors)} errors, {len(self.warnings)} warnings)"]
        for k, v in self.stats.items():
            lines.append(f"  {k}: {v}")
        for e in self.errors:
            lines.append(f"  ERROR   {e}")
        for w in self.warnings:
            lines.append(f"  WARNING {w}")
        return "\n".join(lines)


def _parse_time(text: str) -> int | None:
    try:
        h, m, s = text.split(":")
        return int(h) * 3600 + int(m) * 60 + int(s)
    except (ValueError, AttributeError):
        return None


def _in_bbox(lat: float, lon: float, bbox: tuple[float, float, float, float]) -> bool:
    return bbox[0] <= lat <= bbox[2] and bbox[1] <= lon <= bbox[3]


def _check_unique(feed: Feed, table: str, column: str, report: ValidationReport) -> None:
    seen: set[str] = set()
    for row in feed[table]:
        value = row.get(column, "")
        if not value:
            report.error(f"{table}.txt: empty {column}")
        elif value in seen:
            report.error(f"{table}.txt: duplicate {column} '{value}'")
        seen.add(value)


def validate_feed(
    feed: Feed,
    fare_table: FareTable | None = None,
    as_of: date | None = None,
    urban_bbox: tuple[float, float, float, float] = KUMASI_BBOX,
    country_bbox: tuple[float, float, float, float] = GHANA_BBOX,
    max_speed_kph: float = 120.0,
    min_speed_kph: float = 3.0,
) -> ValidationReport:
    report = ValidationReport()
    as_of = as_of or date.today()

    for table in REQUIRED_TABLES:
        if table not in feed:
            report.error(f"required table {table}.txt missing or empty")
    if not report.ok:
        return report
    if "calendar" not in feed and "calendar_dates" not in feed:
        report.error("neither calendar.txt nor calendar_dates.txt present")

    for table, cols in REQUIRED_COLUMNS.items():
        if table in feed:
            present = set(feed[table][0].keys())
            for col in cols:
                if col not in present:
                    report.error(f"{table}.txt: required column {col} missing")
    if not report.ok:
        return report

    for table, col in (("stops", "stop_id"), ("routes", "route_id"), ("trips", "trip_id")):
        _check_unique(feed, table, col, report)
    if len(feed["agency"]) > 1:
        _check_unique(feed, "agency", "agency_id", report)

    # Referential integrity
    agency_ids = feed.ids("agency", "agency_id")
    stop_ids = feed.ids("stops", "stop_id")
    route_ids = feed.ids("routes", "route_id")
    trip_ids = feed.ids("trips", "trip_id")
    service_ids = feed.ids("calendar", "service_id") | feed.ids("calendar_dates", "service_id")
    shape_ids = feed.ids("shapes", "shape_id")
    for row in feed["routes"]:
        if len(feed["agency"]) > 1 and row.get("agency_id") not in agency_ids:
            report.error(f"routes.txt: route {row['route_id']} references unknown agency '{row.get('agency_id')}'")
        rt = row.get("route_type", "")
        if not rt.isdigit():
            report.error(f"routes.txt: route {row['route_id']} has non-numeric route_type '{rt}'")
        elif int(rt) in EXTENDED_ROUTE_TYPES:
            report.warn(f"routes.txt: route {row['route_id']} uses extended route_type {rt}; some consumers only accept 0-12")
        elif int(rt) not in STANDARD_ROUTE_TYPES:
            report.error(f"routes.txt: route {row['route_id']} has unknown route_type {rt}")
    for row in feed["trips"]:
        if row["route_id"] not in route_ids:
            report.error(f"trips.txt: trip {row['trip_id']} references unknown route '{row['route_id']}'")
        if row["service_id"] not in service_ids:
            report.error(f"trips.txt: trip {row['trip_id']} references unknown service '{row['service_id']}'")
        if row.get("shape_id") and row["shape_id"] not in shape_ids:
            report.error(f"trips.txt: trip {row['trip_id']} references unknown shape '{row['shape_id']}'")
    for row in feed["frequencies"]:
        if row["trip_id"] not in trip_ids:
            report.error(f"frequencies.txt: unknown trip '{row['trip_id']}'")
        try:
            headway = int(row["headway_secs"])
            if headway <= 0:
                report.error(f"frequencies.txt: non-positive headway for trip {row['trip_id']}")
            elif headway > 3600:
                report.warn(f"frequencies.txt: headway {headway}s for trip {row['trip_id']} exceeds an hour")
        except ValueError:
            report.error(f"frequencies.txt: non-numeric headway for trip {row['trip_id']}")
        start, end = _parse_time(row["start_time"]), _parse_time(row["end_time"])
        if start is None or end is None or start >= end:
            report.error(f"frequencies.txt: invalid period {row['start_time']}-{row['end_time']} for trip {row['trip_id']}")
    fare_ids = feed.ids("fare_attributes", "fare_id")
    for row in feed["fare_rules"]:
        if row.get("fare_id") not in fare_ids:
            report.error(f"fare_rules.txt: unknown fare '{row.get('fare_id')}'")
        if row.get("route_id") and row["route_id"] not in route_ids:
            report.error(f"fare_rules.txt: unknown route '{row['route_id']}'")

    # Stops
    coords: dict[str, tuple[float, float]] = {}
    outside_urban = 0
    for row in feed["stops"]:
        try:
            lat, lon = float(row["stop_lat"]), float(row["stop_lon"])
        except ValueError:
            report.error(f"stops.txt: stop {row['stop_id']} has non-numeric coordinates")
            continue
        if lat == 0 and lon == 0:
            report.error(f"stops.txt: stop {row['stop_id']} at 0,0")
            continue
        if not _in_bbox(lat, lon, country_bbox):
            report.error(f"stops.txt: stop {row['stop_id']} ({row['stop_name']}) lies outside Ghana")
        elif not _in_bbox(lat, lon, urban_bbox):
            outside_urban += 1
        coords[row["stop_id"]] = (lat, lon)
    if outside_urban:
        report.warn(f"stops.txt: {outside_urban} stops lie outside the Kumasi urban bounding box (expected for intercity routes)")
    names: dict[str, list[str]] = {}
    for row in feed["stops"]:
        names.setdefault(row["stop_name"].strip().lower(), []).append(row["stop_id"])
    for name, ids in names.items():
        if len(ids) > 1:
            pts = [coords[i] for i in ids if i in coords]
            if len(pts) > 1 and all(haversine_m(*pts[0], *p) < 30 for p in pts[1:]):
                report.warn(f"stops.txt: '{name}' appears {len(ids)} times within 30 m ({', '.join(ids)}); consider merging")

    # Stop times
    by_trip: dict[str, list[dict[str, str]]] = {}
    for row in feed["stop_times"]:
        if row["trip_id"] not in trip_ids:
            report.error(f"stop_times.txt: unknown trip '{row['trip_id']}'")
            continue
        if row["stop_id"] not in stop_ids:
            report.error(f"stop_times.txt: unknown stop '{row['stop_id']}' on trip {row['trip_id']}")
            continue
        by_trip.setdefault(row["trip_id"], []).append(row)
    used_stops: set[str] = set()
    for trip_id in trip_ids:
        rows = by_trip.get(trip_id)
        if not rows:
            report.error(f"trips.txt: trip {trip_id} has no stop_times")
            continue
        try:
            rows.sort(key=lambda r: int(r["stop_sequence"]))
        except ValueError:
            report.error(f"stop_times.txt: non-numeric stop_sequence on trip {trip_id}")
            continue
        if len(rows) < 2:
            report.error(f"stop_times.txt: trip {trip_id} has fewer than two stops")
            continue
        seqs = [int(r["stop_sequence"]) for r in rows]
        if any(b <= a for a, b in zip(seqs, seqs[1:])):
            report.error(f"stop_times.txt: stop_sequence not strictly increasing on trip {trip_id}")
        prev_dep: int | None = None
        prev_stop: str | None = None
        for r in rows:
            used_stops.add(r["stop_id"])
            arr, dep = _parse_time(r["arrival_time"]), _parse_time(r["departure_time"])
            if arr is None or dep is None:
                if r["arrival_time"] or r["departure_time"]:
                    report.error(f"stop_times.txt: bad time on trip {trip_id} at stop {r['stop_id']}")
                continue
            if dep < arr:
                report.error(f"stop_times.txt: departure before arrival on trip {trip_id} at stop {r['stop_id']}")
            if prev_dep is not None:
                if arr < prev_dep:
                    report.error(f"stop_times.txt: time goes backwards on trip {trip_id} at stop {r['stop_id']}")
                elif prev_stop in coords and r["stop_id"] in coords:
                    dist = haversine_m(*coords[prev_stop], *coords[r["stop_id"]])
                    dt = arr - prev_dep
                    if dist > 50 and dt == 0:
                        report.error(f"stop_times.txt: zero travel time over {dist:.0f} m on trip {trip_id} ({prev_stop}->{r['stop_id']})")
                    elif dt > 0:
                        kph = dist / dt * 3.6
                        if kph > max_speed_kph:
                            report.error(f"stop_times.txt: implausible {kph:.0f} km/h on trip {trip_id} ({prev_stop}->{r['stop_id']})")
                        elif kph < min_speed_kph and dist > 200:
                            report.warn(f"stop_times.txt: very slow {kph:.1f} km/h on trip {trip_id} ({prev_stop}->{r['stop_id']})")
            prev_dep, prev_stop = dep, r["stop_id"]
    unused = stop_ids - used_stops
    if unused:
        report.warn(f"stops.txt: {len(unused)} stops not used by any trip: {', '.join(sorted(unused)[:10])}")

    # Shapes
    by_shape: dict[str, list[dict[str, str]]] = {}
    for row in feed["shapes"]:
        by_shape.setdefault(row["shape_id"], []).append(row)
    for shape_id, rows in by_shape.items():
        try:
            rows.sort(key=lambda r: int(r["shape_pt_sequence"]))
            seq = [int(r["shape_pt_sequence"]) for r in rows]
        except ValueError:
            report.error(f"shapes.txt: non-numeric shape_pt_sequence in shape {shape_id}")
            continue
        if any(b <= a for a, b in zip(seq, seq[1:])):
            report.error(f"shapes.txt: shape_pt_sequence not increasing in shape {shape_id}")
        if len(rows) < 2:
            report.error(f"shapes.txt: shape {shape_id} has fewer than two points")
        dists = [float(r["shape_dist_traveled"]) for r in rows if r.get("shape_dist_traveled")]
        if dists and any(b < a for a, b in zip(dists, dists[1:])):
            report.error(f"shapes.txt: shape_dist_traveled decreases in shape {shape_id}")

    # Calendar
    for row in feed["calendar"]:
        days = [row.get(d, "0") for d in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")]
        if not any(d == "1" for d in days):
            report.warn(f"calendar.txt: service {row['service_id']} runs on no days")
        try:
            end = date(int(row["end_date"][:4]), int(row["end_date"][4:6]), int(row["end_date"][6:8]))
            if end < as_of:
                report.warn(f"calendar.txt: service {row['service_id']} expired on {end.isoformat()}")
        except ValueError:
            report.error(f"calendar.txt: bad end_date '{row.get('end_date')}' for service {row['service_id']}")

    # Feed info and fares
    if "feed_info" not in feed:
        report.warn("feed_info.txt missing; add feed_version so consumers can detect updates")
    if fare_table is not None:
        current = fare_table.current(as_of)
        missing = [r for r in sorted(route_ids) if current.price(r) is None]
        if missing:
            report.warn(f"fare table {current.version} has no fare for routes: {', '.join(missing)}")

    report.stats = {
        "agencies": len(feed["agency"]),
        "stops": len(feed["stops"]),
        "routes": len(feed["routes"]),
        "trips": len(feed["trips"]),
        "stop_times": len(feed["stop_times"]),
        "frequency_periods": len(feed["frequencies"]),
        "shapes": len(by_shape),
    }
    return report
