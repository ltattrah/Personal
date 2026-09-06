#!/usr/bin/env bash
# Build and run the cadence sweep. Requires OMNeT++ 6.x on PATH (source <omnetpp>/setenv).
set -euo pipefail
cd "$(dirname "$0")"
opp_makemake -f --deep -o kumasi_cadence
make -j"$(nproc)" MODE=release
./kumasi_cadence -u Cmdenv -c "${1:-CadenceSweep}"
# Export scalars for analyse.py (CSV-R layout: one row per scalar/itervar)
opp_scavetool export -F CSV-R -o results/cadence.csv results/*.sca
python3 analyse.py results/cadence.csv
