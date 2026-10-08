import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../../game/game_controller.dart';
import '../../game/online_game_controller.dart';
import '../../game/voice_chat.dart';
import '../theme.dart';
import 'common.dart';
import 'voice_controls.dart';
import 'influence_card.dart';

// ---------------------------------------------------------------- log panel

class LogPanel extends StatelessWidget {
  const LogPanel({super.key, required this.logs});
  final List<String> logs;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Padding(
        padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Text(
          'REGISTRO DA CORTE',
          style: TextStyle(
            letterSpacing: 3,
            fontWeight: FontWeight.w800,
            fontSize: 12,
            color: CoupColors.gold,
          ),
        ),
      ),
      Expanded(
        child: ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          itemCount: logs.length,
          separatorBuilder: (_, _) =>
              const Divider(height: 1, color: CoupColors.border),
          itemBuilder: (_, i) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Text(
              logs[logs.length - 1 - i],
              style: TextStyle(
                fontSize: 12.5,
                color: i == 0 ? CoupColors.text : CoupColors.textSecondary,
              ),
            ),
          ),
        ),
      ),
    ],
  );
}

// ------------------------------------------------------------ flash overlay

/// Revelação dramática no centro da tela quando alguém prova (ou é pego
/// blefando) uma carta, ou perde uma influência.
class FlashReveal extends StatefulWidget {
  const FlashReveal({super.key, required this.state, required this.myId});
  final GameState state;
  final String myId;

  @override
  State<FlashReveal> createState() => _FlashRevealState();
}

