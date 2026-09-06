"""Analytic model of reporting interval vs. data cost vs. position error.

Between two reports the server extrapolates nothing (the feed shows the last fix), so the error
seen by a passenger at a random instant is the distance travelled since the last *received*
report. With interval T, speed v and independent loss probability p per report, the gap since
the last received report is a geometric mixture of T, 2T, ...; the expected error at a uniformly
random instant is  v * T * (1 + p) / (2 (1 - p))  and the 95th percentile follows from the same
mixture. Data volume is one report per T seconds (each ``bytes_per_report`` including MQTT/TCP/IP
overhead) for ``hours_per_day`` of operation; monthly cost adds the SIM's fixed fee.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass(frozen=True)
class CadenceOption:
    interval_s: float
    mean_error_m: float
    p95_error_m: float
    reports_per_day: float
    mb_per_month: float
    usd_per_month: float
    feed_latency_s: float


@dataclass
class StudyResult:
    options: list[CadenceOption]
    recommended: CadenceOption | None
    assumptions: dict = field(default_factory=dict)

    def table(self) -> str:
        head = f"{'T (s)':>6} {'mean err (m)':>13} {'p95 err (m)':>12} {'reports/day':>12} {'MB/month':>9} {'USD/month':>10} {'latency (s)':>12}"
        lines = [head, "-" * len(head)]
        for o in self.options:
            mark = " <- recommended" if self.recommended is o else ""
            lines.append(
                f"{o.interval_s:6.0f} {o.mean_error_m:13.0f} {o.p95_error_m:12.0f} {o.reports_per_day:12.0f} {o.mb_per_month:9.2f} {o.usd_per_month:10.2f} {o.feed_latency_s:12.1f}{mark}"
            )
        return "\n".join(lines)


class CadenceStudy:
    def __init__(
        self,
        speed_kph: float = 60.0,
        loss_prob: float = 0.05,
        bytes_per_report: int = 180,
        hours_per_day: float = 14.0,
        days_per_month: float = 30.0,
        usd_per_mb: float = 0.02,
        sim_fixed_usd_month: float = 1.0,
        network_latency_s: float = 2.0,
        max_error_m: float = 500.0,
        budget_usd_month: float | None = None,
    ):
        self.speed_mps = speed_kph / 3.6
        self.p = loss_prob
        self.bytes_per_report = bytes_per_report
        self.hours_per_day = hours_per_day
        self.days_per_month = days_per_month
        self.usd_per_mb = usd_per_mb
        self.sim_fixed = sim_fixed_usd_month
        self.latency = network_latency_s
        self.max_error_m = max_error_m
        self.budget = budget_usd_month

    def evaluate(self, interval_s: float) -> CadenceOption:
        p = self.p
        mean_err = self.speed_mps * interval_s * (1 + p) / (2 * (1 - p))
        p95_err = self.speed_mps * self._p95_gap(interval_s)
        reports_day = self.hours_per_day * 3600 / interval_s
        mb_month = reports_day * self.days_per_month * self.bytes_per_report / 1e6
        usd = self.sim_fixed + mb_month * self.usd_per_mb
        return CadenceOption(interval_s, mean_err, p95_err, reports_day, mb_month, usd, self.latency + interval_s / 2)

    def _p95_gap(self, interval_s: float) -> float:
        """95th percentile of time since last received report, at a uniformly random instant."""
        p = self.p
        if p <= 0:
            return 0.95 * interval_s
        # P(gap <= k*T + u) for k >= 0, 0 <= u < T:  prob of last k reports lost = p^k; within
        # the window the instant is uniform. Solve numerically on the mixture CDF.
        def cdf(x: float) -> float:
            k, u = divmod(x, interval_s)
            k = int(k)
            # gap in [0, T): received last report (prob 1-p) and uniform; general term p^j (1-p)
            total = 0.0
            for j in range(k):
                total += (1 - p) * p**j
            total += (1 - p) * p**k * (u / interval_s)
            return total

        lo, hi = 0.0, interval_s * 50
        for _ in range(60):
            mid = (lo + hi) / 2
            if cdf(mid) < 0.95:
                lo = mid
            else:
                hi = mid
        return hi

    def run(self, intervals: list[float] | None = None) -> StudyResult:
        intervals = intervals or [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300]
        options = [self.evaluate(t) for t in intervals]
        feasible = [o for o in options if o.p95_error_m <= self.max_error_m + 1e-6 and (self.budget is None or o.usd_per_month <= self.budget)]
        recommended = max(feasible, key=lambda o: o.interval_s) if feasible else None  # cheapest that meets the error target
        return StudyResult(
            options=options,
            recommended=recommended,
            assumptions={
                "speed_kph": round(self.speed_mps * 3.6, 1),
                "loss_prob": self.p,
                "bytes_per_report": self.bytes_per_report,
                "hours_per_day": self.hours_per_day,
                "usd_per_mb": self.usd_per_mb,
                "sim_fixed_usd_month": self.sim_fixed,
                "max_p95_error_m": self.max_error_m,
                "budget_usd_month": self.budget,
            },
        )

    @staticmethod
    def fleet_cost(option: CadenceOption, vehicles: int, months: int) -> float:
        return option.usd_per_month * vehicles * months


def interval_for_error(speed_kph: float, target_mean_error_m: float, loss_prob: float = 0.05) -> float:
    """Inverse model: the longest interval whose mean error stays under the target."""
    v = speed_kph / 3.6
    return target_mean_error_m * 2 * (1 - loss_prob) / (v * (1 + loss_prob))


def monte_carlo_error(interval_s: float, speed_kph: float, loss_prob: float, seed: int = 0, samples: int = 20000) -> tuple[float, float]:
    """Simulation cross-check of the closed form (mean, p95) used by the tests."""
    import random

    rng = random.Random(seed)
    v = speed_kph / 3.6
    errs = []
    for _ in range(samples):
        gap = rng.random() * interval_s
        while rng.random() < loss_prob:
            gap += interval_s
        errs.append(v * gap)
    errs.sort()
    return sum(errs) / len(errs), errs[int(0.95 * len(errs))]
