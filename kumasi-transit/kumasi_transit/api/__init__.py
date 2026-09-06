"""FastAPI service exposing the GTFS feed, loading-status board, USSD callbacks, tracker ingest,
GTFS-Realtime and the dashboards."""
from .app import create_app

__all__ = ["create_app"]
