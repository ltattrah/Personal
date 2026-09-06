"""Reporting-cadence study: how often should a tracker report, given SIM data cost and the
position error passengers can tolerate? The analytic model here brackets the design space; the
OMNeT++/INET model in ``omnet/`` refines it with network delay and loss."""
from .model import CadenceOption, CadenceStudy, StudyResult

__all__ = ["CadenceOption", "CadenceStudy", "StudyResult"]
