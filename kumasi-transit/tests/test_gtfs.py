from datetime import date

from kumasi_transit.gtfs import Feed, build_feed, read_feed, validate_feed, write_feed
from kumasi_transit.gtfs.builder import hms, parse_hm

AS_OF = date(2026, 9, 6)


def test_builder_produces_valid_feed(fares):
    feed = build_feed(fare_table=fares, as_of=AS_OF)
    report = validate_feed(feed, fares, as_of=AS_OF)
    assert report.ok, report.as_text()
    assert report.stats["routes"] == 12
    # Every trotro route gets a frequency-based trip per direction; coaches get one trip per departure.
    freq_trips = {r["trip_id"] for r in feed["frequencies"]}
    assert "C1-KJT-TECH-d0-freq" in freq_trips and "C1-KJT-TECH-d1-freq" in freq_trips
    assert any(t["trip_id"] == "IC-STC-ACC-d0-0400" for t in feed["trips"])
    # Fares are stamped from the version in force on the build date.
    assert feed["feed_info"][0]["feed_version"].endswith("+fares-2026-06-02")
    prices = {r["fare_id"]: r["price"] for r in feed["fare_attributes"]}
    assert prices["fare-C1-KJT-TECH-2026-06-02"] == "4.80"


def test_stop_times_are_monotonic_and_plausible(fares):
    feed = build_feed(fare_table=fares, as_of=AS_OF)
    by_trip = {}
    for row in feed["stop_times"]:
        by_trip.setdefault(row["trip_id"], []).append(row)
    for trip_id, rows in by_trip.items():
        times = [parse_hm(r["arrival_time"]) for r in rows]
        assert times == sorted(times), trip_id
        assert len(rows) >= 2


def test_roundtrip_zip_and_directory(fares, tmp_path):
    feed = build_feed(fare_table=fares, as_of=AS_OF)
    zpath = write_feed(feed, tmp_path / "kumasi.zip")
    dpath = write_feed(feed, tmp_path / "kumasi_dir")
    for path in (zpath, dpath):
        again = read_feed(path)
        assert again.summary() == {k: v for k, v in feed.summary().items() if v}
        assert validate_feed(again, fares, as_of=AS_OF).ok


def test_validator_catches_broken_feeds(fares):
    feed = build_feed(fare_table=fares, as_of=AS_OF)
    # dangling stop reference
    feed["stop_times"][0]["stop_id"] = "NOWHERE"
    # stop outside Ghana
    feed["stops"][0]["stop_lat"] = "51.5"
    # duplicated route id
    feed["routes"].append(dict(feed["routes"][0]))
    report = validate_feed(feed, fares, as_of=AS_OF)
    assert not report.ok
    text = report.as_text()
    assert "unknown stop 'NOWHERE'" in text
    assert "outside Ghana" in text
    assert "duplicate route_id" in text


def test_validator_flags_implausible_speed():
    feed = Feed(
        {
            "agency": [{"agency_id": "a", "agency_name": "A", "agency_url": "http://a", "agency_timezone": "Africa/Accra"}],
            "stops": [
                {"stop_id": "s1", "stop_name": "One", "stop_lat": "6.70", "stop_lon": "-1.62"},
                {"stop_id": "s2", "stop_name": "Two", "stop_lat": "6.68", "stop_lon": "-1.58"},
            ],
            "routes": [{"route_id": "r", "agency_id": "a", "route_type": "3"}],
            "trips": [{"route_id": "r", "service_id": "d", "trip_id": "t"}],
            "stop_times": [
                {"trip_id": "t", "arrival_time": "08:00:00", "departure_time": "08:00:00", "stop_id": "s1", "stop_sequence": "1"},
                {"trip_id": "t", "arrival_time": "08:00:30", "departure_time": "08:00:30", "stop_id": "s2", "stop_sequence": "2"},
            ],
            "calendar": [{"service_id": "d", "monday": "1", "tuesday": "1", "wednesday": "1", "thursday": "1", "friday": "1", "saturday": "1", "sunday": "1", "start_date": "20260101", "end_date": "20271231"}],
        }
    )
    report = validate_feed(feed)
    assert any("implausible" in e for e in report.errors)


def test_missing_required_table():
    report = validate_feed(Feed({"agency": [{"agency_name": "x", "agency_url": "y", "agency_timezone": "z"}]}))
    assert not report.ok and any("stops.txt" in e for e in report.errors)


def test_time_helpers():
    assert hms(parse_hm("25:05:07")) == "25:05:07"
    assert parse_hm("05:30") == 19800
