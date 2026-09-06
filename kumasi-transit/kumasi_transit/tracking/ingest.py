"""Tracker message parsing and the MQTT -> asyncio -> store ingest service.

Accepted payload shapes (JSON):

* pilot trackers / gateways: ``{"id": "STC-001", "ts": "2026-09-06T08:00:00Z", "lat": 6.68, "lon": -1.61, "spd": 17.2, "hdg": 95}``
  (``spd`` in m/s; ``speed_kph`` is also accepted) plus optional ``route_id`` / ``trip_id``;
* Traccar-style forwarders: ``{"deviceId": ..., "fixTime": ..., "latitude": ..., "longitude": ..., "speed": <knots>, "course": ...}``.

The vehicle id may also come from the topic ``kumasi/fleet/<operator>/<vehicle>/pos`` when the
payload does not carry one. Store-and-forward trackers send batches as a JSON list.
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Iterable

from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..db import session_scope
from .store import PositionStore

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class TrackerMessage:
    vehicle_id: str
    ts: datetime
    lat: float
    lon: float
    speed_mps: float | None = None
    heading: float | None = None
    route_id: str | None = None
    trip_id: str | None = None
    operator_id: str | None = None


def _parse_ts(value) -> datetime:
    if value is None:
        return datetime.utcnow().replace(microsecond=0)
    if isinstance(value, (int, float)):
        if value > 1e12:  # milliseconds
            value /= 1000.0
        return datetime.fromtimestamp(value, tz=timezone.utc).replace(tzinfo=None)
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def parse_tracker_message(payload: dict, topic: str | None = None) -> TrackerMessage:
    """Normalise one tracker record; raises ValueError when a mandatory field is missing."""
    topic_parts = topic.split("/") if topic else []
    operator_id = topic_parts[2] if len(topic_parts) >= 5 and topic_parts[0] == "kumasi" else payload.get("operator_id")
    vehicle_id = payload.get("id") or payload.get("vehicle_id") or payload.get("deviceId") or payload.get("uniqueId")
    if not vehicle_id and len(topic_parts) >= 5:
        vehicle_id = topic_parts[3]
    if not vehicle_id:
        raise ValueError("tracker message has no vehicle id")
    try:
        lat = float(payload.get("lat", payload.get("latitude")))
        lon = float(payload.get("lon", payload.get("lng", payload.get("longitude"))))
    except (TypeError, ValueError) as exc:
        raise ValueError("tracker message has no valid lat/lon") from exc
    if not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 0 and lon == 0):
        raise ValueError(f"implausible fix {lat},{lon}")
    speed = None
    if "spd" in payload and payload["spd"] is not None:
        speed = float(payload["spd"])
    elif payload.get("speed_kph") is not None:
        speed = float(payload["speed_kph"]) / 3.6
    elif payload.get("speed") is not None:  # Traccar reports knots
        speed = float(payload["speed"]) * 0.514444
    heading = payload.get("hdg", payload.get("heading", payload.get("course")))
    return TrackerMessage(
        vehicle_id=str(vehicle_id),
        ts=_parse_ts(payload.get("ts", payload.get("fixTime", payload.get("timestamp")))),
        lat=lat,
        lon=lon,
        speed_mps=speed,
        heading=None if heading is None else float(heading) % 360.0,
        route_id=payload.get("route_id"),
        trip_id=payload.get("trip_id"),
        operator_id=operator_id,
    )


def parse_payload(raw: bytes | str, topic: str | None = None) -> list[TrackerMessage]:
    data = json.loads(raw)
    records = data if isinstance(data, list) else [data]
    out = []
    for rec in records:
        try:
            out.append(parse_tracker_message(rec, topic))
        except ValueError as exc:
            log.warning("dropping tracker record on %s: %s", topic, exc)
    return out


class PositionIngestor:
    """Writes parsed tracker messages into the position store, auto-registering unknown vehicles
    when the operator id is known from the topic."""

    def __init__(self, db: Session, store: PositionStore | None = None, auto_register: bool = True):
        self.db = db
        self.store = store or PositionStore(db)
        self.auto_register = auto_register
        self.accepted = 0
        self.rejected = 0

    def ingest(self, messages: Iterable[TrackerMessage]) -> int:
        n = 0
        for m in messages:
            if self.store.vehicle(m.vehicle_id) is None:
                if self.auto_register and m.operator_id:
                    self.store.register_vehicle(m.vehicle_id, m.operator_id, route_id=m.route_id)
                else:
                    self.rejected += 1
                    log.warning("unknown vehicle %s (no operator in topic); dropping", m.vehicle_id)
                    continue
            self.store.record(m.vehicle_id, m.ts, m.lat, m.lon, m.speed_mps, m.heading, m.route_id, m.trip_id)
            n += 1
        self.accepted += n
        return n

    def ingest_raw(self, raw: bytes | str, topic: str | None = None) -> int:
        return self.ingest(parse_payload(raw, topic))


class MqttIngestService:
    """Bridges a paho-mqtt client (its own network thread) into an asyncio queue, then drains the
    queue into the database in batches. Run with ``asyncio.run(MqttIngestService().run())``."""

    def __init__(self, settings: Settings | None = None, session_factory: Callable[[], Session] = session_scope, batch_size: int = 100):
        self.settings = settings or get_settings()
        self.session_factory = session_factory
        self.batch_size = batch_size
        self.queue: asyncio.Queue[tuple[str, bytes]] = asyncio.Queue()
        self._stop = threading.Event()

    def _client(self, loop: asyncio.AbstractEventLoop):
        import paho.mqtt.client as mqtt

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="kumasi-transit-ingest")

        def on_connect(c, _userdata, _flags, reason_code, _props=None):
            log.info("MQTT connected (%s); subscribing to %s", reason_code, self.settings.mqtt_topic)
            c.subscribe(self.settings.mqtt_topic, qos=1)

        def on_message(_c, _userdata, msg):
            loop.call_soon_threadsafe(self.queue.put_nowait, (msg.topic, bytes(msg.payload)))

        client.on_connect = on_connect
        client.on_message = on_message
        return client

    async def run(self, max_messages: int | None = None) -> int:
        loop = asyncio.get_running_loop()
        client = self._client(loop)
        client.connect_async(self.settings.mqtt_host, self.settings.mqtt_port, keepalive=60)
        client.loop_start()
        processed = 0
        try:
            while not self._stop.is_set():
                topic, payload = await self.queue.get()
                batch = [(topic, payload)]
                while not self.queue.empty() and len(batch) < self.batch_size:
                    batch.append(self.queue.get_nowait())
                processed += await loop.run_in_executor(None, self._write_batch, batch)
                if max_messages is not None and processed >= max_messages:
                    break
        finally:
            client.loop_stop()
            client.disconnect()
        return processed

    def _write_batch(self, batch: list[tuple[str, bytes]]) -> int:
        db = self.session_factory()
        try:
            ing = PositionIngestor(db)
            return sum(ing.ingest_raw(payload, topic) for topic, payload in batch)
        finally:
            db.close()

    def stop(self) -> None:
        self._stop.set()
