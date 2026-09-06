import 'package:flutter_test/flutter_test.dart';
import 'package:kumasi_transit_app/src/models.dart';
import 'package:kumasi_transit_app/src/storage/local_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('pending report round-trips through JSON and keeps UTC time', () {
    final r = PendingReport(
      msisdn: '233240000001',
      terminalId: 'KEJETIA',
      destinationId: 'TECHJCN',
      destinationName: 'Tech Junction',
      bay: 7,
      occupancy: 2,
      plate: 'GR 1',
      reportedAt: DateTime.utc(2026, 9, 6, 8, 0, 5),
    );
    final again = PendingReport.fromJson(r.toJson());
    expect(again.reportedAt, r.reportedAt);
    expect(again.toRequestBody()['reported_at'], '2026-09-06T08:00:05.000Z');
    expect(again.toRequestBody().containsKey('terminal_id'), isFalse);
  });

  test('loading entry labels', () {
    const e = LoadingEntry(
        reportId: 1,
        destinationId: 'X',
        destination: 'X',
        bay: 1,
        plate: '',
        occupancy: 4,
        status: 'full',
        ageSeconds: 30);
    expect(e.occupancyText, 'Full - leaving');
    expect(e.ageText, 'just now');
    const f = LoadingEntry(
        reportId: 1,
        destinationId: 'X',
        destination: 'X',
        bay: 1,
        plate: '',
        occupancy: 1,
        status: 'loading',
        ageSeconds: 200);
    expect(f.occupancyText, '1/4 full');
    expect(f.ageText, '3 min ago');
  });

  test('local store queue and caches persist', () async {
    SharedPreferences.setMockInitialValues({});
    final store = await LocalStore.open();
    expect(store.queue, isEmpty);
    expect(store.terminals, isNull);
    await store.enqueue(PendingReport(
        msisdn: 'a',
        terminalId: 'T',
        destinationId: 'D',
        destinationName: 'D',
        bay: 1,
        occupancy: 0,
        plate: '',
        reportedAt: DateTime.utc(2026)));
    await store.enqueue(PendingReport(
        msisdn: 'a',
        terminalId: 'T',
        destinationId: 'D',
        destinationName: 'D',
        bay: 2,
        occupancy: 0,
        plate: '',
        reportedAt: DateTime.utc(2026)));
    expect(store.queue.map((q) => q.bay), [1, 2]);
    await store.saveQueue(store.queue.sublist(1));
    expect(store.queue.single.bay, 2);
    await store.saveTerminals(const [
      Terminal(
          id: 'T',
          name: 'T',
          bays: 3,
          destinations: [Destination(id: 'D', name: 'D')])
    ]);
    expect(store.terminals!.single.destinations.single.name, 'D');
    expect(store.terminalsCachedAt, isNotNull);
  });
}
