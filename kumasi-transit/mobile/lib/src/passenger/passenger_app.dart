import 'package:flutter/material.dart';

import '../api/client.dart';
import '../config.dart';
import '../storage/local_store.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'passenger_controller.dart';

class PassengerApp extends StatefulWidget {
  const PassengerApp({super.key, required this.api, required this.store});

  final TransitApi api;
  final LocalStore store;

  @override
  State<PassengerApp> createState() => _PassengerAppState();
}

class _PassengerAppState extends State<PassengerApp> {
  late final PassengerController controller;

  @override
  void initState() {
    super.initState();
    controller = PassengerController(api: widget.api, store: widget.store);
    controller.init();
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Kumasi Transit',
      theme: buildTheme(),
      home: PassengerHome(controller: controller),
    );
  }
}

class PassengerHome extends StatefulWidget {
  const PassengerHome({super.key, required this.controller});

  final PassengerController controller;

  @override
  State<PassengerHome> createState() => _PassengerHomeState();
}

class _PassengerHomeState extends State<PassengerHome> {
  int tab = 0;

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    return ListenableBuilder(
      listenable: c,
      builder: (context, _) {
        return Scaffold(
          appBar: AppBar(
            title: Text(tab == 0 ? 'Find a car' : 'Fares'),
            actions: [
              IconButton(
                tooltip: 'Refresh',
                onPressed: c.loading ? null : c.refresh,
                icon: c.loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.refresh),
              ),
            ],
          ),
          body: Column(
            children: [
              if (c.offline)
                StatusBanner(
                  text:
                      'Offline. Showing saved terminals (updated ${formatCachedAt(c.store.terminalsCachedAt)}). Dial ${AppConfig.ussdCode} for live loading status on any phone.',
                  action: c.refresh,
                ),
              Expanded(
                  child: tab == 0
                      ? FindScreen(controller: c)
                      : FaresScreen(controller: c)),
            ],
          ),
          bottomNavigationBar: NavigationBar(
            selectedIndex: tab,
            onDestinationSelected: (i) => setState(() => tab = i),
            destinations: const [
              NavigationDestination(
                  icon: Icon(Icons.directions_bus), label: 'Find a car'),
              NavigationDestination(
                  icon: Icon(Icons.payments_outlined), label: 'Fares'),
            ],
          ),
        );
      },
    );
  }
}

class FindScreen extends StatelessWidget {
  const FindScreen({super.key, required this.controller});

  final PassengerController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    if (c.terminals.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
              c.error ??
                  (c.loading
                      ? 'Loading terminals…'
                      : 'No terminals available.'),
              textAlign: TextAlign.center),
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('I am at', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 6),
        _dropdown<String>(
          key: const Key('terminal'),
          value: c.terminalId,
          items: [
            for (final t in c.terminals)
              DropdownMenuItem(value: t.id, child: Text(t.name))
          ],
          onChanged: (v) => v == null ? null : c.selectTerminal(v),
        ),
        const SizedBox(height: 16),
        Text('Going to', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 6),
        _dropdown<String>(
          key: const Key('destination'),
          value: c.destinationId,
          items: [
            for (final d in c.destinations)
              DropdownMenuItem(value: d.id, child: Text(d.name))
          ],
          onChanged: (v) => v == null ? null : c.selectDestination(v),
        ),
        const SizedBox(height: 20),
        FilledButton.icon(
          key: const Key('find'),
          onPressed: c.searching || c.destinationId == null ? null : c.find,
          icon: const Icon(Icons.search),
          label: Text(c.searching ? 'Searching…' : 'Find a car'),
        ),
        const SizedBox(height: 20),
        if (c.error != null && c.terminals.isNotEmpty)
          Card(
            color: const Color(0xFFFFF4D6),
            child: Padding(
                padding: const EdgeInsets.all(12), child: Text(c.error!)),
          ),
        if (c.result != null)
          _ResultView(result: c.result!, terminalName: c.terminal?.name ?? ''),
        const SizedBox(height: 24),
        Text(
          'No data? Dial ${AppConfig.ussdCode} on any phone for the same information.',
          style: Theme.of(context).textTheme.bodySmall,
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _dropdown<T>(
      {required Key key,
      required T? value,
      required List<DropdownMenuItem<T>> items,
      required ValueChanged<T?> onChanged}) {
    return InputDecorator(
      decoration: const InputDecoration(
          contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 4)),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
            key: key,
            value: value,
            isExpanded: true,
            items: items,
            onChanged: onChanged),
      ),
    );
  }
}

class _ResultView extends StatelessWidget {
  const _ResultView({required this.result, required this.terminalName});

  final dynamic result;
  final String terminalName;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('$terminalName → ${result.destination}',
            style: textTheme.titleLarge),
        const SizedBox(height: 8),
        if (result.loading.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(12),
              child: Text(
                  'No car reported loading in the last 20 minutes. Check with the station master.'),
            ),
          )
        else
          for (final e in result.loading) LoadingEntryTile(entry: e),
        if (result.fare != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Fare ${result.fare.currency} ${result.fare.price.toStringAsFixed(2)} per person (GPRTU list ${result.fare.version})',
              style: textTheme.titleMedium,
            ),
          ),
      ],
    );
  }
}

class FaresScreen extends StatelessWidget {
  const FaresScreen({super.key, required this.controller});

  final PassengerController controller;

  @override
  Widget build(BuildContext context) {
    final table = controller.fares;
    if (table == null) {
      return const Center(
          child: Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                  'Fares not downloaded yet. Connect once to save them on this phone.')));
    }
    final urban = table.routes
        .where((r) => r.mode == 'trotro' || r.mode == 'shared_taxi')
        .toList();
    final intercity = table.routes
        .where((r) => r.mode != 'trotro' && r.mode != 'shared_taxi')
        .toList();
    Widget tile(dynamic r) {
      final price = table.fares[r.id];
      return ListTile(
        title: Text(r.shortName),
        subtitle: Text(r.longName),
        trailing: Text(price == null ? '—' : 'GHS ${price.toStringAsFixed(2)}',
            style: Theme.of(context).textTheme.titleMedium),
      );
    }

    return ListView(
      children: [
        ListTile(
          leading: const Icon(Icons.verified_outlined),
          title: Text('GPRTU fare list of ${table.effectiveFrom}'),
          subtitle: Text(
              'Saved on this phone ${formatCachedAt(controller.store.faresCachedAt)}. ${table.source}'),
        ),
        const Divider(),
        Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Text('Trotro and shared taxi',
                style: Theme.of(context).textTheme.titleMedium)),
        ...urban.map(tile),
        Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Text('Intercity and Metro Mass',
                style: Theme.of(context).textTheme.titleMedium)),
        ...intercity.map(tile),
      ],
    );
  }
}
