import json
from datetime import datetime, timedelta

import pytest
from google.transit import gtfs_realtime_pb2 as rt

from kumasi_transit.geo import haversine_m, point_along_polyline, polyline_length_m
from kumasi_transit.tracking import EtaModel, MapMatcher, PositionIngestor, PositionStore, build_feed_message, parse_tracker_message
from kumasi_transit.tracking.ingest import parse_payload
from kumasi_transit.tracking.simulator import FleetSimulator

from .conftest import NOW


def test_geo_helpers():
    assert haversine_m(6.7003, -1.6223, 6.6842, -1.5762) == pytest.approx(5400, rel=0.05)
    pts = [(6.70, -1.62), (6.70, -1.60), (6.72, -1.60)]
    total = polyline_length_m(pts)
    assert point_along_polyline(pts, 0) == pts[0]
    assert point_along_polyline(pts, total * 2) == pts[-1]
    mid = point_along_polyline(pts, total / 2)
    assert 6.69 < mid[0] < 6.73


def test_map_matching_projects_onto_route(network):
    m = MapMatcher(network)
    # A point just off the Kumasi-Accra alignment near Konongo
    r = m.match("IC-STC-ACC", 6.6165, -1.2160)
    assert r.on_route and r.offset_m < 100
    length = m.route_length_m("IC-STC-ACC")
    assert 0 < r.dist_along_m < length
    far = m.match("IC-STC-ACC", 9.4, -0.84)  # Tamale, nowhere near
    assert not far.on_route
    # Direction inference: moving towards Accra is direction 0
    assert m.infer_direction("IC-STC-ACC", [(6.68, -1.60), (6.62, -1.22)]) == 0
    assert m.infer_direction("IC-STC-ACC", [(6.62, -1.22), (6.68, -1.60)]) == 1


def test_eta_model_orders_downstream_stops(network):
    eta = EtaModel(network)
    stops = eta.etas("v", "IC-STC-ACC", 0, 10_000, NOW)
    assert [s.stop_id for s in stops] == ["KONONGO", "NKAWKAW", "NSAWAM", "ACCRA"]
    assert stops[0].seconds < stops[1].seconds < stops[-1].seconds
    # Faster observed speed -> earlier arrival
    assert eta.estimate_speed("IC-STC-ACC", [30.0, 30.0, 30.0]) > eta.default_speed_mps("IC-STC-ACC")
    assert eta.estimate_speed("IC-STC-ACC", [0.0, 0.0]) >= eta.min_speed_mps


def test_parse_tracker_formats():
    m = parse_tracker_message({"id": "STC-001", "ts": "2026-09-06T08:00:00Z", "lat": 6.68, "lon": -1.61, "spd": 17.2, "hdg": 95}, "kumasi/fleet/STC/STC-001/pos")
    assert m.vehicle_id == "STC-001" and m.operator_id == "STC" and m.speed_mps == 17.2 and m.ts == NOW
    t = parse_tracker_message({"deviceId": 42, "fixTime": 1788681600000, "latitude": 6.68, "longitude": -1.61, "speed": 10, "course": 370})
    assert t.vehicle_id == "42" and t.speed_mps == pytest.approx(5.14444) and t.heading == 10
    topic_only = parse_tracker_message({"lat": 6.68, "lon": -1.61, "speed_kph": 36}, "kumasi/fleet/VIP/VIP-101/pos")
    assert topic_only.vehicle_id == "VIP-101" and topic_only.speed_mps == 10
    with pytest.raises(ValueError):
        parse_tracker_message({"id": "x", "lat": 0, "lon": 0})
    with pytest.raises(ValueError):
        parse_tracker_message({"lat": 1, "lon": 1})
    batch = parse_payload(json.dumps([{"id": "a", "lat": 6.6, "lon": -1.6}, {"id": "b", "lat": "bad", "lon": 1}]))
    assert [b.vehicle_id for b in batch] == ["a"]


def test_store_records_matches_and_builds_gtfs_rt(db, network):
    store = PositionStore(db, network)
    ing = PositionIngestor(db, store)
    ts = NOW
    fixes = [(6.6872, -1.6132), (6.66, -1.50), (6.5994, -1.10)]  # Asafo -> past Konongo
    for lat, lon in fixes:
        ing.ingest_raw(json.dumps({"id": "STC-001", "ts": ts.isoformat() + "Z", "lat": lat, "lon": lon, "spd": 18.0}), "kumasi/fleet/STC/STC-001/pos")
        ts += timedelta(minutes=10)
    state = store.state("STC-001", now=ts)
    assert state.direction == 0 and state.match.on_route
    assert state.etas[0].stop_id == "NKAWKAW"
    # Unknown vehicle with operator in topic is auto-registered; without it, dropped.
    assert ing.ingest_raw(json.dumps({"id": "NEW-1", "lat": 6.68, "lon": -1.61}), "kumasi/fleet/VIP/NEW-1/pos") == 1
    assert ing.ingest_raw(json.dumps({"id": "GHOST", "lat": 6.68, "lon": -1.61})) == 0
    live = store.live_states(now=ts)
    assert {s.vehicle_id for s in live} >= {"STC-001"}
    msg = build_feed_message(live, now=ts)
    assert msg.header.gtfs_realtime_version == "2.0"
    vp = [e for e in msg.entity if e.HasField("vehicle") and e.vehicle.vehicle.id == "STC-001"][0]
    assert vp.vehicle.trip.route_id == "IC-STC-ACC" and vp.vehicle.stop_id == "NKAWKAW"
    tu = [e for e in msg.entity if e.HasField("trip_update") and e.trip_update.vehicle.id == "STC-001"][0]
    assert [s.stop_id for s in tu.trip_update.stop_time_update] == ["NKAWKAW", "NSAWAM", "ACCRA"]
    assert tu.trip_update.stop_time_update[0].arrival.time > int(ts.timestamp()) - 3600
    parsed = rt.FeedMessage()
    parsed.ParseFromString(msg.SerializeToString())
    assert len(parsed.entity) == len(msg.entity)


def test_simulator_feeds_pipeline(db, network):
    store = PositionStore(db, network)
    sim = FleetSimulator(network, seed=7, drop_rate=0.0)
    n = sim.run_direct(PositionIngestor(db, store), steps=5, dt_s=30, start=NOW)
    assert n == 5 * len(sim.vehicles)
    states = store.live_states(now=NOW + timedelta(minutes=3))
    assert len(states) == len(sim.vehicles)
    assert all(s.match.on_route for s in states)
    assert store.counts(now=NOW + timedelta(minutes=3))["vehicles_live"] == len(sim.vehicles)
