import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config.dart';
import '../models.dart';

/// The server answered with an error status.
class ApiException implements Exception {
  ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => 'ApiException($statusCode): $message';
}

/// No connectivity, DNS failure or timeout: the caller should fall back to cache or queue.
class NetworkException implements Exception {
  NetworkException(this.message);

  final String message;

  @override
  String toString() => 'NetworkException: $message';
}

abstract class TransitApi {
  Future<List<Terminal>> fetchTerminals();
  Future<FindResult> find(String terminalId, String destinationId);
  Future<FareTable> fetchFares();
  Future<StationMaster> lookupStationMaster(String msisdn);
  Future<List<LoadingEntry>> board(String terminalId);
  Future<int> submitReport(PendingReport report);
  Future<void> updateReport(int reportId, String msisdn,
      {int? occupancy, bool departed = false});
}

class HttpTransitApi implements TransitApi {
  HttpTransitApi({http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        baseUrl =
            (baseUrl ?? AppConfig.apiBaseUrl).replaceAll(RegExp(r'/+$'), '');

  final http.Client _client;
  final String baseUrl;

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$baseUrl$path').replace(queryParameters: query);

  Future<dynamic> _send(Future<http.Response> Function() call) async {
    http.Response response;
    try {
      response = await call().timeout(AppConfig.requestTimeout);
    } on SocketException catch (e) {
      throw NetworkException(e.message);
    } on TimeoutException {
      throw NetworkException('timed out');
    } on http.ClientException catch (e) {
      throw NetworkException(e.message);
    }
    if (response.statusCode >= 400) {
      String message = response.reasonPhrase ?? 'error ${response.statusCode}';
      try {
        final body = jsonDecode(response.body);
        if (body is Map && body['detail'] != null) {
          message = body['detail'].toString();
        }
      } catch (_) {}
      throw ApiException(response.statusCode, message);
    }
    if (response.body.isEmpty) return null;
    return jsonDecode(response.body);
  }

  Future<dynamic> _get(String path, [Map<String, String>? query]) => _send(() =>
      _client.get(_uri(path, query), headers: {'Accept': 'application/json'}));

  Future<dynamic> _json(
          String method, String path, Map<String, dynamic> body) =>
      _send(() {
        final headers = {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        };
        final encoded = jsonEncode(body);
        return method == 'PATCH'
            ? _client.patch(_uri(path), headers: headers, body: encoded)
            : _client.post(_uri(path), headers: headers, body: encoded);
      });

  @override
  Future<List<Terminal>> fetchTerminals() async {
    final data = await _get('/api/terminals') as List<dynamic>;
    return data
        .map((t) => Terminal.fromJson(t as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<FindResult> find(String terminalId, String destinationId) async {
    final data = await _get(
        '/api/terminals/$terminalId/find', {'destination': destinationId});
    return FindResult.fromJson(data as Map<String, dynamic>);
  }

  @override
  Future<FareTable> fetchFares() async {
    final fares = await _get('/api/fares') as Map<String, dynamic>;
    final routes = await _get('/api/routes') as List<dynamic>;
    final current = fares['current'] as Map<String, dynamic>;
    return FareTable.fromJson({
      'version': current['version'],
      'effective_from': current['effective_from'],
      'source': current['source'],
      'fares': current['fares'],
      'routes': routes,
    });
  }

  @override
  Future<StationMaster> lookupStationMaster(String msisdn) async {
    final data =
        await _get('/api/station-masters/${Uri.encodeComponent(msisdn)}');
    return StationMaster.fromJson(data as Map<String, dynamic>);
  }

  @override
  Future<List<LoadingEntry>> board(String terminalId) async {
    final data =
        await _get('/api/terminals/$terminalId/board') as Map<String, dynamic>;
    return (data['loading'] as List<dynamic>)
        .map((e) => LoadingEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<int> submitReport(PendingReport report) async {
    final data = await _json('POST',
        '/api/terminals/${report.terminalId}/reports', report.toRequestBody());
    return ((data as Map<String, dynamic>)['report_id'] as num).toInt();
  }

  @override
  Future<void> updateReport(int reportId, String msisdn,
      {int? occupancy, bool departed = false}) async {
    await _json('PATCH', '/api/reports/$reportId', {
      'msisdn': msisdn,
      if (occupancy != null) 'occupancy': occupancy,
      'departed': departed,
    });
  }
}
