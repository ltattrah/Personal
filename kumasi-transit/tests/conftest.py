from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest

from kumasi_transit.config import Settings
from kumasi_transit.db import init_db, reset_engine, session_scope
from kumasi_transit.gtfs import FareTable
from kumasi_transit.network import get_network
from kumasi_transit.seed import seed_all

NOW = datetime(2026, 9, 6, 8, 0, 0)


@pytest.fixture
def db():
    reset_engine()
    init_db("sqlite://")
    session = session_scope()
    seed_all(session)
    yield session
    session.close()
    reset_engine()


@pytest.fixture(scope="session")
def fares() -> FareTable:
    return FareTable.load(Path(__file__).resolve().parents[1] / "data" / "fares")


@pytest.fixture(scope="session")
def network():
    return get_network()


@pytest.fixture
def client(tmp_path):
    from fastapi.testclient import TestClient

    from kumasi_transit.api import create_app

    reset_engine()
    settings = Settings(database_url="sqlite://", build_dir=tmp_path / "build", tracker_api_key="test-key")
    app = create_app(settings)
    with TestClient(app) as c:
        yield c
    reset_engine()
