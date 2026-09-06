import 'package:flutter/foundation.dart';

import '../api/client.dart';
import '../models.dart';
import '../storage/local_store.dart';

/// State for the passenger app: terminals and fares (cache-first, refreshed online) and the
/// current "find a car" answer (always live; nothing older than 20 minutes is worth showing).
class PassengerController extends ChangeNotifier {
  PassengerController({required this.api, required this.store});

  final TransitApi api;
  final LocalStore store;

  List<Terminal> terminals = const [];
  FareTable? fares;
  bool offline = false;
  bool loading = false;
  String? error;
  String? terminalId;
  String? destinationId;
  FindResult? result;
  bool searching = false;

  Terminal? get terminal =>
      terminals.where((t) => t.id == terminalId).cast<Terminal?>().firstOrNull;

  List<Destination> get destinations => terminal?.destinations ?? const [];

  Future<void> init() async {
    terminals = store.terminals ?? const [];
    fares = store.fares;
    terminalId = store.lastTerminal ?? terminals.firstOrNull?.id;
    destinationId = store.lastDestination;
    _ensureDestination();
    notifyListeners();
    await refresh();
  }

  Future<void> refresh() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      terminals = await api.fetchTerminals();
      await store.saveTerminals(terminals);
      offline = false;
      try {
        fares = await api.fetchFares();
        await store.saveFares(fares!);
      } on Exception {
        // fares are secondary; keep the cached table
      }
    } on NetworkException {
      offline = true;
      if (terminals.isEmpty) {
        error =
            'No connection and nothing cached yet. Dial the USSD code instead.';
      }
    } on ApiException catch (e) {
      error = e.message;
    }
    terminalId ??= terminals.firstOrNull?.id;
    _ensureDestination();
    loading = false;
    notifyListeners();
  }

  void selectTerminal(String id) {
    terminalId = id;
    destinationId = null;
    result = null;
    _ensureDestination();
    notifyListeners();
  }

  void selectDestination(String id) {
    destinationId = id;
    result = null;
    notifyListeners();
  }

  Future<void> find() async {
    final t = terminalId, d = destinationId;
    if (t == null || d == null) return;
    searching = true;
    error = null;
    notifyListeners();
    try {
      result = await api.find(t, d);
      offline = false;
      await store.saveLastChoice(t, d);
    } on NetworkException {
      offline = true;
      result = null;
      error =
          'No connection. Loading status needs a live connection; dial the USSD code instead.';
    } on ApiException catch (e) {
      error = e.message;
    }
    searching = false;
    notifyListeners();
  }

  void _ensureDestination() {
    final ids = destinations.map((d) => d.id).toSet();
    if (destinationId == null || !ids.contains(destinationId)) {
      destinationId = destinations.firstOrNull?.id;
    }
  }
}
