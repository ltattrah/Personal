"""Phase 2: intercity vehicle tracking.

MQTT -> asyncio ingest -> position store -> map-matching and ETA -> GTFS-Realtime.
"""
from .eta import EtaModel, StopEta
from .gtfsrt import build_feed_message, feed_to_dict
from .ingest import PositionIngestor, TrackerMessage, parse_tracker_message
from .mapmatch import MapMatcher, MatchResult
from .store import PositionStore, VehicleState

__all__ = [
    "EtaModel",
    "MapMatcher",
    "MatchResult",
    "PositionIngestor",
    "PositionStore",
    "StopEta",
    "TrackerMessage",
    "VehicleState",
    "build_feed_message",
    "feed_to_dict",
    "parse_tracker_message",
]
