"""Command-line entry point: ``kumasi-transit <command>`` (or ``python -m kumasi_transit.cli``)."""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import date, datetime
from pathlib import Path

from .config import get_settings


def cmd_build_gtfs(args: argparse.Namespace) -> int:
    from .gtfs import FareTable, build_feed, validate_feed, write_feed

    settings = get_settings()
    fares = FareTable.load(settings.data_dir / "fares")
    as_of = date.fromisoformat(args.as_of) if args.as_of else date.today()
    feed = build_feed(fare_table=fares, as_of=as_of)
    report = validate_feed(feed, fares, as_of=as_of)
    out = Path(args.output) if args.output else settings.build_dir / "gtfs" / "kumasi-gtfs.zip"
    write_feed(feed, out)
    print(report.as_text())
    print(f"wrote {out} with fare version {fares.current(as_of).version}")
    return 0 if report.ok else 1


def cmd_validate_gtfs(args: argparse.Namespace) -> int:
    from .gtfs import FareTable, read_feed, validate_feed

    fares = FareTable.load(get_settings().data_dir / "fares") if args.with_fares else None
    report = validate_feed(read_feed(args.path), fares)
    print(report.as_text())
    return 0 if report.ok else 1


def cmd_fares(args: argparse.Namespace) -> int:
    from .gtfs import FareTable

    settings = get_settings()
    table = FareTable.load(settings.data_dir / "fares")
    if args.derive:
        version = args.version or args.effective_from
        new = table.derive(version, date.fromisoformat(args.effective_from), args.change_pct, args.source or "", base_version=args.base)
        path = table.save(new, settings.data_dir / "fares")
        print(f"wrote {path}")
        for rid, price in new.fares.items():
            print(f"  {rid:14s} {price:8.2f}")
        return 0
    as_of = date.fromisoformat(args.as_of) if args.as_of else date.today()
    current = table.current(as_of)
    print(f"Fare version {current.version} (effective {current.effective_from}; {current.source})")
    for rid, price in current.fares.items():
        hist = " <- ".join(f"{p:.2f}" for _v, _d, p in reversed(table.history(rid)))
        print(f"  {rid:14s} GHS {price:8.2f}   history: {hist}")
    return 0


def cmd_seed(args: argparse.Namespace) -> int:
    from .db import init_db, session_scope
    from .seed import seed_all

    init_db()
    db = session_scope()
    try:
        print(seed_all(db))
    finally:
        db.close()
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    uvicorn.run("kumasi_transit.api.app:app", host=args.host, port=args.port, reload=args.reload)
    return 0


def cmd_simulate(args: argparse.Namespace) -> int:
    from .tracking.simulator import FleetSimulator

    settings = get_settings()
    sim = FleetSimulator(seed=args.seed, drop_rate=args.drop_rate)
    if args.direct:
        from .db import init_db, session_scope
        from .seed import seed_all
        from .tracking import PositionIngestor

        init_db()
        db = session_scope()
        try:
            seed_all(db)
            n = sim.run_direct(PositionIngestor(db), steps=args.steps or 20, dt_s=args.interval, start=datetime.utcnow())
        finally:
            db.close()
        print(f"wrote {n} fixes directly into {settings.database_url}")
        return 0
    sent = sim.run_mqtt(settings.mqtt_host, settings.mqtt_port, interval_s=args.interval, steps=args.steps, realtime=not args.fast)
    print(f"published {sent} fixes to mqtt://{settings.mqtt_host}:{settings.mqtt_port}")
    return 0


def cmd_ingest(args: argparse.Namespace) -> int:
    from .db import init_db
    from .tracking.ingest import MqttIngestService

    init_db()
    settings = get_settings()
    print(f"subscribing to {settings.mqtt_topic} on mqtt://{settings.mqtt_host}:{settings.mqtt_port}; Ctrl-C to stop")
    try:
        n = asyncio.run(MqttIngestService(settings).run(max_messages=args.max_messages))
    except KeyboardInterrupt:
        return 0
    print(f"processed {n} fixes")
    return 0


