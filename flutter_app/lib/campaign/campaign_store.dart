import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'campaign.dart';

/// Guarda a campanha em andamento e o recorde no aparelho.
class CampaignStore {
  static const _kRun = 'campaign_run';
  static const _kBest = 'campaign_best';
  static const _kCrowns = 'campaign_crowns';

  static Future<CampaignRun?> loadRun() async {
    try {
      final p = await SharedPreferences.getInstance();
      final raw = p.getString(_kRun);
      if (raw == null) return null;
      return CampaignRun.fromJson(jsonDecode(raw) as Map);
    } catch (_) {
      return null; // formato antigo ou corrompido: começa do zero
    }
  }

  /// Salva a campanha e atualiza o recorde (maior corte vencida e
  /// campanhas completas).
  static Future<void> saveRun(CampaignRun? run) async {
    try {
      final p = await SharedPreferences.getInstance();
      if (run == null) {
        await p.remove(_kRun);
        return;
      }
      await p.setString(_kRun, jsonEncode(run.toJson()));
      final cleared = run.history.where((h) => h.won).length;
      if (cleared > (p.getInt(_kBest) ?? 0)) await p.setInt(_kBest, cleared);
    } catch (_) {}
  }

  static Future<void> addCrown() async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setInt(_kCrowns, (p.getInt(_kCrowns) ?? 0) + 1);
    } catch (_) {}
  }

  /// (cortes vencidas no recorde, campanhas completas)
  static Future<(int, int)> record() async {
    try {
      final p = await SharedPreferences.getInstance();
      return (p.getInt(_kBest) ?? 0, p.getInt(_kCrowns) ?? 0);
    } catch (_) {
      return (0, 0);
    }
  }
}
