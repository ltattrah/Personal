import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kumasi_transit_app/src/passenger/passenger_app.dart';
import 'package:kumasi_transit_app/src/storage/local_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';

Future<LocalStore> freshStore([Map<String, Object> initial = const {}]) async {
  SharedPreferences.setMockInitialValues(initial);
  return LocalStore.open();
}

void main() {
  testWidgets('passenger finds cars and sees the fare', (tester) async {
    final api = FakeTransitApi();
    final store = await freshStore();
    await tester.pumpWidget(PassengerApp(api: api, store: store));
    await tester.pumpAndSettle();

    expect(find.text('Kejetia'), findsOneWidget);
    expect(find.text('Tech Junction (KNUST)'), findsOneWidget);
    await tester.tap(find.byKey(const Key('find')));
    await tester.pumpAndSettle();

    expect(find.textContaining('Bay 7 · GR 1234-20'), findsOneWidget);
    expect(find.textContaining('1/2 full · 3 min ago'), findsOneWidget);
    expect(find.textContaining('Full - leaving'), findsOneWidget);
    expect(find.textContaining('Fare GHS 4.80'), findsOneWidget);
    expect(store.lastTerminal, 'KEJETIA');
    expect(store.terminals, isNotNull);
  });

  testWidgets(
      'changing terminal resets destination and empty answer is explained',
      (tester) async {
    final api = FakeTransitApi();
    await tester.pumpWidget(PassengerApp(api: api, store: await freshStore()));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('terminal')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Asafo').last);
    await tester.pumpAndSettle();
    expect(find.text('Santasi Roundabout'), findsOneWidget);
    await tester.tap(find.byKey(const Key('find')));
    await tester.pumpAndSettle();
    expect(find.textContaining('No car reported loading'), findsOneWidget);
  });

  testWidgets('offline start uses cached terminals and shows the USSD fallback',
      (tester) async {
    final online = FakeTransitApi();
    final store = await freshStore();
    await store.saveTerminals(online.terminals);
    await store.saveFares(await online.fetchFares());
    final api = FakeTransitApi()..online = false;
    await tester.pumpWidget(PassengerApp(api: api, store: store));
    await tester.pumpAndSettle();

    expect(find.textContaining('Offline. Showing saved terminals'),
        findsOneWidget);
    expect(find.text('Kejetia'), findsOneWidget);
    await tester.tap(find.byKey(const Key('find')));
    await tester.pumpAndSettle();
    expect(find.textContaining('dial the USSD code'), findsOneWidget);

    await tester.tap(find.text('Fares'));
    await tester.pumpAndSettle();
    expect(find.text('GHS 4.80'), findsOneWidget);
    expect(find.text('GHS 132.00'), findsOneWidget);
  });

  testWidgets('offline with nothing cached explains what to do',
      (tester) async {
    final api = FakeTransitApi()..online = false;
    await tester.pumpWidget(PassengerApp(api: api, store: await freshStore()));
    await tester.pumpAndSettle();
    expect(find.textContaining('nothing cached yet'), findsOneWidget);
  });
}
