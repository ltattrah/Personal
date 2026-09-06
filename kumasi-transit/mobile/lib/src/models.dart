/// Plain data classes mirroring the JSON served by the Kumasi Transit API.
library;

const List<String> occupancyLabels = [
  'Empty',
  '1/4 full',
  '1/2 full',
  '3/4 full',
  'Full',
];

class Destination {
  const Destination({required this.id, required this.name});

  final String id;
  final String name;

  factory Destination.fromJson(Map<String, dynamic> j) =>
      Destination(id: j['stop_id'] as String, name: j['name'] as String);

  Map<String, dynamic> toJson() => {'stop_id': id, 'name': name};
}

class Terminal {
  const Terminal({
    required this.id,
    required this.name,
    required this.bays,
    required this.destinations,
  });

  final String id;
  final String name;
  final int bays;
  final List<Destination> destinations;

  factory Terminal.fromJson(Map<String, dynamic> j) => Terminal(
        id: j['terminal_id'] as String,
        name: j['name'] as String,
        bays: (j['bays'] as num?)?.toInt() ?? 10,
        destinations: (j['destinations'] as List<dynamic>)
            .map((d) => Destination.fromJson(d as Map<String, dynamic>))
            .toList(),
      );

  Map<String, dynamic> toJson() => {
        'terminal_id': id,
        'name': name,
        'bays': bays,
        'destinations': destinations.map((d) => d.toJson()).toList(),
      };
}

class LoadingEntry {
  const LoadingEntry({
    required this.reportId,
    required this.destinationId,
    required this.destination,
    required this.bay,
    required this.plate,
    required this.occupancy,
    required this.status,
    required this.ageSeconds,
  });

  final int reportId;
  final String destinationId;
  final String destination;
  final int bay;
  final String plate;
  final int occupancy;
  final String status;
  final int ageSeconds;

  bool get isFull => occupancy >= 4;

  String get occupancyText =>
      isFull ? 'Full - leaving' : occupancyLabels[occupancy];

  String get ageText {
    if (ageSeconds < 60) return 'just now';
    final m = ageSeconds ~/ 60;
    return '$m min ago';
  }

  factory LoadingEntry.fromJson(Map<String, dynamic> j) => LoadingEntry(
        reportId: (j['report_id'] as num).toInt(),
        destinationId: j['destination_id'] as String,
        destination: j['destination'] as String,
        bay: (j['bay'] as num).toInt(),
        plate: (j['plate'] as String?) ?? '',
        occupancy: (j['occupancy'] as num).toInt(),
        status: j['status'] as String,
        ageSeconds: (j['age_seconds'] as num).toInt(),
      );
}

class FareInfo {
  const FareInfo({
    required this.routeId,
    required this.price,
    required this.currency,
    required this.version,
  });

  final String routeId;
  final double price;
  final String currency;
  final String version;

  factory FareInfo.fromJson(Map<String, dynamic> j) => FareInfo(
        routeId: j['route_id'] as String,
        price: (j['price'] as num).toDouble(),
        currency: (j['currency'] as String?) ?? 'GHS',
        version: j['version'] as String,
      );
}

class FindResult {
  const FindResult({
    required this.terminalId,
    required this.destination,
    required this.loading,
    this.fare,
  });

  final String terminalId;
  final String destination;
  final List<LoadingEntry> loading;
  final FareInfo? fare;

  factory FindResult.fromJson(Map<String, dynamic> j) => FindResult(
        terminalId: j['terminal_id'] as String,
        destination: j['destination'] as String,
        loading: (j['loading'] as List<dynamic>)
            .map((e) => LoadingEntry.fromJson(e as Map<String, dynamic>))
            .toList(),
        fare: j['fare'] == null
            ? null
            : FareInfo.fromJson(j['fare'] as Map<String, dynamic>),
      );
}

class RouteInfo {
  const RouteInfo({
    required this.id,
    required this.shortName,
    required this.longName,
    required this.mode,
  });

  final String id;
  final String shortName;
  final String longName;
  final String mode;

