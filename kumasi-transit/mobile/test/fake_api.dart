import 'package:kumasi_transit_app/src/api/client.dart';
import 'package:kumasi_transit_app/src/models.dart';

/// In-memory stand-in for the Kumasi Transit API. Flip [online] to simulate losing signal.
class FakeTransitApi implements TransitApi {
  bool online = true;
  final List<PendingReport> submitted = [];
  final List<Map<String, dynamic>> updates = [];
  List<LoadingEntry> boardEntries = [];
  int nextId = 100;

  final terminals = [
    const Terminal(id: 'KEJETIA', name: 'Kejetia', bays: 60, destinations: [
      Destination(id: 'TECHJCN', name: 'Tech Junction (KNUST)'),
      Destination(id: 'SUAME', name: 'Suame Magazine Terminal'),
    ]),
    const Terminal(id: 'ASAFO', name: 'Asafo', bays: 24, destinations: [
      Destination(id: 'SANTASI', name: 'Santasi Roundabout'),
    ]),
  ];

  void _check() {
    if (!online) throw NetworkException('offline');
  }

  @override
  Future<List<Terminal>> fetchTerminals() async {
    _check();
    return terminals;
  }

  @override
  Future<FindResult> find(String terminalId, String destinationId) async {
    _check();
    return FindResult(
      terminalId: terminalId,
      destination: 'Tech Junction (KNUST)',
      loading: destinationId == 'TECHJCN'
          ? const [
              LoadingEntry(
                  reportId: 1,
                  destinationId: 'TECHJCN',
                  destination: 'Tech Junction (KNUST)',
                  bay: 7,
                  plate: 'GR 1234-20',
                  occupancy: 2,
                  status: 'loading',
                  ageSeconds: 180),
              LoadingEntry(
                  reportId: 2,
                  destinationId: 'TECHJCN',
                  destination: 'Tech Junction (KNUST)',
                  bay: 9,
                  plate: '',
                  occupancy: 4,
                  status: 'full - leaving',
                  ageSeconds: 20),
            ]
          : const [],
      fare: const FareInfo(
          routeId: 'C1-KJT-TECH',
          price: 4.8,
          currency: 'GHS',
          version: '2026-06-02'),
    );
  }

  @override
  Future<FareTable> fetchFares() async {
    _check();
    return const FareTable(
      version: '2026-06-02',
      effectiveFrom: '2026-06-02',
      source: 'GPRTU 20% increase',
      fares: {'C1-KJT-TECH': 4.8, 'IC-STC-ACC': 132.0},
      routes: [
        RouteInfo(
            id: 'C1-KJT-TECH',
            shortName: 'Kejetia-Tech',
            longName: 'Kejetia - Tech Junction',
            mode: 'trotro'),
        RouteInfo(
            id: 'IC-STC-ACC',
            shortName: 'STC Accra',
            longName: 'Kumasi - Accra',
            mode: 'coach'),
      ],
    );
  }

  @override
  Future<StationMaster> lookupStationMaster(String msisdn) async {
    _check();
    final digits = msisdn.replaceAll(RegExp(r'\D'), '');
    if (digits.endsWith('240000001')) {
      return const StationMaster(
          msisdn: '233240000001',
          name: 'Kejetia demo',
          terminalId: 'KEJETIA',
          terminalName: 'Kejetia',
          bays: 60);
    }
    throw ApiException(404, 'phone number is not a registered station master');
  }

  @override
  Future<List<LoadingEntry>> board(String terminalId) async {
    _check();
    return boardEntries;
  }

  @override
  Future<int> submitReport(PendingReport report) async {
    _check();
    submitted.add(report);
    final id = nextId++;
    boardEntries = [
      ...boardEntries.where((e) => e.bay != report.bay),
      LoadingEntry(
          reportId: id,
          destinationId: report.destinationId,
          destination: report.destinationName,
          bay: report.bay,
          plate: report.plate,
          occupancy: report.occupancy,
          status: 'loading',
          ageSeconds: 0),
    ];
    return id;
  }

  @override
  Future<void> updateReport(int reportId, String msisdn,
      {int? occupancy, bool departed = false}) async {
    _check();
    updates.add({'id': reportId, 'occupancy': occupancy, 'departed': departed});
    if (departed) {
      boardEntries = boardEntries.where((e) => e.reportId != reportId).toList();
    }
  }
}
