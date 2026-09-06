# Kumasi Transit mobile apps

One Flutter codebase, two installable Android apps:

| App | Entry point | Flavor | Who | What |
| --- | --- | --- | --- | --- |
| **Kumasi Transit** (passenger) | `lib/main_passenger.dart` | `passenger` | anyone | pick terminal + destination → cars loading now, how full, fare in force; fares screen works offline |
| **Kumasi Transit Station** (terminal) | `lib/main_terminal.dart` | `terminal` | registered station masters | three-tap loading report (destination, bay, how full), live board with update/departed, offline queue |

Both talk only to the JSON API in `kumasi_transit/api/app.py`; the USSD service remains the
primary channel and both apps point users to the shortcode when they have no data.

## Offline-first behaviour

- Terminals, destinations and the fare table are cached on first successful load and used when
  the network is down (a yellow banner says so and how old the copy is).
- Live loading status is never cached: anything older than 20 minutes is worthless, so the
  passenger app asks for a live answer and otherwise suggests USSD.
- Station-master reports are written to a local queue first, sent immediately when possible, and
  otherwise flushed in order on "Send now", on app resume, or on the next report. Each queued
  report keeps its original time; the server uses it, so a report that finally arrives 30 minutes
  late is already expired rather than shown as fresh.
- Sign-in state survives restarts; a station master signs in once with a connection.

## Run and build

```bash
cd mobile
flutter pub get
flutter test                                   # 11 widget/unit tests with a fake API
flutter analyze

# Android emulator (10.0.2.2 = your laptop running `kumasi-transit serve`)
flutter run --flavor passenger -t lib/main_passenger.dart
flutter run --flavor terminal  -t lib/main_terminal.dart

# Real phone on the same Wi-Fi
flutter run --flavor terminal -t lib/main_terminal.dart --dart-define=API_BASE_URL=http://192.168.1.20:8000

# Release APKs (sign them first: android/app/build.gradle.kts release signingConfig)
flutter build apk --flavor passenger -t lib/main_passenger.dart --dart-define=API_BASE_URL=https://transit.kstu.edu.gh
flutter build apk --flavor terminal  -t lib/main_terminal.dart  --dart-define=API_BASE_URL=https://transit.kstu.edu.gh
```

`--dart-define=USSD_CODE=*920*55#` sets the shortcode shown in the apps once one is bought.

The manifest allows cleartext HTTP for the laptop/pilot setup; serve the production API over HTTPS
and drop `android:usesCleartextTraffic` before release.

## Layout

```
lib/
  main_passenger.dart, main_terminal.dart   entry points
  src/config.dart                           API base URL / USSD code (--dart-define)
  src/models.dart                           Terminal, LoadingEntry, FareTable, StationMaster, PendingReport
  src/api/client.dart                       TransitApi interface + HttpTransitApi (NetworkException vs ApiException)
  src/storage/local_store.dart              SharedPreferences caches, sign-in, offline queue
  src/passenger/                            PassengerController + Find / Fares screens
  src/terminal/                             TerminalController + Login / Report / Board screens
  src/widgets/common.dart                   occupancy bar, loading tile, status banner
test/                                       fake_api.dart + passenger, terminal and model tests
```

## Trust model

The terminal app signs in with the station master's registered phone number only (the same
trust level as the USSD channel, where the aggregator vouches for the MSISDN). Before public
launch add an SMS one-time code through the aggregator on `GET /api/station-masters/{msisdn}`.
Passengers are never identified; the passenger app stores only its last terminal choice.
