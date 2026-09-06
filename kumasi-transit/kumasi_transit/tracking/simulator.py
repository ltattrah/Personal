"""Fleet simulator: moves the demo vehicles along their route shapes and emits tracker messages.

Used for development, dashboards demos and for exercising the ingest pipeline before real
trackers arrive. It can publish to an MQTT broker (the production path) or feed a
``PositionIngestor`` directly (tests, single-process demo).
"""
from __future__ import annotations

import json
import random
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from ..config import DATA_DIR
from ..geo import bearing_deg, destination_point, point_along_polyline, polyline_length_m
from ..network import Network, get_network


@dataclass
class SimVehicle:
    vehicle_id: str
    operator_id: str
    route_id: str
    direction: int
    dist_along_m: float
    speed_mps: float
    dwell_left_s: float = 0.0


class FleetSimulator:
    def __init__(
        self,
        network: Network | None = None,
        fleet_path: Path | str | None = None,
        seed: int | None = None,
        gps_noise_m: float = 8.0,
        drop_rate: float = 0.02,
    ):
        self.network = network or get_network()
        self.rng = random.Random(seed)
        self.gps_noise_m = gps_noise_m
        self.drop_rate = drop_rate
        path = Path(fleet_path) if fleet_path else DATA_DIR / "fleet.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        self.vehicles: list[SimVehicle] = []
        self._shapes: dict[tuple[str, int], tuple[list[tuple[float, float]], float]] = {}
        for v in data["vehicles"]:
            route = self.network.routes[v["route_id"]]
            direction = self.rng.choice([0, 1])
            pts, length = self.shape(route.id, direction)
            self.vehicles.append(
                SimVehicle(
                    vehicle_id=v["id"],
                    operator_id=v["operator_id"],
                    route_id=route.id,
                    direction=direction,
                    dist_along_m=self.rng.uniform(0, length),
                    speed_mps=route.speed_kph / 3.6 * self.rng.uniform(0.85, 1.15),
                )
            )

    def shape(self, route_id: str, direction: int) -> tuple[list[tuple[float, float]], float]:
        key = (route_id, direction)
        if key not in self._shapes:
            pts = self.network.shape_points(route_id, direction)
            self._shapes[key] = (pts, polyline_length_m(pts))
        return self._shapes[key]

    def step(self, dt_s: float, now: datetime) -> list[dict]:
        """Advance every vehicle by ``dt_s`` seconds and return the tracker payloads it would send."""
        out = []
        for v in self.vehicles:
            pts, length = self.shape(v.route_id, v.direction)
            if v.dwell_left_s > 0:
                v.dwell_left_s -= dt_s
                speed = 0.0
            else:
                base = self.network.routes[v.route_id].speed_kph / 3.6
                v.speed_mps = max(2.0, min(base * 1.3, v.speed_mps + self.rng.gauss(0, 0.6)))
                v.dist_along_m += v.speed_mps * dt_s
                speed = v.speed_mps
                if v.dist_along_m >= length:  # turn around at the terminus after a layover
                    v.direction = 1 - v.direction
                    v.dist_along_m = 0.0
                    v.dwell_left_s = 600.0
            lat, lon = point_along_polyline(pts, v.dist_along_m)
            ahead = point_along_polyline(pts, min(length, v.dist_along_m + 50))
            heading = bearing_deg(lat, lon, *ahead) if ahead != (lat, lon) else 0.0
            if self.gps_noise_m:
                lat, lon = destination_point(lat, lon, self.rng.uniform(0, 360), abs(self.rng.gauss(0, self.gps_noise_m)))
            if self.rng.random() < self.drop_rate:
                continue  # lost report (the cadence study quantifies this)
            out.append(
                {
                    "id": v.vehicle_id,
                    "operator_id": v.operator_id,
                    "ts": now.replace(microsecond=0).isoformat() + "Z",
                    "lat": round(lat, 6),
                    "lon": round(lon, 6),
                    "spd": round(speed, 2),
                    "hdg": round(heading, 1),
                    "route_id": v.route_id,
                }
            )
        return out

    @staticmethod
    def topic(payload: dict) -> str:
        return f"kumasi/fleet/{payload['operator_id']}/{payload['id']}/pos"

    def run_direct(self, ingestor, steps: int, dt_s: float = 30.0, start: datetime | None = None) -> int:
        """Feed the ingestor directly (no broker); returns number of fixes accepted."""
        now = start or datetime.utcnow() - timedelta(seconds=steps * dt_s)
        n = 0
        for _ in range(steps):
            for payload in self.step(dt_s, now):
                n += ingestor.ingest_raw(json.dumps(payload), self.topic(payload))
            now += timedelta(seconds=dt_s)
        return n

    def run_mqtt(self, host: str, port: int, interval_s: float = 30.0, steps: int | None = None, realtime: bool = True) -> int:
        import paho.mqtt.client as mqtt

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="kumasi-transit-simulator")
        client.connect(host, port, keepalive=60)
        client.loop_start()
        sent = 0
        i = 0
        try:
            while steps is None or i < steps:
                now = datetime.utcnow()
                for payload in self.step(interval_s, now):
                    client.publish(self.topic(payload), json.dumps(payload), qos=1)
                    sent += 1
                i += 1
                if realtime:
                    time.sleep(interval_s)
        finally:
            client.loop_stop()
            client.disconnect()
        return sent
