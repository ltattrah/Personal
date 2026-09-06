"""SQLAlchemy engine/session management and ORM models.

SQLite is the default so the whole pilot runs on a laptop; set ``DATABASE_URL`` to a
PostGIS/TimescaleDB instance for production (see ``docker-compose.yml``).
"""
from __future__ import annotations

from datetime import datetime
from typing import Iterator

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import get_settings


class Base(DeclarativeBase):
    pass


class Terminal(Base):
    __tablename__ = "terminals"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    bays: Mapped[int] = mapped_column(Integer, default=10)
    # Comma-separated destination ids served from this terminal (denormalised for USSD speed).
    destinations: Mapped[str] = mapped_column(Text, default="")


class StationMaster(Base):
    __tablename__ = "station_masters"

    msisdn: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    terminal_id: Mapped[str] = mapped_column(ForeignKey("terminals.id"))
    active: Mapped[int] = mapped_column(Integer, default=1)


class LoadingReport(Base):
    __tablename__ = "loading_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    terminal_id: Mapped[str] = mapped_column(ForeignKey("terminals.id"), index=True)
    destination_id: Mapped[str] = mapped_column(String(32), index=True)
    bay: Mapped[int] = mapped_column(Integer)
    plate: Mapped[str] = mapped_column(String(16), default="")
    occupancy: Mapped[int] = mapped_column(Integer)  # 0..4 -> empty, quarter, half, three-quarters, full
    status: Mapped[str] = mapped_column(String(12), default="loading")  # loading | departed
    reported_by: Mapped[str] = mapped_column(String(20))
    reported_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    departed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    operator_id: Mapped[str] = mapped_column(String(32), index=True)
    plate: Mapped[str] = mapped_column(String(16), default="")
    route_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    trip_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tracker_id: Mapped[str] = mapped_column(String(32), default="")


class Position(Base):
    """One tracker report. In TimescaleDB this table becomes a hypertable on ``ts``."""

    __tablename__ = "positions"
    __table_args__ = (Index("ix_positions_vehicle_ts", "vehicle_id", "ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vehicle_id: Mapped[str] = mapped_column(String(32))
    ts: Mapped[datetime] = mapped_column(DateTime)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    speed_mps: Mapped[float | None] = mapped_column(Float, nullable=True)
    heading: Mapped[float | None] = mapped_column(Float, nullable=True)
    route_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    trip_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    direction: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Map-matching output
    matched_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    matched_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    dist_along_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    offset_m: Mapped[float | None] = mapped_column(Float, nullable=True)


class UssdSessionState(Base):
    """Server-side USSD session memory; aggregators only echo back the latest input."""

    __tablename__ = "ussd_sessions"

    session_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    msisdn: Mapped[str] = mapped_column(String(20))
    state: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime)


_engine = None
_SessionLocal: sessionmaker[Session] | None = None


def get_engine(url: str | None = None):
    global _engine, _SessionLocal
    if _engine is None or url is not None:
        url = url or get_settings().database_url
        kwargs: dict = {}
        if url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False}
            if url in ("sqlite://", "sqlite:///:memory:"):
                kwargs["poolclass"] = StaticPool  # one shared in-memory DB across threads (tests, demos)
        _engine = create_engine(url, future=True, **kwargs)
        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def init_db(url: str | None = None) -> None:
    engine = get_engine(url)
    Base.metadata.create_all(engine)


def reset_engine() -> None:
    """Drop the cached engine (used by tests to point at a fresh database)."""
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None


def session_scope() -> Session:
    if _SessionLocal is None:
        get_engine()
    assert _SessionLocal is not None
    return _SessionLocal()


def get_db() -> Iterator[Session]:
    """FastAPI dependency."""
    db = session_scope()
    try:
        yield db
    finally:
        db.close()
