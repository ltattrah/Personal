import 'package:flutter/material.dart';

import 'src/api/client.dart';
import 'src/passenger/passenger_app.dart';
import 'src/storage/local_store.dart';

/// Passenger app entry point:  flutter run --flavor passenger -t lib/main_passenger.dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = await LocalStore.open();
  runApp(PassengerApp(api: HttpTransitApi(), store: store));
}
