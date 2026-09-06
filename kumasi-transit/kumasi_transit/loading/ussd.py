"""USSD menu engine for passengers and station masters.

The engine is aggregator-independent: it takes the phone number and the list of inputs the
user has entered so far in this session and returns the next screen. Adapters in
``kumasi_transit.api.ussd`` map Africa's Talking / Hubtel / Arkesel request formats onto it.

Design rules from the proposal: minimal taps for station masters, passengers first, works on any
feature phone (screens are kept under the 182-character GSM limit).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from ..gtfs.fares import FareTable
from ..network import Network, get_network
from .service import FULL, OCCUPANCY_LABELS, LoadingService

MAX_SCREEN = 182
MAX_RESULTS = 3
OCCUPANCY_MENU = ["Empty", "1/4 full", "1/2 full", "3/4 full", "Full"]


@dataclass
class UssdResponse:
    text: str
    end: bool = False

    @property
    def prefix(self) -> str:
        return "END" if self.end else "CON"


def _age(seconds: int) -> str:
    if seconds < 60:
        return "just now"
    m = seconds // 60
    return f"{m} min ago"


def _clip(text: str, limit: int = MAX_SCREEN) -> str:
    return text if len(text) <= limit else text[: limit - 3].rstrip() + "..."


class UssdEngine:
    def __init__(self, service: LoadingService, fares: FareTable | None = None, network: Network | None = None, now: datetime | None = None):
        self.service = service
        self.fares = fares
        self.network = network or get_network()
        self.now = now

    # --- entry point ---------------------------------------------------------------------
    def handle(self, msisdn: str, inputs: list[str]) -> UssdResponse:
        inputs = [i.strip() for i in inputs if i is not None and i.strip() != ""]
        master = self.service.station_master(msisdn)
        if master:
            return self._master_root(master, inputs, 0)
        return self._passenger_root(inputs, 0)

    # --- helpers -------------------------------------------------------------------------
    def _menu(self, title: str, options: list[str], inputs: list[str], i: int, error: str = "") -> tuple[int | None, int, UssdResponse | None]:
        """Present a numbered menu. Returns (choice_index, next_i, response_if_waiting)."""
        prompt = (error + "\n" if error else "") + title + "\n" + "\n".join(f"{n + 1} {o}" for n, o in enumerate(options))
        while True:
            if i >= len(inputs):
                return None, i, UssdResponse(_clip(prompt))
            raw = inputs[i]
            i += 1
            if raw.isdigit() and 1 <= int(raw) <= len(options):
                return int(raw) - 1, i, None
            prompt = "Invalid choice.\n" + title + "\n" + "\n".join(f"{n + 1} {o}" for n, o in enumerate(options))

    def _number(self, prompt: str, lo: int, hi: int, inputs: list[str], i: int) -> tuple[int | None, int, UssdResponse | None]:
        text = prompt
        while True:
            if i >= len(inputs):
                return None, i, UssdResponse(_clip(text))
            raw = inputs[i]
            i += 1
            if raw.isdigit() and lo <= int(raw) <= hi:
                return int(raw), i, None
            text = f"Enter a number {lo}-{hi}.\n" + prompt

    def _fare_line(self, origin: str, destination: str) -> str:
        if self.fares is None:
            return ""
        as_of = (self.now or datetime.utcnow()).date()
        for route, _direction in self.network.routes_between(origin, destination):
            price = self.fares.fare(route.id, as_of)
            if price is not None:
                v = self.fares.current(as_of)
                return f"Fare GHS {price:.2f} (GPRTU {v.effective_from.strftime('%d %b %Y')})"
        return ""

    # --- passenger flows -----------------------------------------------------------------
    def _passenger_root(self, inputs: list[str], i: int) -> UssdResponse:
        choice, i, waiting = self._menu("Kumasi Transit", ["Find a car", "Fares", "Station master login"], inputs, i)
        if waiting:
            return waiting
        if choice == 0:
            return self._find_car(inputs, i)
        if choice == 1:
            return self._fares(inputs, i)
        return UssdResponse("Station masters are registered by KMA/GPRTU with the pilot team. Ask your branch secretary.", end=True)

    def _find_car(self, inputs: list[str], i: int) -> UssdResponse:
        terminals = self.service.terminals()
        choice, i, waiting = self._menu("Where are you?", [t.name for t in terminals], inputs, i)
        if waiting:
            return waiting
        terminal = terminals[choice]
        dests = self.service.destinations(terminal.id)
        choice, i, waiting = self._menu(f"{terminal.name}: going to?", [name for _id, name in dests], inputs, i)
        if waiting:
            return waiting
        dest_id, dest_name = dests[choice]
        cars = self.service.find(terminal.id, dest_id, self.now)
        fare = self._fare_line(terminal.id, dest_id)
        if not cars:
            msg = f"No car reported loading for {dest_name} at {terminal.name} in the last {self.service.ttl.seconds // 60} min. Check with the station master."
            return UssdResponse(_clip(msg + ("\n" + fare if fare else "")), end=True)
        lines = [f"{terminal.name} > {dest_name}"]
        for c in cars[:MAX_RESULTS]:
            plate = f" {c.plate}" if c.plate else ""
            lines.append(f"Bay {c.bay}{plate}: {c.status_label if c.status == 'full' else c.occupancy_label}, {_age(c.age_seconds)}")
        if fare:
            lines.append(fare)
        return UssdResponse(_clip("\n".join(lines)), end=True)

    def _fares(self, inputs: list[str], i: int) -> UssdResponse:
        if self.fares is None:
            return UssdResponse("Fare information is not available yet.", end=True)
        routes = [r for r in self.network.routes.values() if r.mode in ("trotro", "shared_taxi")]
        choice, i, waiting = self._menu("Fares: choose route", [r.short_name for r in routes], inputs, i)
        if waiting:
            return waiting
        route = routes[choice]
        as_of = (self.now or datetime.utcnow()).date()
        version = self.fares.current(as_of)
        price = version.price(route.id)
        if price is None:
            return UssdResponse(f"No fare on record for {route.short_name}.", end=True)
        text = f"{route.long_name}\nGHS {price:.2f} per person\nGPRTU list of {version.effective_from.strftime('%d %b %Y')}"
        hist = self.fares.history(route.id)
        if len(hist) > 1:
            prev = hist[-2]
            text += f"\nWas GHS {prev[2]:.2f} before."
        return UssdResponse(_clip(text), end=True)

    # --- station-master flows ------------------------------------------------------------
    def _master_root(self, master, inputs: list[str], i: int) -> UssdResponse:
        terminal = self.service.terminal(master.terminal_id)
        choice, i, waiting = self._menu(
            f"{terminal.name} station", ["Report car loading", "Update / departed", "Find a car", "Fares"], inputs, i
        )
        if waiting:
            return waiting
        if choice == 0:
            return self._report(master, terminal, inputs, i)
        if choice == 1:
            return self._update(master, terminal, inputs, i)
        if choice == 2:
            return self._find_car(inputs, i)
        return self._fares(inputs, i)

    def _report(self, master, terminal, inputs: list[str], i: int) -> UssdResponse:
        dests = self.service.destinations(terminal.id)
        choice, i, waiting = self._menu("Car loading to?", [name for _id, name in dests], inputs, i)
        if waiting:
            return waiting
        dest_id, dest_name = dests[choice]
        bay, i, waiting = self._number(f"Bay number (1-{terminal.bays}):", 1, max(terminal.bays, 1), inputs, i)
        if waiting:
            return waiting
        occ, i, waiting = self._menu("How full?", OCCUPANCY_MENU, inputs, i)
        if waiting:
            return waiting
        self.service.report(terminal.id, dest_id, bay, occ, master.msisdn, now=self.now)
        return UssdResponse(_clip(f"Saved: bay {bay} to {dest_name}, {OCCUPANCY_LABELS[occ]}. Thank you. Dial again to update."), end=True)

    def _update(self, master, terminal, inputs: list[str], i: int) -> UssdResponse:
        board = self.service.board(terminal.id, self.now)[:6]
        if not board:
            return UssdResponse("Nothing is loading at your station right now. Use 'Report car loading' first.", end=True)
        labels = [f"Bay {e.bay} {e.destination_name[:12]} ({OCCUPANCY_MENU[e.occupancy]})" for e in board]
        choice, i, waiting = self._menu("Which car?", labels, inputs, i)
        if waiting:
            return waiting
        entry = board[choice]
        options = OCCUPANCY_MENU + ["Departed"]
        choice, i, waiting = self._menu(f"Bay {entry.bay} {entry.destination_name}: now", options, inputs, i)
        if waiting:
            return waiting
        if choice == len(options) - 1:
            self.service.update(entry.report_id, departed=True, now=self.now)
            return UssdResponse(f"Bay {entry.bay} to {entry.destination_name} marked departed.", end=True)
        self.service.update(entry.report_id, occupancy=choice, now=self.now)
        label = "full - leaving" if choice == FULL else OCCUPANCY_LABELS[choice]
        return UssdResponse(f"Bay {entry.bay} to {entry.destination_name}: {label}.", end=True)
