"""Build a frequency-based GTFS from the corridor definitions in ``data/gtfs_seed/corridors.json``.

Trotro routes have no timetable ("fill and go"), so they are modelled with ``frequencies.txt``
headways observed per period; intercity coaches and Metro Mass buses have fixed departures and
get one trip per departure. Shapes are derived from the ordered stop coordinates until field
teams trace the real alignment (Phase 0 deliverable).
"""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

from ..config import DATA_DIR
from ..geo import haversine_m
from .fares import FareTable
from .feed import Feed

# GTFS route_type by operating mode. 1501 is the extended "Communal Taxi Service" type used to
# keep shared taxis distinguishable from trotros, as the proposal's Phase 3 design requires.
MODE_ROUTE_TYPE = {"trotro": 3, "bus": 3, "coach": 3, "shared_taxi": 1501}
MODE_DESC = {
    "trotro": "Trotro (minibus, fill-and-go)",
    "bus": "Scheduled bus",
    "coach": "Intercity coach",
    "shared_taxi": "Shared taxi (fill-and-go)",
}
# Dwell per intermediate stop, seconds.
MODE_DWELL_S = {"trotro": 30, "shared_taxi": 20, "bus": 120, "coach": 300}


def load_corridors(path: Path | str | None = None) -> dict:
    path = Path(path) if path else DATA_DIR / "gtfs_seed" / "corridors.json"
    return json.loads(path.read_text(encoding="utf-8"))


