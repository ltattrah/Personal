from datetime import timedelta

import pytest

from kumasi_transit.loading import LoadingService, UssdEngine
from kumasi_transit.loading.service import normalise_msisdn

from .conftest import NOW


@pytest.fixture
def svc(db):
    return LoadingService(db, ttl_seconds=1200)


def test_normalise_msisdn():
    assert normalise_msisdn("0240000001") == "233240000001"
    assert normalise_msisdn("+233 24 000 0001") == "233240000001"
    assert normalise_msisdn("233240000001") == "233240000001"


def test_report_and_find(svc):
    svc.report("KEJETIA", "TECHJCN", 7, 2, "0240000001", plate="gr 1234-20", now=NOW)
    svc.report("KEJETIA", "TECHJCN", 9, 3, "0240000001", now=NOW + timedelta(minutes=1))
    svc.report("KEJETIA", "SUAME", 12, 0, "0240000001", now=NOW + timedelta(minutes=2))
    cars = svc.find("KEJETIA", "TECHJCN", now=NOW + timedelta(minutes=3))
    assert [c.bay for c in cars] == [9, 7]  # fullest first
    assert cars[1].plate == "GR 1234-20"
    assert cars[0].age_seconds == 120
    assert len(svc.board("KEJETIA", now=NOW + timedelta(minutes=3))) == 3
    assert svc.find("ASAFO", "TECHJCN", now=NOW) == []


def test_reports_expire_and_new_bay_report_supersedes(svc):
    first = svc.report("KEJETIA", "TECHJCN", 7, 1, "0240000001", now=NOW)
    svc.report("KEJETIA", "SUAME", 7, 2, "0240000001", now=NOW + timedelta(minutes=1))
    board = svc.board("KEJETIA", now=NOW + timedelta(minutes=1))
    assert [(e.bay, e.destination_id) for e in board] == [(7, "SUAME")]
    assert svc.db.get(type(first), first.id).status == "departed"
    assert svc.board("KEJETIA", now=NOW + timedelta(minutes=25)) == []


def test_full_lingers_then_drops_and_departed_drops_immediately(svc):
    rep = svc.report("ASAFO", "ACCRA", 3, 4, "0240000002", now=NOW)
    assert svc.board("ASAFO", now=NOW + timedelta(minutes=2))[0].status_label == "full - leaving"
    assert svc.board("ASAFO", now=NOW + timedelta(minutes=6)) == []
    rep2 = svc.report("ASAFO", "ACCRA", 4, 2, "0240000002", now=NOW)
    svc.update(rep2.id, departed=True, now=NOW + timedelta(seconds=30))
    # the departed car is gone at once; the full one is still shown as leaving
    assert [e.bay for e in svc.board("ASAFO", now=NOW + timedelta(minutes=1))] == [3]
    assert rep.status == "full"


def test_validation_errors(svc):
    with pytest.raises(ValueError):
        svc.report("KEJETIA", "ACCRA", 1, 1, "0240000001", now=NOW)  # not served from Kejetia
    with pytest.raises(ValueError):
        svc.report("KEJETIA", "TECHJCN", 99, 1, "0240000001", now=NOW)
    with pytest.raises(ValueError):
        svc.report("KEJETIA", "TECHJCN", 1, 7, "0240000001", now=NOW)
    with pytest.raises(ValueError):
        svc.register_station_master("0200000000", "x", "NOWHERE")


def test_station_master_registration(svc):
    assert svc.station_master("0200000000") is None
    svc.register_station_master("0200000000", "New master", "SUAME")
    assert svc.station_master("+233200000000").terminal_id == "SUAME"


class TestUssd:
    @pytest.fixture
    def engine(self, svc, fares):
        return UssdEngine(svc, fares, now=NOW)

    @staticmethod
    def walk(engine, phone, path):
        return engine.handle(phone, path.split("*") if path else [])

    def test_passenger_root(self, engine):
        r = self.walk(engine, "0551234567", "")
        assert not r.end and r.text.startswith("Kumasi Transit\n1 Find a car")

    def test_station_master_reports_then_passenger_finds(self, engine):
        r = self.walk(engine, "0240000001", "")
        assert "Kejetia station" in r.text and "Report car loading" in r.text
        r = self.walk(engine, "0240000001", "1*1*7*3")
        assert r.end and "Saved: bay 7" in r.text
        r = self.walk(engine, "0551234567", "1*2*1")
        assert r.end
        assert "Bay 7: half full" in r.text
        assert "Fare GHS 4.80" in r.text

    def test_invalid_input_is_skipped_not_fatal(self, engine):
        r = self.walk(engine, "0551234567", "9")
        assert not r.end and r.text.startswith("Invalid choice.")
        r = self.walk(engine, "0551234567", "9*1")
        assert "Where are you?" in r.text

    def test_no_car_message(self, engine):
        r = self.walk(engine, "0551234567", "1*2*3")
        assert r.end and "No car reported" in r.text

    def test_fares_menu(self, engine):
        r = self.walk(engine, "0551234567", "2*1")
        assert r.end and "GHS 4.80" in r.text and "Was GHS 4.00" in r.text

    def test_update_flow(self, engine):
        self.walk(engine, "0240000001", "1*1*7*3")
        r = self.walk(engine, "0240000001", "2")
        assert "Bay 7" in r.text
        r = self.walk(engine, "0240000001", "2*1*6")
        assert r.end and "departed" in r.text
        assert self.walk(engine, "0240000001", "2").text.startswith("Nothing is loading")

    def test_screens_fit_feature_phones(self, engine):
        for phone, path in [("0551234567", ""), ("0551234567", "1"), ("0551234567", "1*2"), ("0240000002", ""), ("0240000002", "1")]:
            assert len(self.walk(engine, phone, path).text) <= 182
