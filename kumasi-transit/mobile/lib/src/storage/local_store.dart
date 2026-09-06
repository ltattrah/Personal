import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models.dart';

/// Offline-first persistence: reference data caches, the station master's login and the queue of
/// reports waiting for connectivity. Everything is small JSON in SharedPreferences, which survives
/// app restarts and needs no native database.
class LocalStore {
  LocalStore(this._prefs);

  static Future<LocalStore> open() async =>
      LocalStore(await SharedPreferences.getInstance());

  final SharedPreferences _prefs;

  static const _kTerminals = 'terminals';
  static const _kTerminalsAt = 'terminals_at';
  static const _kFares = 'fares';
  static const _kFaresAt = 'fares_at';
  static const _kQueue = 'pending_reports';
  static const _kMaster = 'station_master';
  static const _kLastTerminal = 'last_terminal';
  static const _kLastDestination = 'last_destination';

  // --- terminals ------------------------------------------------------------------------
  List<Terminal>? get terminals {
    final raw = _prefs.getString(_kTerminals);
    if (raw == null) return null;
    return (jsonDecode(raw) as List<dynamic>)
        .map((t) => Terminal.fromJson(t as Map<String, dynamic>))
        .toList();
  }

  DateTime? get terminalsCachedAt => _at(_kTerminalsAt);

  Future<void> saveTerminals(List<Terminal> terminals) async {
    await _prefs.setString(
        _kTerminals, jsonEncode(terminals.map((t) => t.toJson()).toList()));
    await _prefs.setString(
        _kTerminalsAt, DateTime.now().toUtc().toIso8601String());
  }

  // --- fares ----------------------------------------------------------------------------
  FareTable? get fares {
    final raw = _prefs.getString(_kFares);
    return raw == null
        ? null
        : FareTable.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  DateTime? get faresCachedAt => _at(_kFaresAt);

  Future<void> saveFares(FareTable table) async {
    await _prefs.setString(_kFares, jsonEncode(table.toJson()));
    await _prefs.setString(_kFaresAt, DateTime.now().toUtc().toIso8601String());
  }

  // --- station master -------------------------------------------------------------------
  StationMaster? get stationMaster {
    final raw = _prefs.getString(_kMaster);
    return raw == null
        ? null
        : StationMaster.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  Future<void> saveStationMaster(StationMaster? master) async {
    if (master == null) {
      await _prefs.remove(_kMaster);
    } else {
      await _prefs.setString(_kMaster, jsonEncode(master.toJson()));
    }
  }

  // --- pending queue --------------------------------------------------------------------
  List<PendingReport> get queue {
    final raw = _prefs.getString(_kQueue);
    if (raw == null) return const [];
    return (jsonDecode(raw) as List<dynamic>)
        .map((r) => PendingReport.fromJson(r as Map<String, dynamic>))
        .toList();
  }

  Future<void> saveQueue(List<PendingReport> reports) => _prefs.setString(
      _kQueue, jsonEncode(reports.map((r) => r.toJson()).toList()));

  Future<void> enqueue(PendingReport report) async {
    final q = List<PendingReport>.from(queue)..add(report);
    await saveQueue(q);
  }

  // --- passenger preferences ------------------------------------------------------------
  String? get lastTerminal => _prefs.getString(_kLastTerminal);
  String? get lastDestination => _prefs.getString(_kLastDestination);

  Future<void> saveLastChoice(String terminalId, String destinationId) async {
    await _prefs.setString(_kLastTerminal, terminalId);
    await _prefs.setString(_kLastDestination, destinationId);
  }

  DateTime? _at(String key) {
    final raw = _prefs.getString(key);
    return raw == null ? null : DateTime.tryParse(raw);
  }
}