def hms(seconds: int) -> str:
    h, rem = divmod(int(seconds), 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def parse_hm(text: str) -> int:
    parts = text.split(":")
    h, m = int(parts[0]), int(parts[1])
    s = int(parts[2]) if len(parts) > 2 else 0
    return h * 3600 + m * 60 + s


def _gtfs_date(d: date) -> str:
    return d.strftime("%Y%m%d")


def _stop_points(stop_ids: list[str], stops: dict) -> list[tuple[float, float]]:
    return [(stops[s]["lat"], stops[s]["lon"]) for s in stop_ids]


def _segment_seconds(points: list[tuple[float, float]], speed_kph: float) -> list[int]:
    mps = speed_kph * 1000 / 3600
    return [round(haversine_m(*points[i], *points[i + 1]) / mps) for i in range(len(points) - 1)]


def build_feed(
    corridors: dict | None = None,
    fare_table: FareTable | None = None,
    as_of: date | None = None,
    service_days: int = 365,
    reverse_directions: bool = True,
) -> Feed:
    corridors = corridors or load_corridors()
    as_of = as_of or date.today()
    stops_def = corridors["stops"]
    feed = Feed()

    feed.tables["agency"] = [
        {"agency_id": a["id"], "agency_name": a["name"], "agency_url": a["url"], "agency_timezone": a["timezone"]}
        for a in corridors["agencies"]
    ]

    used_stops: set[str] = set()
    routes, trips, stop_times, frequencies, shapes = [], [], [], [], []
    for r in corridors["routes"]:
        mode = r.get("mode", "trotro")
        routes.append(
            {
                "route_id": r["id"],
                "agency_id": r["agency"],
                "route_short_name": r.get("short_name", ""),
                "route_long_name": r.get("long_name", ""),
                "route_desc": MODE_DESC.get(mode, mode) + (f"; pilot corridor {r['corridor']}" if r.get("corridor") else ""),
                "route_type": str(MODE_ROUTE_TYPE.get(mode, 3)),
                "route_color": r.get("color", ""),
                "route_text_color": "FFFFFF" if r.get("color") else "",
            }
        )
        directions = [(0, list(r["stops"]))]
        if reverse_directions:
            directions.append((1, list(reversed(r["stops"]))))
        for direction, stop_ids in directions:
            used_stops.update(stop_ids)
            points = _stop_points(stop_ids, stops_def)
            shape_id = f"shp-{r['id']}-d{direction}"
            cum = 0.0
            for seq, (lat, lon) in enumerate(points):
                if seq:
                    cum += haversine_m(*points[seq - 1], lat, lon)
                shapes.append(
                    {
                        "shape_id": shape_id,
                        "shape_pt_lat": f"{lat:.6f}",
                        "shape_pt_lon": f"{lon:.6f}",
                        "shape_pt_sequence": str(seq),
                        "shape_dist_traveled": f"{cum:.1f}",
                    }
                )
            seg = _segment_seconds(points, r.get("speed_kph", 16))
            dwell = MODE_DWELL_S.get(mode, 30)
            headsign = stops_def[stop_ids[-1]]["name"]

            def add_trip(trip_id: str, start_s: int) -> None:
                trips.append(
                    {
                        "route_id": r["id"],
                        "service_id": "daily",
                        "trip_id": trip_id,
                        "trip_headsign": headsign,
                        "direction_id": str(direction),
                        "shape_id": shape_id,
                    }
                )
                t = start_s
                dist = 0.0
                for i, sid in enumerate(stop_ids):
                    if i:
                        dist += haversine_m(*points[i - 1], *points[i])
                    arrival = t
                    departure = t if i in (0, len(stop_ids) - 1) else t + dwell
                    stop_times.append(
                        {
                            "trip_id": trip_id,
                            "arrival_time": hms(arrival),
                            "departure_time": hms(departure),
                            "stop_id": sid,
                            "stop_sequence": str(i + 1),
                            "timepoint": "1" if i in (0, len(stop_ids) - 1) else "0",
                            "shape_dist_traveled": f"{dist:.1f}",
                        }
                    )
                    if i < len(seg):
                        t = departure + seg[i]

            if "headways" in r:
                trip_id = f"{r['id']}-d{direction}-freq"
                add_trip(trip_id, parse_hm(r["headways"][0][0]))
                for start, end, headway in r["headways"]:
                    frequencies.append(
                        {
                            "trip_id": trip_id,
                            "start_time": hms(parse_hm(start)),
                            "end_time": hms(parse_hm(end)),
                            "headway_secs": str(int(headway)),
                            "exact_times": "0",
                        }
                    )
            else:
                for dep in r["departures"]:
                    add_trip(f"{r['id']}-d{direction}-{dep.replace(':', '')}", parse_hm(dep))

    feed.tables["routes"] = routes
    feed.tables["trips"] = trips
    feed.tables["stop_times"] = stop_times
    feed.tables["frequencies"] = frequencies
    feed.tables["shapes"] = shapes
    feed.tables["stops"] = [
        {
            "stop_id": sid,
            "stop_name": s["name"],
            "stop_lat": f"{s['lat']:.6f}",
            "stop_lon": f"{s['lon']:.6f}",
            "location_type": "0",
        }
        for sid, s in stops_def.items()
        if sid in used_stops
    ]
    end = as_of + timedelta(days=service_days)
    feed.tables["calendar"] = [
        {
            "service_id": "daily",
            "monday": "1", "tuesday": "1", "wednesday": "1", "thursday": "1",
            "friday": "1", "saturday": "1", "sunday": "1",
            "start_date": _gtfs_date(as_of),
            "end_date": _gtfs_date(end),
        }
    ]

    fare_version = ""
    if fare_table is not None:
        current = fare_table.current(as_of)
        fare_version = current.version
        attrs, rules = [], []
        for route in routes:
            price = current.price(route["route_id"])
            if price is None:
                continue
            fare_id = f"fare-{route['route_id']}-{current.version}"
            attrs.append(
                {
                    "fare_id": fare_id,
                    "price": f"{price:.2f}",
                    "currency_type": current.currency,
                    "payment_method": "0",
                    "transfers": "0",
                }
            )
            rules.append({"fare_id": fare_id, "route_id": route["route_id"]})
        feed.tables["fare_attributes"] = attrs
        feed.tables["fare_rules"] = rules

    info = corridors.get("feed_info", {})
    feed.tables["feed_info"] = [
        {
            "feed_publisher_name": info.get("publisher_name", "Kumasi transit pilot"),
            "feed_publisher_url": info.get("publisher_url", "https://kstu.edu.gh"),
            "feed_lang": info.get("lang", "en"),
            "feed_start_date": _gtfs_date(as_of),
            "feed_end_date": _gtfs_date(end),
            "feed_version": info.get("version", "seed") + (f"+fares-{fare_version}" if fare_version else ""),
        }
    ]
    return feed
