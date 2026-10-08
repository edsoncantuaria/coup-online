import 'package:shared_preferences/shared_preferences.dart';

/// URL padrão do servidor. Defina no build com
/// `--dart-define=COUP_SERVER_URL=https://seu-servidor`.
const defaultServerUrl = String.fromEnvironment(
  'COUP_SERVER_URL',
  defaultValue: 'http://localhost:3000',
);

class Settings {
  static const _kName = 'playerName';
  static const _kServer = 'serverUrl';

  static Future<(String, String)> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      return (
        p.getString(_kName) ?? '',
        p.getString(_kServer) ?? defaultServerUrl,
      );
    } catch (_) {
      return ('', defaultServerUrl);
    }
  }

  static Future<void> save({String? name, String? server}) async {
    try {
      final p = await SharedPreferences.getInstance();
      if (name != null) await p.setString(_kName, name);
      if (server != null) await p.setString(_kServer, server);
    } catch (_) {}
  }
}
