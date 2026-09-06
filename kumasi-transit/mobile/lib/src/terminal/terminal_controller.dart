import 'package:flutter/foundation.dart';

import '../api/client.dart';
import '../models.dart';
import '../storage/local_store.dart';

/// State for the station-master app. Reports are written to the local queue first and flushed to
/// the API in order; a report that cannot be sent keeps its original time so the server can judge
/// its freshness when it finally arrives.
class TerminalController extends ChangeNotifier {
  TerminalController(
      {required this.api, required this.store, DateTime Function()? clock})
      : _clock = clock ?? (() => DateTime.now().toUtc());

  final TransitApi api;
  final LocalStore store;
  final DateTime Function() _clock;

  StationMaster? master;
  Terminal? terminal;
  List<PendingReport> queue = const [];
  List<LoadingEntry> board = const [];
  bool busy = false;
  bool offline = false;
  String? error;
  String? notice;

  bool get loggedIn => master != null;

  Future<void> init() async {
    master = store.stationMaster;
    queue = store.queue;
    _loadTerminalFromCache();
    notifyListeners();
    if (master != null) {
      await flushQueue();
      await refreshBoard();
    }
  }

  // --- login ---------------------------------------------------------------------------------
  Future<bool> login(String msisdn) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      master = await api.lookupStationMaster(msisdn.trim());
      await store.saveStationMaster(master);
      offline = false;
      await _refreshTerminals();
      await refreshBoard();
      return true;
    } on NetworkException {
      offline = true;
      error =
          'No connection. Connect once to sign in; after that the app works offline.';
      return false;
    } on ApiException catch (e) {
      error = e.statusCode == 404
          ? 'This number is not registered as a station master. Ask the pilot team.'
          : e.message;
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    master = null;
    terminal = null;
    board = const [];
    await store.saveStationMaster(null);
    notifyListeners();
  }

  // --- reporting -----------------------------------------------------------------------------
  Future<void> report(
      {required Destination destination,
      required int bay,
      required int occupancy,
      String plate = ''}) async {
    final m = master;
    if (m == null) return;
    final pending = PendingReport(
      msisdn: m.msisdn,
      terminalId: m.terminalId,
      destinationId: destination.id,
      destinationName: destination.name,
      bay: bay,
      occupancy: occupancy,
      plate: plate.trim().toUpperCase(),
      reportedAt: _clock(),
    );
    await store.enqueue(pending);
    queue = store.queue;
    notice = null;
    notifyListeners();
    await flushQueue();
    if (!queue.contains(pending) &&
        !queue.any((q) =>
            q.reportedAt == pending.reportedAt && q.bay == pending.bay)) {
      notice =
          'Saved: bay $bay to ${destination.name}, ${occupancyLabels[occupancy].toLowerCase()}.';
    } else {
      notice =
          'No connection: bay $bay to ${destination.name} is queued and will be sent automatically.';
    }
    notifyListeners();
  }

  /// Sends queued reports oldest first. Stops at the first network failure; drops reports the
  /// server rejects outright (they would never succeed) and records the reason.
  Future<void> flushQueue() async {
    var pending = List<PendingReport>.from(store.queue);
    if (pending.isEmpty) {
      queue = pending;
      return;
    }
    busy = true;
    notifyListeners();
    while (pending.isNotEmpty) {
      final next = pending.first;
      try {
        await api.submitReport(next);
        pending.removeAt(0);
        offline = false;
      } on NetworkException {
        offline = true;
        break;
      } on ApiException catch (e) {
        pending.removeAt(0);
        error = 'Report for bay ${next.bay} rejected: ${e.message}';
      }
      await store.saveQueue(pending);
    }
    await store.saveQueue(pending);
    queue = pending;
    busy = false;
    notifyListeners();
    if (!offline) await refreshBoard();
  }

  // --- board ---------------------------------------------------------------------------------
  Future<void> refreshBoard() async {
    final m = master;
    if (m == null) return;
    try {
      board = await api.board(m.terminalId);
      offline = false;
    } on NetworkException {
      offline = true;
    } on ApiException catch (e) {
      error = e.message;
    }
    notifyListeners();
  }

  Future<void> update(LoadingEntry entry,
      {int? occupancy, bool departed = false}) async {
    final m = master;
    if (m == null) return;
    try {
      await api.updateReport(entry.reportId, m.msisdn,
          occupancy: occupancy, departed: departed);
      notice = departed
          ? 'Bay ${entry.bay} to ${entry.destination} marked departed.'
          : 'Bay ${entry.bay}: ${occupancyLabels[occupancy!].toLowerCase()}.';
      offline = false;
    } on NetworkException {
      offline = true;
      error =
          'No connection: updates need a live connection. Use USSD if it persists.';
    } on ApiException catch (e) {
      error = e.message;
    }
    notifyListeners();
    await refreshBoard();
  }

  void clearMessages() {
    error = null;
    notice = null;
    notifyListeners();
  }

  Future<void> _refreshTerminals() async {
    try {
      final terminals = await api.fetchTerminals();
      await store.saveTerminals(terminals);
    } on Exception {
      // fall back to whatever is cached
    }
    _loadTerminalFromCache();
  }

  void _loadTerminalFromCache() {
    final m = master;
    if (m == null) return;
    terminal = store.terminals
        ?.where((t) => t.id == m.terminalId)
        .cast<Terminal?>()
        .firstOrNull;
  }
}
