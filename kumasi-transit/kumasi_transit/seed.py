"""Load reference data (terminals, demo station masters, fleet vehicles) into the database."""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy.orm import Session

from .config import DATA_DIR
from .db import StationMaster, Terminal, Vehicle
from .loading.service import normalise_msisdn
from .network import get_network


def seed_terminals(db: Session, path: Path | str | None = None) -> int:
    path = Path(path) if path else DATA_DIR / "terminals.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    network = get_network()
    n = 0
    for t in data["terminals"]:
        stop = network.stops[t["id"]]
        row = db.get(Terminal, t["id"])
        if row is None:
            row = Terminal(id=t["id"])
            db.add(row)
        row.name = t["name"]
        row.lat, row.lon = stop.lat, stop.lon
        row.bays = int(t.get("bays", 10))
        row.destinations = ",".join(t["destinations"])
        n += 1
    for sm in data.get("station_masters", []):
        msisdn = normalise_msisdn(sm["msisdn"])
        row = db.get(StationMaster, msisdn)
        if row is None:
            row = StationMaster(msisdn=msisdn)
            db.add(row)
        row.name, row.terminal_id, row.active = sm["name"], sm["terminal_id"], 1
    db.commit()
    return n


def seed_fleet(db: Session, path: Path | str | None = None) -> int:
    path = Path(path) if path else DATA_DIR / "fleet.json"
    if not Path(path).exists():
        return 0
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    n = 0
    for v in data["vehicles"]:
        row = db.get(Vehicle, v["id"])
        if row is None:
            row = Vehicle(id=v["id"])
            db.add(row)
        row.operator_id = v["operator_id"]
        row.plate = v.get("plate", "")
        row.route_id = v.get("route_id")
        row.tracker_id = v.get("tracker_id", "")
        n += 1
    db.commit()
    return n


def seed_all(db: Session) -> dict[str, int]:
    return {"terminals": seed_terminals(db), "vehicles": seed_fleet(db)}
