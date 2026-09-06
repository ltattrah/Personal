import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/client.dart';
import '../config.dart';
import '../models.dart';
import '../storage/local_store.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'terminal_controller.dart';

class TerminalApp extends StatefulWidget {
  const TerminalApp(
      {super.key, required this.api, required this.store, this.clock});

  final TransitApi api;
  final LocalStore store;
  final DateTime Function()? clock;

  @override
  State<TerminalApp> createState() => _TerminalAppState();
}

class _TerminalAppState extends State<TerminalApp> with WidgetsBindingObserver {
  late final TerminalController controller;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    controller = TerminalController(
        api: widget.api, store: widget.store, clock: widget.clock);
    controller.init();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Coming back to the foreground is the cheapest "maybe we have signal again" signal.
    if (state == AppLifecycleState.resumed && controller.loggedIn) {
      controller.flushQueue();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Kumasi Transit Station',
      theme: buildTheme(),
      home: ListenableBuilder(
        listenable: controller,
        builder: (context, _) => controller.loggedIn
            ? TerminalHome(controller: controller)
            : LoginScreen(controller: controller),
      ),
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.controller});

  final TerminalController controller;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final phone = TextEditingController();

  @override
  void dispose() {
    phone.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    return Scaffold(
      appBar: AppBar(title: const Text('Station master sign-in')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Icon(Icons.badge_outlined, size: 64, color: kBrandGreen),
          const SizedBox(height: 16),
          const Text(
              'Enter the phone number registered with GPRTU / KMA for your station.',
              textAlign: TextAlign.center),
          const SizedBox(height: 24),
          TextField(
            key: const Key('phone'),
            controller: phone,
            keyboardType: TextInputType.phone,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]'))
            ],
            decoration: const InputDecoration(
                labelText: 'Phone number', hintText: '024 000 0001'),
            style: const TextStyle(fontSize: 20),
          ),
          const SizedBox(height: 16),
          if (c.error != null)
            Text(c.error!, style: const TextStyle(color: kFullRed)),
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('login'),
            onPressed: c.busy ? null : () => c.login(phone.text),
            child: Text(c.busy ? 'Checking…' : 'Sign in'),
          ),
          const SizedBox(height: 24),
          Text('You can also report over USSD: dial ${AppConfig.ussdCode}.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class TerminalHome extends StatefulWidget {
  const TerminalHome({super.key, required this.controller});

  final TerminalController controller;

  @override
  State<TerminalHome> createState() => _TerminalHomeState();
}

class _TerminalHomeState extends State<TerminalHome> {
  int tab = 0;

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final master = c.master!;
    return Scaffold(
      appBar: AppBar(
        title: Text('${master.terminalName} station'),
        actions: [
          IconButton(
              tooltip: 'Refresh board',
              onPressed: c.refreshBoard,
              icon: const Icon(Icons.refresh)),
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'logout') c.logout();
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                  value: 'logout', child: Text('Sign out (${master.msisdn})'))
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          if (c.queue.isNotEmpty)
            StatusBanner(
              key: const Key('queue-banner'),
              text:
                  '${c.queue.length} report${c.queue.length == 1 ? '' : 's'} waiting to send. They go out automatically when the phone has signal.',
              action: c.busy ? null : c.flushQueue,
              actionLabel: 'Send now',
            )
          else if (c.offline)
            StatusBanner(
                text: 'Offline. Reports you enter are saved on this phone.',
                action: c.flushQueue,
                actionLabel: 'Reconnect'),
          if (c.notice != null)
            MaterialBanner(
              key: const Key('notice'),
              backgroundColor: const Color(0xFFDCFCE7),
              leading: const Icon(Icons.check_circle, color: kBrandGreen),
              content: Text(c.notice!),
              actions: [
                TextButton(onPressed: c.clearMessages, child: const Text('OK'))
              ],
            ),
          if (c.error != null)
            MaterialBanner(
              backgroundColor: const Color(0xFFFEE2E2),
              leading: const Icon(Icons.error_outline, color: kFullRed),
              content: Text(c.error!),
              actions: [
                TextButton(onPressed: c.clearMessages, child: const Text('OK'))
              ],
            ),
          Expanded(
              child: tab == 0
                  ? ReportScreen(controller: c)
                  : BoardScreen(controller: c)),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (i) => setState(() => tab = i),
        destinations: [
          const NavigationDestination(
              icon: Icon(Icons.add_circle_outline), label: 'Report loading'),
          NavigationDestination(
            icon: Badge.count(
                count: c.board.length,
                isLabelVisible: c.board.isNotEmpty,
                child: const Icon(Icons.view_list)),
            label: 'Board',
          ),
        ],
      ),
    );
  }
}

