from datetime import date

import pytest

from kumasi_transit.gtfs.fares import FareTable, FareVersion, round_to


def test_current_version_by_date(fares):
    assert fares.current(date(2026, 1, 1)).version == "2025-05-24"
    assert fares.current(date(2026, 6, 2)).version == "2026-06-02"
    assert fares.fare("C1-KJT-TECH", date(2026, 6, 1)) == 4.0
    assert fares.fare("C1-KJT-TECH", date(2026, 9, 6)) == 4.8
    with pytest.raises(LookupError):
        fares.current(date(2020, 1, 1))


def test_history_is_chronological(fares):
    hist = fares.history("IC-STC-ACC")
    assert [h[0] for h in hist] == ["2025-05-24", "2026-06-02"]
    assert hist[-1][2] == pytest.approx(132.0)


def test_derive_applies_percentage_and_rounds(tmp_path, fares):
    table = FareTable(list(fares.versions))
    new = table.derive("2026-10-01", date(2026, 10, 1), 10.0, "GPRTU test", overrides={"C4-KJT-ABK": 7.0})
    assert new.derived_from == "2026-06-02"
    assert new.fares["C1-KJT-TECH"] == pytest.approx(5.3)  # 4.80 * 1.10 = 5.28 -> 5.30
    assert new.fares["C4-KJT-ABK"] == 7.0
    assert table.current(date(2026, 10, 2)).version == "2026-10-01"
    path = table.save(new, tmp_path)
    reloaded = FareTable.load(tmp_path)
    assert reloaded.versions[0].fares == new.fares


def test_round_to():
    assert round_to(5.28, 0.10) == 5.3
    assert round_to(5.25, 0.10) == 5.3
    assert round_to(131.99, 0.10) == 132.0


def test_duplicate_versions_rejected():
    v = FareVersion("x", date(2026, 1, 1), {"r": 1.0})
    with pytest.raises(ValueError):
        FareTable([v, v])
