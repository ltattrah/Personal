"""Runtime settings, read from environment variables or a ``.env`` file."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PACKAGE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = PACKAGE_DIR.parent
DATA_DIR = PROJECT_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./kumasi_transit.db"
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_topic: str = "kumasi/fleet/+/+/pos"
    loading_report_ttl_seconds: int = 1200
    build_dir: Path = PROJECT_DIR / "build"
    data_dir: Path = DATA_DIR
    tracker_api_key: str = "change-me"
    # Kumasi bounding box used by the GTFS validator for urban corridors (lat/lon degrees).
    kumasi_bbox: tuple[float, float, float, float] = (6.55, -1.80, 6.85, -1.45)
    # Ghana bounding box used for intercity routes.
    ghana_bbox: tuple[float, float, float, float] = (4.5, -3.3, 11.2, 1.3)


@lru_cache
def get_settings() -> Settings:
    return Settings()