  factory RouteInfo.fromJson(Map<String, dynamic> j) => RouteInfo(
        id: j['route_id'] as String,
        shortName: j['short_name'] as String,
        longName: j['long_name'] as String,
        mode: j['mode'] as String,
      );

  Map<String, dynamic> toJson() => {
        'route_id': id,
        'short_name': shortName,
        'long_name': longName,
        'mode': mode
      };
}

/// The fare version in force plus route names, cached together for the fares screen.
class FareTable {
  const FareTable({
    required this.version,
    required this.effectiveFrom,
    required this.source,
    required this.fares,
    required this.routes,
  });

  final String version;
  final String effectiveFrom;
  final String source;
  final Map<String, double> fares;
  final List<RouteInfo> routes;

  factory FareTable.fromJson(Map<String, dynamic> j) => FareTable(
        version: j['version'] as String,
        effectiveFrom: j['effective_from'] as String,
        source: (j['source'] as String?) ?? '',
        fares: (j['fares'] as Map<String, dynamic>)
            .map((k, v) => MapEntry(k, (v as num).toDouble())),
        routes: (j['routes'] as List<dynamic>)
            .map((r) => RouteInfo.fromJson(r as Map<String, dynamic>))
            .toList(),
      );

  Map<String, dynamic> toJson() => {
        'version': version,
        'effective_from': effectiveFrom,
        'source': source,
        'fares': fares,
        'routes': routes.map((r) => r.toJson()).toList(),
      };
}

class StationMaster {
  const StationMaster({
    required this.msisdn,
    required this.name,
    required this.terminalId,
    required this.terminalName,
    required this.bays,
  });

  final String msisdn;
  final String name;
  final String terminalId;
  final String terminalName;
  final int bays;

  factory StationMaster.fromJson(Map<String, dynamic> j) => StationMaster(
        msisdn: j['msisdn'] as String,
        name: j['name'] as String,
        terminalId: j['terminal_id'] as String,
        terminalName: j['terminal_name'] as String,
        bays: (j['bays'] as num).toInt(),
      );

  Map<String, dynamic> toJson() => {
        'msisdn': msisdn,
        'name': name,
        'terminal_id': terminalId,
        'terminal_name': terminalName,
        'bays': bays,
      };
}

/// A loading report the station master has entered; queued locally until the API accepts it.
class PendingReport {
  PendingReport({
    required this.msisdn,
    required this.terminalId,
    required this.destinationId,
    required this.destinationName,
    required this.bay,
    required this.occupancy,
    required this.plate,
    required this.reportedAt,
  });

  final String msisdn;
  final String terminalId;
  final String destinationId;
  final String destinationName;
  final int bay;
  final int occupancy;
  final String plate;
  final DateTime reportedAt; // UTC

  factory PendingReport.fromJson(Map<String, dynamic> j) => PendingReport(
        msisdn: j['msisdn'] as String,
        terminalId: j['terminal_id'] as String,
        destinationId: j['destination_id'] as String,
        destinationName:
            (j['destination_name'] as String?) ?? j['destination_id'] as String,
        bay: (j['bay'] as num).toInt(),
        occupancy: (j['occupancy'] as num).toInt(),
        plate: (j['plate'] as String?) ?? '',
        reportedAt: DateTime.parse(j['reported_at'] as String).toUtc(),
      );

  Map<String, dynamic> toJson() => {
        'msisdn': msisdn,
        'terminal_id': terminalId,
        'destination_id': destinationId,
        'destination_name': destinationName,
        'bay': bay,
        'occupancy': occupancy,
        'plate': plate,
        'reported_at': reportedAt.toUtc().toIso8601String(),
      };

  /// Body for `POST /api/terminals/{id}/reports`.
  Map<String, dynamic> toRequestBody() => {
        'msisdn': msisdn,
        'destination_id': destinationId,
        'bay': bay,
        'occupancy': occupancy,
        'plate': plate,
        'reported_at': reportedAt.toUtc().toIso8601String(),
      };
}
