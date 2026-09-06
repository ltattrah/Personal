"""Domain logic for the terminal loading-status board.

A station master reports "a car for Suame is loading at bay 7, half full". Reports live for a
short window (default 20 minutes) and are superseded by a newer report for the same bay. A
report marked *full* is shown as "full - leaving" for a few minutes and then drops off; a
report marked *departed* drops off immediately.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import LoadingReport, StationMaster, Terminal
from ..network import Network, get_network

OCCUPANCY_LABELS = ["empty", "quarter full", "half full", "three-quarters full", "full"]
FULL = 4
FULL_LINGER_SECONDS = 300


@dataclass
class BoardEntry:
    report_id: int
    terminal_id: str
    destination_id: str
    destination_name: str
    bay: int
    plate: str
    occupancy: int
    status: str
    age_seconds: int

    @property
    def occupancy_label(self) -> str:
        return OCCUPANCY_LABELS[self.occupancy]

    @property
    def status_label(self) -> str:
        return "full - leaving" if self.status == "full" else self.status

    def to_dict(self) -> dict:
        return {
            "report_id": self.report_id,
            "terminal_id": self.terminal_id,
            "destination_id": self.destination_id,
            "destination": self.destination_name,
            "bay": self.bay,
            "plate": self.plate,
            "occupancy": self.occupancy,
            "occupancy_label": self.occupancy_label,
            "status": self.status_label,
            "age_seconds": self.age_seconds,
        }


class LoadingService:
    def __init__(self, db: Session, ttl_seconds: int = 1200, network: Network | None = None):
        self.db = db
        self.ttl = timedelta(seconds=ttl_seconds)
        self.network = network or get_network()

    # --- reference data -------------------------------------------------------------------
    def terminals(self) -> list[Terminal]:
        return list(self.db.scalars(select(Terminal).order_by(Terminal.name)))

    def terminal(self, terminal_id: str) -> Terminal | None:
        return self.db.get(Terminal, terminal_id)

    def destinations(self, terminal_id: str) -> list[tuple[str, str]]:
        terminal = self.terminal(terminal_id)
        if terminal is None:
            return []
        return [(d, self.network.stop_name(d)) for d in terminal.destinations.split(",") if d]

    def station_master(self, msisdn: str) -> StationMaster | None:
        sm = self.db.get(StationMaster, normalise_msisdn(msisdn))
        return sm if sm and sm.active else None

    def register_station_master(self, msisdn: str, name: str, terminal_id: str) -> StationMaster:
        if self.terminal(terminal_id) is None:
            raise ValueError(f"unknown terminal {terminal_id}")
        msisdn = normalise_msisdn(msisdn)
        sm = self.db.get(StationMaster, msisdn)
        if sm is None:
            sm = StationMaster(msisdn=msisdn, name=name, terminal_id=terminal_id, active=1)
            self.db.add(sm)
        else:
            sm.name, sm.terminal_id, sm.active = name, terminal_id, 1
        self.db.commit()
        return sm

    # --- reporting -------------------------------------------------------------------------
    def report(
        self,
        terminal_id: str,
        destination_id: str,
        bay: int,
        occupancy: int,
        reported_by: str,
        plate: str = "",
        now: datetime | None = None,
    ) -> LoadingReport:
        now = (now or datetime.utcnow()).replace(microsecond=0)
        terminal = self.terminal(terminal_id)
        if terminal is None:
            raise ValueError(f"unknown terminal {terminal_id}")
        if destination_id not in terminal.destinations.split(","):
            raise ValueError(f"{destination_id} is not a destination served from {terminal_id}")
        if not 1 <= bay <= max(terminal.bays, 1):
            raise ValueError(f"bay must be between 1 and {terminal.bays}")
        if not 0 <= occupancy <= FULL:
            raise ValueError("occupancy must be 0 (empty) .. 4 (full)")
        # A new report for the same bay supersedes whatever was there.
        for old in self._active_query(terminal_id, now):
            if old.bay == bay and old.status in ("loading", "full"):
                old.status = "departed"
                old.departed_at = now
        rep = LoadingReport(
            terminal_id=terminal_id,
            destination_id=destination_id,
            bay=bay,
            plate=plate.upper().strip(),
            occupancy=occupancy,
            status="full" if occupancy == FULL else "loading",
            reported_by=normalise_msisdn(reported_by),
            reported_at=now,
        )
        self.db.add(rep)
        self.db.commit()
        return rep

    def update(self, report_id: int, occupancy: int | None = None, departed: bool = False, now: datetime | None = None) -> LoadingReport:
        now = now or datetime.utcnow()
        rep = self.db.get(LoadingReport, report_id)
        if rep is None:
            raise ValueError(f"unknown report {report_id}")
        if departed:
            rep.status = "departed"
            rep.departed_at = now
        elif occupancy is not None:
            if not 0 <= occupancy <= FULL:
                raise ValueError("occupancy must be 0..4")
            rep.occupancy = occupancy
            rep.status = "full" if occupancy == FULL else "loading"
            rep.reported_at = now  # refresh the freshness clock
        self.db.commit()
        return rep

    # --- queries ---------------------------------------------------------------------------
    def _active_query(self, terminal_id: str | None, now: datetime) -> list[LoadingReport]:
        stmt = select(LoadingReport).where(LoadingReport.reported_at >= now - self.ttl, LoadingReport.status != "departed")
        if terminal_id:
            stmt = stmt.where(LoadingReport.terminal_id == terminal_id)
        rows = list(self.db.scalars(stmt.order_by(LoadingReport.reported_at.desc())))
        linger = timedelta(seconds=FULL_LINGER_SECONDS)
        return [r for r in rows if not (r.status == "full" and now - r.reported_at > linger)]

    def _entry(self, r: LoadingReport, now: datetime) -> BoardEntry:
        return BoardEntry(
            report_id=r.id,
            terminal_id=r.terminal_id,
            destination_id=r.destination_id,
            destination_name=self.network.stop_name(r.destination_id),
            bay=r.bay,
            plate=r.plate,
            occupancy=r.occupancy,
            status=r.status,
            age_seconds=int((now - r.reported_at).total_seconds()),
        )

    def board(self, terminal_id: str, now: datetime | None = None) -> list[BoardEntry]:
        """Everything currently loading at a terminal, fullest first within each destination."""
        now = now or datetime.utcnow()
        entries = [self._entry(r, now) for r in self._active_query(terminal_id, now)]
        entries.sort(key=lambda e: (e.destination_name, -e.occupancy, e.age_seconds))
        return entries

    def find(self, terminal_id: str, destination_id: str, now: datetime | None = None) -> list[BoardEntry]:
        """Cars loading for a destination, the one leaving soonest (fullest) first."""
        return [e for e in self.board(terminal_id, now) if e.destination_id == destination_id]

    def stats(self, now: datetime | None = None) -> dict:
        now = now or datetime.utcnow()
        active = self._active_query(None, now)
        by_terminal: dict[str, int] = {}
        for r in active:
            by_terminal[r.terminal_id] = by_terminal.get(r.terminal_id, 0) + 1
        since = now - timedelta(hours=24)
        day_total = len(list(self.db.scalars(select(LoadingReport.id).where(LoadingReport.reported_at >= since))))
        return {"active_reports": len(active), "by_terminal": by_terminal, "reports_last_24h": day_total}


def normalise_msisdn(msisdn: str) -> str:
    """Store numbers as 233XXXXXXXXX regardless of how the aggregator formats them."""
    digits = "".join(ch for ch in msisdn if ch.isdigit())
    if digits.startswith("0") and len(digits) == 10:
        digits = "233" + digits[1:]
    return digits
