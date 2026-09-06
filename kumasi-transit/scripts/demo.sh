#!/usr/bin/env bash
# One-command local demo without Docker: SQLite database, simulated fleet, API on :8000.
set -euo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL="${DATABASE_URL:-sqlite:///./kumasi_transit.db}"
kumasi-transit seed
kumasi-transit build-gtfs
kumasi-transit simulate --direct --steps 30 --interval 30
echo
echo "Open http://localhost:8000 (city), /passenger, /dashboard/terminal/KEJETIA, /dashboard/operator/STC"
echo "USSD walkthrough: http://localhost:8000/ussd/simulate?phone=0240000001&text=1*1*7*3"
kumasi-transit serve --port "${PORT:-8000}"