def cmd_cadence(args: argparse.Namespace) -> int:
    from .cadence import CadenceStudy

    study = CadenceStudy(
        speed_kph=args.speed,
        loss_prob=args.loss,
        bytes_per_report=args.bytes,
        hours_per_day=args.hours,
        usd_per_mb=args.usd_per_mb,
        sim_fixed_usd_month=args.sim_fixed,
        max_error_m=args.max_error,
        budget_usd_month=args.budget,
    )
    result = study.run()
    if args.json:
        print(json.dumps({"assumptions": result.assumptions, "options": [o.__dict__ for o in result.options], "recommended": result.recommended.__dict__ if result.recommended else None}, indent=2))
        return 0
    print("Assumptions:", json.dumps(result.assumptions))
    print(result.table())
    if result.recommended:
        o = result.recommended
        print(f"\nRecommended: report every {o.interval_s:.0f} s -> p95 error {o.p95_error_m:.0f} m, {o.mb_per_month:.1f} MB/vehicle/month, USD {o.usd_per_month:.2f}/vehicle/month")
        print(f"Fleet of {args.vehicles} for {args.months} months: USD {CadenceStudy.fleet_cost(o, args.vehicles, args.months):,.0f} (proposal line 8 budget: USD 6,000)")
    else:
        print("\nNo interval satisfies the error target within budget; relax one of them.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="kumasi-transit", description="Kumasi real-time transit pilot tools")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("build-gtfs", help="build and validate the GTFS zip from the seed corridors")
    s.add_argument("--output", "-o")
    s.add_argument("--as-of", help="build date YYYY-MM-DD (chooses the fare version)")
    s.set_defaults(func=cmd_build_gtfs)

    s = sub.add_parser("validate-gtfs", help="validate an existing GTFS zip or directory (e.g. the DT4A feed)")
    s.add_argument("path")
    s.add_argument("--with-fares", action="store_true", help="also cross-check routes against the fare table")
    s.set_defaults(func=cmd_validate_gtfs)

    s = sub.add_parser("fares", help="show the fare table or derive a new version from a GPRTU announcement")
    s.add_argument("--as-of")
    s.add_argument("--derive", action="store_true")
    s.add_argument("--effective-from", help="YYYY-MM-DD of the new version")
    s.add_argument("--change-pct", type=float, help="percentage change announced, e.g. 20 or -15")
    s.add_argument("--source", help="announcement reference")
    s.add_argument("--version")
    s.add_argument("--base", help="base version id (default: latest)")
    s.set_defaults(func=cmd_fares)

    s = sub.add_parser("seed", help="create tables and load terminals, station masters and fleet")
    s.set_defaults(func=cmd_seed)

    s = sub.add_parser("serve", help="run the API and dashboards")
    s.add_argument("--host", default="0.0.0.0")
    s.add_argument("--port", type=int, default=8000)
    s.add_argument("--reload", action="store_true")
    s.set_defaults(func=cmd_serve)

    s = sub.add_parser("simulate", help="simulate the intercity fleet (publishes to MQTT, or --direct into the DB)")
    s.add_argument("--direct", action="store_true", help="skip MQTT and write straight into the database")
    s.add_argument("--interval", type=float, default=30.0, help="reporting interval in seconds")
    s.add_argument("--steps", type=int, help="number of reporting rounds (default: run forever over MQTT, 20 for --direct)")
    s.add_argument("--fast", action="store_true", help="do not sleep between rounds")
    s.add_argument("--seed", type=int, default=1)
    s.add_argument("--drop-rate", type=float, default=0.02)
    s.set_defaults(func=cmd_simulate)

    s = sub.add_parser("ingest", help="run the MQTT -> database ingest service")
    s.add_argument("--max-messages", type=int)
    s.set_defaults(func=cmd_ingest)

    s = sub.add_parser("cadence", help="reporting-cadence vs data-cost study (analytic model)")
    s.add_argument("--speed", type=float, default=60.0, help="typical intercity speed km/h")
    s.add_argument("--loss", type=float, default=0.05, help="report loss probability")
    s.add_argument("--bytes", type=int, default=180, help="bytes per report incl. MQTT/TCP/IP overhead")
    s.add_argument("--hours", type=float, default=14.0, help="operating hours per day")
    s.add_argument("--usd-per-mb", type=float, default=0.02)
    s.add_argument("--sim-fixed", type=float, default=1.0, help="fixed SIM fee USD/month")
    s.add_argument("--max-error", type=float, default=500.0, help="tolerated p95 position error, metres")
    s.add_argument("--budget", type=float, help="max USD per vehicle per month")
    s.add_argument("--vehicles", type=int, default=70)
    s.add_argument("--months", type=int, default=14)
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_cadence)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