class ReportScreen extends StatefulWidget {
  const ReportScreen({super.key, required this.controller});

  final TerminalController controller;

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  Destination? destination;
  int? occupancy;
  final bay = TextEditingController();
  final plate = TextEditingController();

  @override
  void dispose() {
    bay.dispose();
    plate.dispose();
    super.dispose();
  }

  List<Destination> get _destinations =>
      widget.controller.terminal?.destinations ?? const [];

  bool get _valid {
    final b = int.tryParse(bay.text);
    final max = widget.controller.master?.bays ?? 1;
    return destination != null &&
        occupancy != null &&
        b != null &&
        b >= 1 &&
        b <= max;
  }

  Future<void> _send() async {
    await widget.controller.report(
        destination: destination!,
        bay: int.parse(bay.text),
        occupancy: occupancy!,
        plate: plate.text);
    if (!mounted) return;
    setState(() {
      occupancy = null;
      bay.clear();
      plate.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final dests = _destinations;
    if (dests.isEmpty) {
      return const Center(
          child: Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                  'Destinations for this station are not downloaded yet. Connect once and refresh.')));
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Car loading to',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final d in dests)
                ChoiceChip(
                  key: Key('dest-${d.id}'),
                  label: Text(d.name),
                  selected: destination?.id == d.id,
                  onSelected: (_) => setState(() => destination = d),
                  labelStyle: const TextStyle(fontSize: 16),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                ),
            ],
          ),
          const SizedBox(height: 20),
          Text('Bay number (1–${c.master?.bays ?? '?'})',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          TextField(
            key: const Key('bay'),
            controller: bay,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
            decoration: const InputDecoration(hintText: '7'),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 20),
          Text('How full?', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          OccupancyPicker(
              value: occupancy,
              onChanged: (v) => setState(() => occupancy = v)),
          const SizedBox(height: 20),
          TextField(
            key: const Key('plate'),
            controller: plate,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(
                labelText: 'Number plate (optional)', hintText: 'GR 1234-20'),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            key: const Key('send'),
            onPressed: _valid && !c.busy ? _send : null,
            icon: const Icon(Icons.send),
            label: const Text('Send'),
          ),
        ],
      ),
    );
  }
}

class BoardScreen extends StatelessWidget {
  const BoardScreen({super.key, required this.controller});

  final TerminalController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    return RefreshIndicator(
      onRefresh: c.refreshBoard,
      child: c.board.isEmpty
          ? ListView(children: const [
              Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                      'Nothing is loading right now. Use "Report loading" when a car starts filling.',
                      textAlign: TextAlign.center))
            ])
          : ListView(
              padding: const EdgeInsets.all(8),
              children: [
                for (final e in c.board)
                  LoadingEntryTile(
                    entry: e,
                    trailing: PopupMenuButton<String>(
                      key: Key('menu-${e.reportId}'),
                      icon: const Icon(Icons.edit),
                      onSelected: (v) => v == 'departed'
                          ? c.update(e, departed: true)
                          : c.update(e, occupancy: int.parse(v)),
                      itemBuilder: (_) => [
                        for (var i = 0; i < occupancyLabels.length; i++)
                          PopupMenuItem(
                              value: '$i',
                              child: Text(
                                  'Now ${occupancyLabels[i].toLowerCase()}')),
                        const PopupMenuDivider(),
                        const PopupMenuItem(
                            value: 'departed', child: Text('Departed')),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }
}
