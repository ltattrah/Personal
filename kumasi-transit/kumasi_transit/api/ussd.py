"""USSD aggregator adapters.

Ghanaian aggregators differ in what they send on each hop:

* **Africa's Talking style** (also used by many local gateways): form-encoded ``sessionId``,
  ``phoneNumber``, ``text`` where ``text`` is the whole input history joined by ``*``; the reply is
  plain text prefixed ``CON`` (continue) or ``END``.
* **Hubtel**: JSON with ``SessionId``, ``Mobile``, ``Type`` (``Initiation``/``Response``/``Timeout``),
  ``Message`` (only the latest input); reply JSON ``Type`` ``Response``/``Release``.
* **Arkesel** (and NALO, which is similar): JSON ``sessionID``, ``msisdn``, ``newSession``, ``userData``;
  reply ``message`` + ``continueSession``.

For the two "latest input only" formats the input history is kept in ``ussd_sessions``.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..db import UssdSessionState
from ..loading.ussd import UssdEngine, UssdResponse

SESSION_TTL = timedelta(minutes=10)


def _load_history(db: Session, session_id: str, msisdn: str, new_session: bool, now: datetime) -> list[str]:
    row = db.get(UssdSessionState, session_id)
    if new_session or row is None or now - row.updated_at > SESSION_TTL:
        return []
    return json.loads(row.state).get("inputs", [])


def _save_history(db: Session, session_id: str, msisdn: str, inputs: list[str], end: bool, now: datetime) -> None:
    row = db.get(UssdSessionState, session_id)
    if end:
        if row is not None:
            db.delete(row)
    else:
        if row is None:
            row = UssdSessionState(session_id=session_id, msisdn=msisdn)
            db.add(row)
        row.state = json.dumps({"inputs": inputs})
        row.updated_at = now
    db.commit()


def handle_africastalking(engine: UssdEngine, phone_number: str, text: str) -> str:
    inputs = [t for t in (text or "").split("*") if t != ""]
    resp = engine.handle(phone_number, inputs)
    return f"{resp.prefix} {resp.text}"


def handle_hubtel(engine: UssdEngine, db: Session, body: dict, now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    session_id = str(body.get("SessionId", ""))
    msisdn = str(body.get("Mobile", ""))
    kind = str(body.get("Type", "Initiation"))
    if kind == "Timeout":
        _save_history(db, session_id, msisdn, [], True, now)
        return {"SessionId": session_id, "Type": "Release", "Message": "Session ended.", "Label": "", "DataType": "display", "FieldType": "text"}
    inputs = _load_history(db, session_id, msisdn, kind == "Initiation", now)
    if kind != "Initiation":
        inputs = inputs + [str(body.get("Message", ""))]
    resp: UssdResponse = engine.handle(msisdn, inputs)
    _save_history(db, session_id, msisdn, inputs, resp.end, now)
    return {
        "SessionId": session_id,
        "Type": "Release" if resp.end else "Response",
        "Message": resp.text,
        "Label": "Kumasi Transit",
        "DataType": "display" if resp.end else "input",
        "FieldType": "text",
    }


def handle_arkesel(engine: UssdEngine, db: Session, body: dict, now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    session_id = str(body.get("sessionID", ""))
    msisdn = str(body.get("msisdn", body.get("userID", "")))
    new_session = bool(body.get("newSession", False))
    inputs = _load_history(db, session_id, msisdn, new_session, now)
    if not new_session:
        inputs = inputs + [str(body.get("userData", ""))]
    resp = engine.handle(msisdn, inputs)
    _save_history(db, session_id, msisdn, inputs, resp.end, now)
    return {"sessionID": session_id, "userID": body.get("userID", msisdn), "msisdn": msisdn, "message": resp.text, "continueSession": not resp.end}
