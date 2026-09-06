"""An in-memory GTFS feed: a mapping of table name -> list of row dicts, with zip/directory I/O."""
from __future__ import annotations

import csv
import io
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

REQUIRED_TABLES = ("agency", "stops", "routes", "trips", "stop_times")
KNOWN_TABLES = REQUIRED_TABLES + (
    "calendar",
    "calendar_dates",
    "frequencies",
    "shapes",
    "feed_info",
    "fare_attributes",
    "fare_rules",
)


@dataclass
class Feed:
    tables: dict[str, list[dict[str, str]]] = field(default_factory=dict)

    def __getitem__(self, name: str) -> list[dict[str, str]]:
        return self.tables.get(name, [])

    def __contains__(self, name: str) -> bool:
        return name in self.tables and bool(self.tables[name])

    def ids(self, table: str, column: str) -> set[str]:
        return {row[column] for row in self[table] if row.get(column)}

    def summary(self) -> dict[str, int]:
        return {name: len(rows) for name, rows in self.tables.items()}


def _columns(rows: list[dict[str, str]]) -> list[str]:
    cols: list[str] = []
    for row in rows:
        for key in row:
            if key not in cols:
                cols.append(key)
    return cols


def table_to_csv(rows: list[dict[str, str]]) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_columns(rows), lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: ("" if v is None else v) for k, v in row.items()})
    return buf.getvalue()


def write_feed(feed: Feed, path: Path | str) -> Path:
    """Write the feed as a GTFS zip (``path`` ends in .zip) or as a directory of .txt files."""
    path = Path(path)
    if path.suffix == ".zip":
        path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for name, rows in feed.tables.items():
                if rows:
                    zf.writestr(f"{name}.txt", table_to_csv(rows))
    else:
        path.mkdir(parents=True, exist_ok=True)
        for name, rows in feed.tables.items():
            if rows:
                (path / f"{name}.txt").write_text(table_to_csv(rows), encoding="utf-8")
    return path


def _parse_csv(text: str) -> list[dict[str, str]]:
    text = text.lstrip("﻿")
    reader = csv.DictReader(io.StringIO(text))
    return [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in reader]


def read_feed(path: Path | str) -> Feed:
    """Read a GTFS zip or directory (e.g. the existing DT4A Kumasi feed) into memory."""
    path = Path(path)
    tables: dict[str, list[dict[str, str]]] = {}
    if path.is_dir():
        for file in sorted(path.glob("*.txt")):
            tables[file.stem] = _parse_csv(file.read_text(encoding="utf-8"))
    else:
        with zipfile.ZipFile(path) as zf:
            for member in zf.namelist():
                base = Path(member).name
                if base.endswith(".txt") and not member.startswith("__MACOSX"):
                    tables[base[:-4]] = _parse_csv(zf.read(member).decode("utf-8"))
    return Feed(tables)
