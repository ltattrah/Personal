"""Encode live vehicle states as a GTFS-Realtime FeedMessage (vehicle positions + trip updates).

The trip_id convention matches the static feed built by ``kumasi_transit.gtfs.builder``:
``<route_id>-d<direction>-<HHMM>`` for scheduled coaches. When an operator has not told us which
departure a vehicle is running, the TripUpdate carries only route_id and direction_id, which
OpenTripPlanner accepts for ADDED/unscheduled trips as long as the route exists.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

from google.protobuf.json_format import MessageToDict
from google.transit import gtfs_realtime_pb2 as rt

from .store import VehicleState

OCCUPANCY_UNKNOWN = rt.VehiclePosition.OccupancyStatus.Value("NO_DATA_AVAILABLE")


def _epoch(dt: datetime) -> int:
    return int(dt.replace(tzinfo=timezone.utc).timestamp())


def build_feed_message(states: list[VehicleState], include_trip_updates: bool = True, now: datetime | None = None) -> rt.FeedMessage:
    msg = rt.FeedMessage()
    msg.header.gtfs_realtime_version = "2.0"
    msg.header.incrementality = rt.FeedHeader.FULL_DATASET
    msg.header.timestamp = _epoch(now) if now else int(time.time())
    for s in states:
        ent = msg.entity.add()
        ent.id = f"vp-{s.vehicle_id}"
        vp = ent.vehicle
        vp.vehicle.id = s.vehicle_id
        vp.vehicle.label = s.plate or s.vehicle_id
        vp.position.latitude = s.lat
        vp.position.longitude = s.lon
        if s.heading is not None:
            vp.position.bearing = float(s.heading)
        if s.speed_mps is not None:
            vp.position.speed = float(s.speed_mps)
        vp.timestamp = _epoch(s.ts)
        vp.occupancy_status = OCCUPANCY_UNKNOWN
        if s.route_id:
            vp.trip.route_id = s.route_id
            vp.trip.direction_id = s.direction
            if s.trip_id:
                vp.trip.trip_id = s.trip_id
                vp.trip.schedule_relationship = rt.TripDescriptor.SCHEDULED
            else:
                vp.trip.schedule_relationship = rt.TripDescriptor.UNSCHEDULED
        if s.etas:
            vp.current_status = rt.VehiclePosition.IN_TRANSIT_TO
            vp.stop_id = s.etas[0].stop_id
            vp.current_stop_sequence = s.etas[0].stop_sequence
        if include_trip_updates and s.route_id and s.etas:
            tent = msg.entity.add()
            tent.id = f"tu-{s.vehicle_id}"
            tu = tent.trip_update
            tu.trip.CopyFrom(vp.trip)
            tu.vehicle.CopyFrom(vp.vehicle)
            tu.timestamp = vp.timestamp
            for e in s.etas:
                stu = tu.stop_time_update.add()
                stu.stop_id = e.stop_id
                stu.stop_sequence = e.stop_sequence
                stu.arrival.time = _epoch(e.eta)
                stu.arrival.uncertainty = max(60, e.seconds // 10)
                stu.schedule_relationship = rt.TripUpdate.StopTimeUpdate.SCHEDULED
    return msg


def feed_to_dict(msg: rt.FeedMessage) -> dict:
    return MessageToDict(msg, preserving_proto_field_name=True)
