import 'package:flutter/material.dart';

import 'src/api/client.dart';
import 'src/storage/local_store.dart';
import 'src/terminal/terminal_app.dart';

/// Station-master terminal app entry point:  flutter run --flavor terminal -t lib/main_terminal.dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = await LocalStore.open();
  runApp(TerminalApp(api: HttpTransitApi(), store: store));
}
