import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Efeitos sonoros, gerados por `tool/make_sounds.py` em `assets/sounds/`.
enum Sfx {
  matchStrike('match_strike'),
  burnOut('burn_out'),
  turn('turn'),
  tick('tick'),
  income('income'),
  foreignAid('foreign_aid'),
  tax('tax'),
  steal('steal'),
  assassinate('assassinate'),
  exchange('exchange'),
  coup('coup'),
  blockContessa('block_contessa'),
  blockDuke('block_duke'),
  blockCaptain('block_captain'),
  blockAmbassador('block_ambassador'),
  proven('proven'),
  bluff('bluff'),
  challenge('challenge'),
  win('win'),
  lose('lose');

  const Sfx(this.file);
  final String file;
}

/// Toca os efeitos do jogo. Um tocador por som, carregado na primeira vez
/// que é usado; o som ligado ou desligado fica salvo no aparelho.
///
/// Falhas de áudio (navegador sem permissão de tocar antes do primeiro
/// toque, teste sem plugin) nunca derrubam o jogo: o som só não toca.
class Sounds {
  Sounds._();
  static final instance = Sounds._();

  static const _kOn = 'soundOn';

  /// Ligado ou desligado, para a UI escutar.
  final enabled = ValueNotifier<bool>(true);

  final Map<Sfx, AudioPlayer> _players = {};
  bool _loaded = false;

  /// Lê a preferência salva (chamar uma vez ao abrir o app).
  Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    try {
      final p = await SharedPreferences.getInstance();
      enabled.value = p.getBool(_kOn) ?? true;
    } catch (_) {}
  }

  Future<void> setEnabled(bool on) async {
    enabled.value = on;
    if (!on) {
      for (final p in _players.values) {
        _quiet(p.stop());
      }
    }
    try {
      final p = await SharedPreferences.getInstance();
      await p.setBool(_kOn, on);
    } catch (_) {}
  }

  void play(Sfx sfx, {double volume = 1}) {
    if (!enabled.value) return;
    _quiet(_play(sfx, volume));
  }

  Future<void> _play(Sfx sfx, double volume) async {
    final player = _players[sfx] ?? await _create(sfx);
    await player.stop();
    await player.setVolume(volume);
    await player.resume();
  }

  Future<AudioPlayer> _create(Sfx sfx) async {
    final player = AudioPlayer(playerId: 'sfx-${sfx.file}');
    _players[sfx] = player;
    await player.setReleaseMode(ReleaseMode.stop);
    await player.setSource(AssetSource('sounds/${sfx.file}.wav'));
    return player;
  }

  static void _quiet(Future<void> f) {
    f.catchError((Object e) {
      if (kDebugMode) debugPrint('[som] $e');
    });
  }
}
