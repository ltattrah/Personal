# OMNeT++ reporting-cadence study

Budget line 12 of the proposal. The question: how often should a tracker report so that the
position passengers see is good enough, at the lowest M2M data cost?

`kumasi_transit.cadence` answers it analytically (mean error = v·T·(1+p)/(2(1−p)) for interval T,
speed v, loss p). This model adds what the closed form leaves out: per-report network delay,
correlated losses, speed variation, terminus dwell and store-and-forward behaviour, and it is the
place to plug in INET's LTE/NB-IoT models when the study is extended.

## Model

| Module | Role |
| --- | --- |
| `Tracker` | vehicle kinematics (random-walk speed, turn-around with dwell) + periodic report |
| `TrackerLink` | cellular uplink: datarate, random delay, packet error rate `per` |
| `Server` | keeps last received fix per vehicle; every second records `positionError` = |true − last known| and `reportAge` |

`positionError:mean` is the mean error at a random instant, the same quantity the analytic model
predicts; `sentBytes:sum` gives data volume per vehicle.

## Run

```bash
source /path/to/omnetpp-6.x/setenv
./build.sh                # builds, runs CadenceSweep (11 intervals × 3 loss rates × 3 seeds), exports CSV, prints table
./build.sh TrotroSweep    # urban variant for Phase 3 planning
```

Or in the IDE: import this folder as an existing project, open `omnetpp.ini`, run `Single`.

`analyse.py` prints simulated vs analytic mean error per interval and the cheapest interval that
keeps mean error under a threshold (default 500 m), with USD per vehicle per month.

## Extending with INET

Replace `TrackerLink` with an INET `Lte`/`NbIot`-style radio (or a `Ppp` link through a
`Router` with an `Ieee80211` fallback for depot Wi-Fi) and keep `Tracker`/`Server` as the
application layer by wrapping them in INET's `UdpBasicApp`-style socket API. The NED interface
(`out`/`in` gates, `reportInterval`, `payloadBytes`) is designed to make that swap local.
