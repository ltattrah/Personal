"""Versioned fare table tied to GPRTU announcements.

GPRTU revises fares often (a 20 % rise on 2 June 2026, a ~15 % cut in May 2025), so fares are
kept *outside* the static GTFS as dated versions. The GTFS builder stamps the version that is
current on the build date into ``fare_attributes.txt`` and the USSD service always answers from
the version in force on the day of the query.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path


@dataclass
class FareVersion:
    version: str
    effective_from: date
    fares: dict[str, float]
    currency: str = "GHS"
    source: str = ""
    change_pct: float | None = None
    derived_from: str | None = None
    notes: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: dict) -> "FareVersion":
        return cls(
            version=d["version"],
            effective_from=date.fromisoformat(d["effective_from"]),
            fares={k: float(v) for k, v in d["fares"].items()},
            currency=d.get("currency", "GHS"),
            source=d.get("source", ""),
            change_pct=d.get("change_pct"),
            derived_from=d.get("derived_from"),
            notes=list(d.get("notes", [])),
        )

    def to_dict(self) -> dict:
        d = asdict(self)
        d["effective_from"] = self.effective_from.isoformat()
        return d

    def price(self, route_id: str) -> float | None:
        return self.fares.get(route_id)


def round_to(value: float, step: float) -> float:
    """Round to the nearest ``step`` (GPRTU fare lists are printed in 10-pesewa steps)."""
    q = Decimal(str(step))
    return float((Decimal(str(value)) / q).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * q)


class FareTable:
    """All known fare versions, ordered by effective date."""

    def __init__(self, versions: list[FareVersion]):
        self.versions = sorted(versions, key=lambda v: (v.effective_from, v.version))
        ids = [v.version for v in self.versions]
        if len(ids) != len(set(ids)):
            raise ValueError(f"duplicate fare version ids: {ids}")

    @classmethod
    def load(cls, directory: Path | str) -> "FareTable":
        directory = Path(directory)
        versions = [FareVersion.from_dict(json.loads(p.read_text(encoding="utf-8"))) for p in sorted(directory.glob("*.json"))]
        return cls(versions)

    def get(self, version: str) -> FareVersion:
        for v in self.versions:
            if v.version == version:
                return v
        raise KeyError(version)

    def current(self, as_of: date | None = None) -> FareVersion:
        as_of = as_of or date.today()
        applicable = [v for v in self.versions if v.effective_from <= as_of]
        if not applicable:
            raise LookupError(f"no fare version in force on {as_of}")
        return applicable[-1]

    def fare(self, route_id: str, as_of: date | None = None) -> float | None:
        return self.current(as_of).price(route_id)

    def history(self, route_id: str) -> list[tuple[str, date, float]]:
        return [(v.version, v.effective_from, v.fares[route_id]) for v in self.versions if route_id in v.fares]

    def derive(
        self,
        version: str,
        effective_from: date,
        change_pct: float,
        source: str,
        base_version: str | None = None,
        step: float = 0.10,
        overrides: dict[str, float] | None = None,
    ) -> FareVersion:
        """Create a new version by applying a percentage change announced by GPRTU.

        Individual routes can be overridden when the printed list differs from the blanket change.
        """
        base = self.get(base_version) if base_version else self.versions[-1]
        factor = 1 + change_pct / 100.0
        fares = {rid: round_to(price * factor, step) for rid, price in base.fares.items()}
        if overrides:
            fares.update({k: float(v) for k, v in overrides.items()})
        new = FareVersion(
            version=version,
            effective_from=effective_from,
            fares=fares,
            currency=base.currency,
            source=source,
            change_pct=change_pct,
            derived_from=base.version,
        )
        self.versions.append(new)
        self.versions.sort(key=lambda v: (v.effective_from, v.version))
        return new

    def save(self, version: FareVersion, directory: Path | str) -> Path:
        directory = Path(directory)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{version.version}.json"
        path.write_text(json.dumps(version.to_dict(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return path
