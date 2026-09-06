#!/usr/bin/env python3
"""Summarise the OMNeT++ cadence sweep and compare it with the analytic model.

Usage:  opp_scavetool export -F CSV-R -o results/cadence.csv results/*.sca
        python3 analyse.py results/cadence.csv [--usd-per-mb 0.02] [--max-error 500]

CSV-R has one row per scalar with the run's iteration variables in separate rows; we join on
the run id.
"""
from __future__ import annotations

import argparse
import csv
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    from kumasi_transit.cadence import CadenceStudy
except ImportError:  # running outside the repo
    CadenceStudy = None  # type: ignore


def load(path: str):
    runs: dict[str, dict] = defaultdict(lambda: {"itervars": {}, "scalars": {}})
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            run = row["run"]
            if row["type"] == "itervar":
                runs[run]["itervars"][row["attrname"]] = row["attrvalue"]
            elif row["type"] == "scalar":
                runs[run]["scalars"][(row["module"], row["name"])] = float(row["value"])
    return runs


def summarise(runs: dict, usd_per_mb: float, sim_fixed: float, hours_per_day: float = 14.0):
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for run in runs.values():
        iv = run["itervars"]
        if "T" not in iv:
            continue
        groups[(iv["T"], iv.get("per", "?"))].append(run["scalars"])
    rows = []
    for (T, per), scalars in sorted(groups.items(), key=lambda kv: (float(kv[0][1]), float(kv[0][0].rstrip("s")))):
        means, maxes, bytes_hour = [], [], []
        for sc in scalars:
            err_mean = [v for (m, n), v in sc.items() if n == "positionError:mean"]
            err_max = [v for (m, n), v in sc.items() if n == "positionError:max"]
            sent = sum(v for (m, n), v in sc.items() if n == "sentBytes:sum")
            trackers = sum(1 for (m, n), v in sc.items() if n == "sentBytes:sum")
            if err_mean:
                means.append(err_mean[0])
                maxes.append(err_max[0])
            if trackers:
                bytes_hour.append(sent / trackers / (4 - 10 / 60))  # sim-time 4h minus warm-up
        if not means:
            continue
        mb_month = statistics.mean(bytes_hour) * hours_per_day * 30 / 1e6 if bytes_hour else float("nan")
        rows.append({
            "T": float(T.rstrip("s")), "per": float(per),
            "mean_err": statistics.mean(means), "max_err": statistics.mean(maxes),
            "mb_month": mb_month, "usd_month": sim_fixed + mb_month * usd_per_mb,
        })
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--usd-per-mb", type=float, default=0.02)
    ap.add_argument("--sim-fixed", type=float, default=1.0)
    ap.add_argument("--max-error", type=float, default=500.0, help="tolerated mean error (m) for the recommendation")
    args = ap.parse_args()
    rows = summarise(load(args.csv), args.usd_per_mb, args.sim_fixed)
    if not rows:
        print("no CadenceSweep results found in", args.csv)
        return 1
    print(f"{'T (s)':>6} {'PER':>5} {'sim mean err (m)':>17} {'sim max err (m)':>16} {'model mean (m)':>15} {'MB/month':>9} {'USD/month':>10}")
    for r in rows:
        model = CadenceStudy(speed_kph=60, loss_prob=r["per"]).evaluate(r["T"]).mean_error_m if CadenceStudy else float("nan")
        print(f"{r['T']:6.0f} {r['per']:5.2f} {r['mean_err']:17.0f} {r['max_err']:16.0f} {model:15.0f} {r['mb_month']:9.2f} {r['usd_month']:10.2f}")
    for per in sorted({r["per"] for r in rows}):
        ok = [r for r in rows if r["per"] == per and r["mean_err"] <= args.max_error]
        if ok:
            best = max(ok, key=lambda r: r["T"])
            print(f"PER {per:.2f}: report every {best['T']:.0f} s keeps mean error <= {args.max_error:.0f} m at USD {best['usd_month']:.2f}/vehicle/month")
    return 0


if __name__ == "__main__":
    sys.exit(main())
