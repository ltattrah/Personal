/// Build-time configuration. Override with
/// `flutter run --dart-define=API_BASE_URL=https://transit.kstu.edu.gh`.
class AppConfig {
  AppConfig._();

  /// 10.0.2.2 is the host machine as seen from the Android emulator.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000',
  );

  /// USSD shortcode shown to users as the zero-data fallback.
  static const String ussdCode = String.fromEnvironment(
    'USSD_CODE',
    defaultValue: '*920*55#',
  );

  static const Duration requestTimeout = Duration(seconds: 12);
}