class _FlashRevealState extends State<FlashReveal> {
  int? _seenReveal;
  int? _seenLoss;
  _Flash? _current;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // Não reapresenta eventos antigos ao abrir a tela.
    _seenReveal = widget.state.lastReveal?.stamp;
    _seenLoss = widget.state.lastLoss?.stamp;
  }

  @override
  void didUpdateWidget(covariant FlashReveal oldWidget) {
    super.didUpdateWidget(oldWidget);
    final s = widget.state;
    String n(String id, String name) => id == widget.myId ? 'Você' : name;
    _Flash? next;
    final r = s.lastReveal;
    final l = s.lastLoss;
    if (r != null && r.stamp != _seenReveal) {
      _seenReveal = r.stamp;
      _seenLoss = l?.stamp; // a faixa da mesa mostra a perda em seguida
      next = _Flash(
        r.role,
        r.proven ? 'PROVADO' : 'BLEFE!',
        r.proven
            ? '${n(r.playerId, r.playerName)} tinha ${roleLabel(r.role)}'
            : '${n(r.playerId, r.playerName)} não tinha ${roleLabel(r.role)}',
        r.proven ? CoupColors.success : CoupColors.bluff,
      );
    } else if (l != null && l.stamp != _seenLoss) {
      _seenLoss = l.stamp;
      next = _Flash(
        l.role,
        'INFLUÊNCIA PERDIDA',
        '${n(l.playerId, l.playerName)} revelou ${roleLabel(l.role)}',
        CoupColors.error,
        flipped: true,
      );
    }
    if (next != null) {
      if (r?.playerId == widget.myId || l?.playerId == widget.myId) {
        HapticFeedback.heavyImpact();
      }
      _timer?.cancel();
      _current = next;
      _timer = Timer(const Duration(milliseconds: 1700), () {
        if (mounted) setState(() => _current = null);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final f = _current;
    return IgnorePointer(
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 300),
        transitionBuilder: (child, anim) => FadeTransition(
          opacity: anim,
          child: ScaleTransition(
            scale: Tween(
              begin: 0.8,
              end: 1.0,
            ).animate(CurvedAnimation(parent: anim, curve: Curves.easeOutBack)),
            child: child,
          ),
        ),
        child: f == null
            ? const SizedBox.shrink(key: ValueKey('empty'))
            : Container(
                key: ValueKey(f.hashCode),
                color: Colors.black54,
                alignment: Alignment.center,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    InfluenceCard(role: f.role, width: 130, flipped: f.flipped),
                    const SizedBox(height: 16),
                    Text(
                      f.title,
                      style: TextStyle(
                        fontSize: 26,
                        letterSpacing: 4,
                        fontWeight: FontWeight.w900,
                        color: f.color,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      f.subtitle,
                      style: const TextStyle(
                        fontSize: 15,
                        color: CoupColors.text,
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}

class _Flash {
  _Flash(
    this.role,
    this.title,
    this.subtitle,
    this.color, {
    this.flipped = false,
  });
  final Role role;
  final String title;
  final String subtitle;
  final Color color;
  final bool flipped;
}

// ---------------------------------------------------------------- game over

class GameOverPanel extends StatelessWidget {
  const GameOverPanel({
    super.key,
    required this.state,
    required this.controller,
    this.onContinue,
    this.continueLabel = 'Continuar',
  });
  final GameState state;
  final GameController controller;

  /// Substitui "Menu" e "Jogar de novo" por um único botão (campanha).
  final VoidCallback? onContinue;
  final String continueLabel;

  @override
  Widget build(BuildContext context) {
    final winner = state.playerById(state.winner);
    final iWon = winner?.id == controller.myId;
    final stats = state.matchStats?.perPlayer ?? const {};
    final online = controller is OnlineGameController;
    final canRestart = !online || (controller as OnlineGameController).amHost;
    final ranking = [...state.players]
      ..sort((a, b) {
        if (a.id == state.winner) return -1;
        if (b.id == state.winner) return 1;
        final ra = stats[a.id]?.eliminatedAtRound ?? 999;
        final rb = stats[b.id]?.eliminatedAtRound ?? 999;
        return rb.compareTo(ra);
      });

    return Container(
      color: Colors.black.withValues(alpha: 0.78),
      alignment: Alignment.center,
      padding: const EdgeInsets.all(20),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 440),
        decoration: BoxDecoration(
          color: CoupColors.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
            color: iWon ? CoupColors.gold : CoupColors.red,
            width: 1.5,
          ),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                iWon ? Icons.emoji_events : Icons.sentiment_dissatisfied,
                size: 56,
                color: iWon ? CoupColors.goldHigh : CoupColors.error,
              ),
              const SizedBox(height: 6),
              Text(
                iWon ? 'VITÓRIA!' : 'DERROTA',
                style: TextStyle(
                  fontSize: 28,
                  letterSpacing: 6,
                  fontWeight: FontWeight.w900,
                  color: iWon ? CoupColors.goldHigh : CoupColors.error,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                winner == null
                    ? 'Ninguém dominou a corte.'
                    : iWon
                    ? 'O reino agora é seu.'
                    : 'O reino agora pertence a ${winner.name}.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: CoupColors.textSecondary),
              ),
              if (state.matchStats != null) ...[
                const SizedBox(height: 4),
                Text(
                  '${state.matchStats!.round} rodada${state.matchStats!.round > 1 ? 's' : ''}',
                  style: const TextStyle(
                    color: CoupColors.textMuted,
                    fontSize: 12,
                  ),
                ),
              ],
              const SizedBox(height: 18),
              for (final (i, p) in ranking.indexed)
                if (stats[p.id] != null)
                  _StatRow(
                    position: i + 1,
                    player: p,
                    stats: stats[p.id]!,
                    winner: p.id == state.winner,
                    me: p.id == controller.myId,
                  ),
              const SizedBox(height: 20),
              if (onContinue != null)
                FilledButton(onPressed: onContinue, child: Text(continueLabel))
              else
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.of(context).pop(),
                        child: const Text('Menu'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(
                        onPressed: canRestart ? controller.playAgain : null,
                        child: Text(
                          canRestart ? 'Jogar de novo' : 'Aguarde o anfitrião',
                        ),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({
    required this.position,
    required this.player,
    required this.stats,
    required this.winner,
    required this.me,
  });
  final int position;
  final Player player;
  final PlayerStats stats;
  final bool winner;
  final bool me;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 6),
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
    decoration: BoxDecoration(
      color: me ? CoupColors.gold.withValues(alpha: 0.08) : null,
      borderRadius: BorderRadius.circular(10),
    ),
    child: Row(
      children: [
        SizedBox(
          width: 20,
          child: Text(
            '$position',
            style: TextStyle(
              fontWeight: FontWeight.w900,
              color: winner ? CoupColors.goldHigh : CoupColors.textMuted,
            ),
          ),
        ),
        PlayerAvatar(player: player, size: 30),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                player.name,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              Text(
                'Desafios ${stats.challengesWon}/${stats.challengesMade} · '
                'Blefes ${stats.bluffsSurvived} · '
                'Moedas +${stats.coinsGained}',
                style: const TextStyle(
                  fontSize: 11,
                  color: CoupColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
        InfluencePips(player: player, revealAll: true),
      ],
    ),
  );
}

// -------------------------------------------------------------------- lobby

class LobbyView extends StatelessWidget {
  const LobbyView({super.key, required this.controller, this.voice});
  final OnlineGameController controller;
  final VoiceChat? voice;

  @override
  Widget build(BuildContext context) {
    final s = controller.state!;
    final code = controller.roomCode ?? '';
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              controller.roomName ?? 'Sala',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: CoupColors.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: CoupColors.goldSoft),
              ),
              child: Column(
                children: [
                  const Text(
                    'CÓDIGO DA SALA',
                    style: TextStyle(
                      letterSpacing: 2,
                      fontSize: 11,
                      color: CoupColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        code,
                        style: const TextStyle(
                          fontSize: 34,
                          letterSpacing: 8,
                          fontWeight: FontWeight.w900,
                          color: CoupColors.goldHigh,
                        ),
                      ),
                      IconButton(
                        tooltip: 'Copiar código',
                        icon: const Icon(Icons.copy, color: CoupColors.gold),
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: code));
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Código copiado')),
                          );
                        },
                      ),
                    ],
                  ),
                  const Text(
                    'Envie para seus amigos entrarem pela tela Online.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: CoupColors.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'NOBRES NA SALA (${s.players.length}/6)',
              style: const TextStyle(
                letterSpacing: 2,
                color: CoupColors.textMuted,
                fontSize: 11,
              ),
            ),
            const SizedBox(height: 8),
            for (final p in s.players)
              Card(
                color: CoupColors.surface,
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: PlayerAvatar(player: p, size: 36),
                  title: Text(p.name),
                  subtitle: Text(
                    p.id == controller.myId
                        ? 'Você'
                        : p.isBot
                        ? 'Bot · ${personalityLabel(p.personality ?? BotPersonality.balanced)}'
                        : 'Jogador',
                    style: const TextStyle(color: CoupColors.textSecondary),
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      VoiceBadge(muted: voice?.voiceOf(p.id), size: 14),
                      if (p.id == controller.hostId) ...[
                        const SizedBox(width: 8),
                        const Icon(Icons.star, color: CoupColors.gold),
                      ],
                    ],
                  ),
                ),
              ),
            if (voice != null && !voice!.joined) ...[
              const SizedBox(height: 4),
              TextButton.icon(
                onPressed: voice!.joining ? null : voice!.join,
                icon: const Icon(Icons.headset_mic_outlined),
                label: const Text('Entrar no chat de voz'),
              ),
            ],
            const SizedBox(height: 16),
            if (controller.amHost) ...[
              OutlinedButton.icon(
                onPressed: s.players.length < 6 ? controller.addBot : null,
                icon: const Icon(Icons.smart_toy_outlined),
                label: const Text('Adicionar bot'),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: controller.startGame,
                icon: const Icon(Icons.play_arrow),
                label: Text(
                  s.players.length < 2
                      ? 'Iniciar (entra 1 bot)'
                      : 'Iniciar partida',
                ),
              ),
            ] else
              const Padding(
                padding: EdgeInsets.all(12),
                child: Text(
                  'Aguardando o anfitrião iniciar a partida...',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: CoupColors.textSecondary),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
