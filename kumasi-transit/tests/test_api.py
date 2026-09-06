from datetime import datetime

from google.transit import gtfs_realtime_pb2 as rt


def test_health_and_open_data(client):
    assert client.get("/health").json()["gtfs_valid"] is True
    r = client.get("/gtfs/kumasi-gtfs.zip")
    assert r.status_code == 200 and r.content[:2] == b"PK"
    assert client.get("/gtfs/validation").json()["ok"]
    fares = client.get("/api/fares").json()
    assert fares["current"]["version"] == "2026-06-02"
    assert client.get("/api/fares/NOPE").status_code == 404
    assert len(client.get("/api/routes").json()) == 12
    assert client.get("/api/routes/IC-STC-ACC/shape").json()["points"][0] == [6.6872, -1.6132]


def test_loading_status_over_json_and_ussd(client):
    # unknown station master rejected
    body = {"msisdn": "0200000000", "destination_id": "TECHJCN", "bay": 7, "occupancy": 2}
    assert client.post("/api/terminals/KEJETIA/reports", json=body).status_code == 403
    # station master of another terminal rejected
    body["msisdn"] = "0240000002"
    assert client.post("/api/terminals/KEJETIA/reports", json=body).status_code == 403
    body["msisdn"] = "0240000001"
    r = client.post("/api/terminals/KEJETIA/reports", json=body)
    assert r.status_code == 201
    report_id = r.json()["report_id"]
    assert client.post("/api/terminals/KEJETIA/reports", json={**body, "destination_id": "ACCRA"}).status_code == 422

    found = client.get("/api/terminals/KEJETIA/find", params={"destination": "TECHJCN"}).json()
    assert found["loading"][0]["bay"] == 7 and found["fare"]["price"] == 4.8
    board = client.get("/api/terminals/KEJETIA/board").json()["loading"]
    assert len(board) == 1
    assert client.get("/api/terminals/NOWHERE/board").status_code == 404

    # Africa's Talking style callback
    text = client.post("/ussd/africastalking", data={"sessionId": "s", "phoneNumber": "+233551234567", "text": "1*2*1"}).text
    assert text.startswith("END Kejetia > Tech Junction") and "Bay 7" in text

    # Hubtel: only the latest input per hop, state kept server-side
    def hubtel(kind, message):
        return client.post("/ussd/hubtel", json={"SessionId": "h1", "Mobile": "0551234567", "Type": kind, "Message": message}).json()

    assert hubtel("Initiation", "*920#")["Type"] == "Response"
    assert "Where are you?" in hubtel("Response", "1")["Message"]
    hubtel("Response", "2")
    final = hubtel("Response", "1")
    assert final["Type"] == "Release" and "Bay 7" in final["Message"]

    # Arkesel
    a = client.post("/ussd/arkesel", json={"sessionID": "a1", "userID": "u", "msisdn": "233240000001", "newSession": True, "userData": "*920#"}).json()
    assert a["continueSession"] and "Kejetia station" in a["message"]

    # update via app, then departed
    r = client.patch(f"/api/reports/{report_id}", json={"msisdn": "0240000001", "occupancy": 4})
    assert r.status_code == 200 and r.json()["status"] == "full"
    client.patch(f"/api/reports/{report_id}", json={"msisdn": "0240000001", "departed": True})
    assert client.get("/api/terminals/KEJETIA/board").json()["loading"] == []


def test_station_master_admin(client):
    body = {"msisdn": "0200000000", "name": "New", "terminal_id": "SUAME"}
    assert client.post("/api/station-masters", json=body).status_code == 401
    assert client.post("/api/station-masters", json=body, headers={"X-Admin-Key": "test-key"}).status_code == 201
    r = client.post("/api/terminals/SUAME/reports", json={"msisdn": "0200000000", "destination_id": "KEJETIA", "bay": 2, "occupancy": 1})
    assert r.status_code == 201


def test_tracking_http_ingest_and_gtfs_rt(client):
    now = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    fix = {"id": "STC-001", "ts": now, "lat": 6.6165, "lon": -1.2160, "spd": 16, "hdg": 100}
    assert client.post("/api/tracking/positions", json=fix).status_code == 401
    r = client.post("/api/tracking/positions", json=[fix, {"id": "GHOST", "ts": now, "lat": 6.6, "lon": -1.2}], headers={"X-Tracker-Key": "test-key"})
    assert r.status_code == 202 and r.json() == {"accepted": 1, "rejected": 1}
    v = client.get("/api/vehicles/STC-001").json()
    assert v["on_route"] and v["next_stops"][0]["stop_id"] == "NKAWKAW"
    assert client.get("/api/vehicles/GHOST").status_code == 404
    assert client.get("/api/vehicles", params={"operator": "STC"}).json()[0]["vehicle_id"] == "STC-001"
    assert client.get("/api/operators").json() == [{"operator_id": "STC", "vehicles_live": 1}]
    assert len(client.get("/api/vehicles/STC-001/track").json()) == 1

    pb = client.get("/gtfs-rt/feed.pb")
    assert pb.headers["content-type"] == "application/x-protobuf"
    msg = rt.FeedMessage()
    msg.ParseFromString(pb.content)
    assert {e.id for e in msg.entity} == {"vp-STC-001", "tu-STC-001"}
    vp_only = rt.FeedMessage()
    vp_only.ParseFromString(client.get("/gtfs-rt/vehicle-positions.pb").content)
    assert [e.id for e in vp_only.entity] == ["vp-STC-001"]
    assert client.get("/gtfs-rt/feed.json").json()["entity"][0]["vehicle"]["trip"]["route_id"] == "IC-STC-ACC"


def test_dashboards_render(client):
    for path in ("/", "/passenger", "/dashboard/terminal/KEJETIA", "/dashboard/operator/STC", "/ussd/simulate?text=1"):
        r = client.get(path)
        assert r.status_code == 200, path
    assert client.get("/dashboard/terminal/NOWHERE").status_code == 404
    assert "Where are you?" in client.get("/ussd/simulate", params={"text": "1"}).text


def test_terminal_app_login_and_offline_report(client):
    assert client.get("/api/station-masters/0200000000").status_code == 404
    me = client.get("/api/station-masters/0240000004").json()
    assert me["terminal_id"] == "SUAME" and me["bays"] == 16
    # A report queued offline 30 minutes ago arrives with its original time and is already stale.
    from datetime import datetime, timedelta

    old = (datetime.utcnow() - timedelta(minutes=30)).isoformat() + "Z"
    r = client.post("/api/terminals/SUAME/reports", json={"msisdn": "0240000004", "destination_id": "KEJETIA", "bay": 1, "occupancy": 2, "reported_at": old})
    assert r.status_code == 201 and r.json()["reported_at"].startswith(old[:16])
    assert client.get("/api/terminals/SUAME/board").json()["loading"] == []
    # Future timestamps are clamped to now.
    future = (datetime.utcnow() + timedelta(hours=1)).isoformat() + "Z"
    r = client.post("/api/terminals/SUAME/reports", json={"msisdn": "0240000004", "destination_id": "KEJETIA", "bay": 2, "occupancy": 2, "reported_at": future})
    assert r.status_code == 201
    assert client.get("/api/terminals/SUAME/board").json()["loading"][0]["age_seconds"] <= 5
