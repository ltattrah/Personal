import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kumasi_transit_app/src/storage/local_store.dart';
import 'package:kumasi_transit_app/src/terminal/terminal_app.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';

Future<LocalStore> freshStore() async {
  SharedPreferences.setMockInitialValues({});
  return LocalStore.open();
}

Future<void> login(WidgetTester tester, String phone) async {
  await tester.enterText(find.byKey(const Key('phone')), phone);
  await tester.tap(find.byKey(const Key('login')));
  await tester.pumpAndSettle();
}

Future<void> fillReport(WidgetTester tester,
    {required String bay, required String occupancy}) async {
  await tester.tap(find.byKey(const Key('dest-TECHJCN')));
  await tester.pump();
  await tester.enterText(find.byKey(const Key('bay')), bay);
  await tester.pump();
  await tester.tap(find.text(occupancy));
  await tester.pump();
  await tester.ensureVisible(find.byKey(const Key('send')));
  await tester.tap(find.byKey(const Key('send')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('unregistered number is refused, registered number signs in',
      (tester) async {
    final api = FakeTransitApi();
    await tester.pumpWidget(TerminalApp(api: api, store: await freshStore()));
    await tester.pumpAndSettle();
    await login(tester, '0200000000');
    expect(find.textContaining('not registered'), findsOneWidget);
    await login(tester, '024 000 0001');
    expect(find.text('Kejetia station'), findsOneWidget);
    expect(find.text('Tech Junction (KNUST)'), findsOneWidget);
  });

  testWidgets('report is sent immediately when online', (tester) async {
    final api = FakeTransitApi();
    final store = await freshStore();
    final fixed = DateTime.utc(2026, 9, 6, 8, 0);
    await tester
        .pumpWidget(TerminalApp(api: api, store: store, clock: () => fixed));
    await tester.pumpAndSettle();
    await login(tester, '0240000001');
    await fillReport(tester, bay: '7', occupancy: '1/2 full');

    expect(api.submitted, hasLength(1));
    expect(api.submitted.single.bay, 7);
    expect(api.submitted.single.occupancy, 2);
    expect(api.submitted.single.reportedAt, fixed);
    expect(store.queue, isEmpty);
    expect(
        find.textContaining('Saved: bay 7 to Tech Junction'), findsOneWidget);
    // board tab shows it with the update menu
    await tester.tap(find.text('Board'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Bay 7'), findsOneWidget);
    await tester.tap(find.byKey(const Key('menu-100')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Departed'));
    await tester.pumpAndSettle();
    expect(api.updates.single['departed'], isTrue);
    expect(find.textContaining('marked departed'), findsOneWidget);
  });

  testWidgets(
      'report is queued offline, survives restart, and is sent on retry',
      (tester) async {
    final api = FakeTransitApi();
    final store = await freshStore();
    await tester.pumpWidget(TerminalApp(api: api, store: store));
    await tester.pumpAndSettle();
    await login(tester, '0240000001');

    api.online = false;
    await fillReport(tester, bay: '12', occupancy: 'Full');
    expect(api.submitted, isEmpty);
    expect(store.queue, hasLength(1));
    expect(find.byKey(const Key('queue-banner')), findsOneWidget);
    expect(find.textContaining('1 report waiting to send'), findsOneWidget);

    // "Restart" the app with the same store: still signed in, queue still there.
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(TerminalApp(api: api, store: store));
    await tester.pumpAndSettle();
    expect(find.text('Kejetia station'), findsOneWidget);
    expect(find.textContaining('1 report waiting to send'), findsOneWidget);

    api.online = true;
    await tester.tap(find.text('Send now'));
    await tester.pumpAndSettle();
    expect(api.submitted.single.bay, 12);
    expect(api.submitted.single.occupancy, 4);
    expect(store.queue, isEmpty);
    expect(find.byKey(const Key('queue-banner')), findsNothing);
  });

  testWidgets('send button stays disabled until the form is valid',
      (tester) async {
    final api = FakeTransitApi();
    await tester.pumpWidget(TerminalApp(api: api, store: await freshStore()));
    await tester.pumpAndSettle();
    await login(tester, '0240000001');
    FilledButton send() =>
        tester.widget<FilledButton>(find.byKey(const Key('send')));
    expect(send().onPressed, isNull);
    await tester.tap(find.byKey(const Key('dest-SUAME')));
    await tester.enterText(find.byKey(const Key('bay')), '99'); // > 60 bays
    await tester.tap(find.text('Empty'));
    await tester.pump();
    expect(send().onPressed, isNull);
    await tester.enterText(find.byKey(const Key('bay')), '3');
    await tester.pump();
    expect(send().onPressed, isNotNull);
  });
}
