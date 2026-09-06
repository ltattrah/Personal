import pytest

from kumasi_transit.cadence import CadenceStudy
from kumasi_transit.cadence.model import interval_for_error, monte_carlo_error


def test_closed_form_matches_simulation():
    study = CadenceStudy(speed_kph=60, loss_prob=0.1)
    for t in (10, 30, 60):
        opt = study.evaluate(t)
        mean, p95 = monte_carlo_error(t, 60, 0.1, seed=1, samples=40000)
        assert opt.mean_error_m == pytest.approx(mean, rel=0.03)
        assert opt.p95_error_m == pytest.approx(p95, rel=0.08)


def test_recommendation_is_cheapest_feasible():
    result = CadenceStudy(speed_kph=60, loss_prob=0.05, max_error_m=500).run()
    rec = result.recommended
    assert rec is not None
    assert rec.p95_error_m <= 500 + 1e-6
    # every longer interval violates the error target
    assert all(o.p95_error_m > 500 for o in result.options if o.interval_s > rec.interval_s)
    # data volume falls with the interval, cost includes the fixed SIM fee
    mbs = [o.mb_per_month for o in result.options]
    assert mbs == sorted(mbs, reverse=True)
    assert all(o.usd_per_month >= 1.0 for o in result.options)


def test_budget_constraint_and_inverse():
    result = CadenceStudy(max_error_m=100, budget_usd_month=1.1).run()
    assert result.recommended is None  # 100 m needs ~5 s reporting which blows the budget
    t = interval_for_error(60, 184.0, 0.05)
    assert CadenceStudy(speed_kph=60, loss_prob=0.05).evaluate(t).mean_error_m == pytest.approx(184.0)
    assert CadenceStudy.fleet_cost(result.options[0], 70, 14) == pytest.approx(result.options[0].usd_per_month * 980)
